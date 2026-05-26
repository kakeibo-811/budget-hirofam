import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, selectOne, exec } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

type DbColumn = { name: string };
let schemaReady: Promise<void> | null = null;

async function tableColumns(db: D1Database, table: string): Promise<Set<string>> {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<DbColumn>();
  return new Set((result.results || []).map((r) => String(r.name)));
}

async function addColumnIfMissing(db: D1Database, table: string, existing: Set<string>, name: string, definition: string) {
  if (existing.has(name)) return;
  await db.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();
  existing.add(name);
}

async function ensureIncomeSchema(db: D1Database) {
  // Phase18以前のPreview D1でも収入タブが落ちないよう、必要な列だけ安全に追加する。
  // DROP/DELETEなし。既存データは変更しない。
  if (!schemaReady) {
    schemaReady = (async () => {
      const incomeCols = await tableColumns(db, 'incomes');
      await addColumnIfMissing(db, 'incomes', incomeCols, 'archived_at', 'TEXT');
      await addColumnIfMissing(db, 'incomes', incomeCols, 'updated_at', 'TEXT');

      const recurringCols = await tableColumns(db, 'recurring_incomes');
      await addColumnIfMissing(db, 'recurring_incomes', recurringCols, 'archived_at', 'TEXT');
      await addColumnIfMissing(db, 'recurring_incomes', recurringCols, 'updated_at', 'TEXT');
    })().catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  await schemaReady;
}


function normalizeKind(v: any): 'salary' | 'bonus' | 'other' {
  const s = String(v || '').toLowerCase();
  return s === 'salary' || s === 'bonus' ? s : 'other';
}
function normalizeOwner(v: any): 'toshi' | 'lisa' {
  return String(v || '').toLowerCase() === 'lisa' ? 'lisa' : 'toshi';
}
function amount(v: any): number {
  const n = Number(String(v ?? '').replace(/[￥¥,，\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : 0;
}
function decoratedDescription(kind: any, description: any): string | null {
  const raw = String(description || '').trim();
  const k = String(kind || '').toLowerCase();
  if (['side', 'temporary'].includes(k)) return `${k}: ${raw}`.trim();
  return raw || null;
}

app.get('/', async (c) => {
  await ensureIncomeSchema(c.env.DB);
  const { owner, month } = c.req.query();
  const where: string[] = ['archived_at IS NULL'];
  const params: any[] = [];
  if (owner) { where.push('owner = ?'); params.push(owner); }
  if (month) { where.push("strftime('%Y-%m', date) = ?"); params.push(month); }
  const rows = await selectAll(
    c.env.DB,
    `SELECT * FROM incomes WHERE ${where.join(' AND ')} ORDER BY date DESC, id DESC LIMIT 1000`,
    params
  );
  return c.json({ items: rows });
});

app.get('/recurring', async (c) => {
  await ensureIncomeSchema(c.env.DB);
  const rows = await selectAll(
    c.env.DB,
    `SELECT * FROM recurring_incomes WHERE active = 1 AND archived_at IS NULL ORDER BY owner ASC, pay_day ASC, id ASC`
  );
  return c.json({ items: rows });
});

app.post('/', async (c) => {
  await ensureIncomeSchema(c.env.DB);
  const b = await c.req.json<any>();
  const dbKind = normalizeKind(b.kind);
  const desc = decoratedDescription(b.kind, b.description);
  const amt = amount(b.amount);
  if (!b.date || amt <= 0) return c.json({ error: 'date and positive amount are required' }, 400);
  const r = await c.env.DB.prepare(
    `INSERT INTO incomes (date, amount, owner, kind, description, note)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(String(b.date), amt, normalizeOwner(b.owner), dbKind, desc, b.note ?? null).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

app.post('/recurring', async (c) => {
  await ensureIncomeSchema(c.env.DB);
  const b = await c.req.json<any>();
  const amt = amount(b.amount);
  const payDay = Math.max(1, Math.min(31, Number(b.pay_day || 1)));
  if (!String(b.name || '').trim() || amt <= 0) return c.json({ error: 'name and positive amount are required' }, 400);
  const r = await c.env.DB.prepare(
    `INSERT INTO recurring_incomes (name, owner, amount, pay_day, kind, note, active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`
  ).bind(String(b.name), normalizeOwner(b.owner), amt, payDay, normalizeKind(b.kind), b.note ?? null).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

app.patch('/recurring/:id', async (c) => {
  await ensureIncomeSchema(c.env.DB);
  const id = Number(c.req.param('id'));
  const current = await selectOne<any>(c.env.DB, `SELECT * FROM recurring_incomes WHERE id = ? AND archived_at IS NULL`, [id]);
  if (!current) return c.json({ error: 'not found' }, 404);
  const b = await c.req.json<Record<string, any>>();
  const fields: string[] = [];
  const vals: any[] = [];
  if ('name' in b) { fields.push('name = ?'); vals.push(String(b.name || current.name)); }
  if ('owner' in b) { fields.push('owner = ?'); vals.push(normalizeOwner(b.owner)); }
  if ('amount' in b) { fields.push('amount = ?'); vals.push(amount(b.amount)); }
  if ('pay_day' in b) { fields.push('pay_day = ?'); vals.push(Math.max(1, Math.min(31, Number(b.pay_day || current.pay_day)))); }
  if ('kind' in b) { fields.push('kind = ?'); vals.push(normalizeKind(b.kind)); }
  if ('note' in b) { fields.push('note = ?'); vals.push(b.note || null); }
  if ('active' in b) { fields.push('active = ?'); vals.push(Number(Boolean(b.active))); }
  if (!fields.length) return c.json({ error: 'no fields' }, 400);
  await exec(c.env.DB, `UPDATE recurring_incomes SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...vals, id]);
  return c.json({ ok: true });
});

app.delete('/recurring/:id', async (c) => {
  await ensureIncomeSchema(c.env.DB);
  const id = Number(c.req.param('id'));
  await exec(c.env.DB, `UPDATE recurring_incomes SET active = 0, archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  return c.json({ ok: true });
});

app.patch('/:id', async (c) => {
  await ensureIncomeSchema(c.env.DB);
  const id = Number(c.req.param('id'));
  const current = await selectOne<any>(c.env.DB, `SELECT * FROM incomes WHERE id = ? AND archived_at IS NULL`, [id]);
  if (!current) return c.json({ error: 'not found' }, 404);
  const b = await c.req.json<Record<string, any>>();
  const fields: string[] = [];
  const vals: any[] = [];
  if ('date' in b) { fields.push('date = ?'); vals.push(String(b.date || current.date)); }
  if ('amount' in b) { fields.push('amount = ?'); vals.push(amount(b.amount)); }
  if ('owner' in b) { fields.push('owner = ?'); vals.push(normalizeOwner(b.owner)); }
  if ('kind' in b) { fields.push('kind = ?'); vals.push(normalizeKind(b.kind)); }
  if ('description' in b || 'kind' in b) { fields.push('description = ?'); vals.push(decoratedDescription(b.kind ?? current.kind, b.description ?? current.description)); }
  if ('note' in b) { fields.push('note = ?'); vals.push(b.note || null); }
  if (!fields.length) return c.json({ error: 'no fields' }, 400);
  await exec(c.env.DB, `UPDATE incomes SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...vals, id]);
  return c.json({ ok: true });
});

app.delete('/:id', async (c) => {
  await ensureIncomeSchema(c.env.DB);
  const id = Number(c.req.param('id'));
  await exec(c.env.DB, `UPDATE incomes SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  return c.json({ ok: true });
});

export default app;
