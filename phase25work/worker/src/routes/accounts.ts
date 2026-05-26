import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, selectOne, exec } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get('/', async (c) => {
  const rows = await selectAll(
    c.env.DB,
    `SELECT * FROM accounts WHERE archived_at IS NULL ORDER BY sort_order ASC, id ASC`
  );
  return c.json({ items: rows });
});

// 口座残高履歴
app.get('/:id/balances', async (c) => {
  const id = Number(c.req.param('id'));
  const rows = await selectAll(
    c.env.DB,
    `SELECT * FROM account_balances WHERE account_id = ? ORDER BY as_of_date DESC LIMIT 240`,
    [id]
  );
  return c.json({ items: rows });
});

app.post('/', async (c) => {
  const b = await c.req.json<{
    name: string;
    owner: 'toshi' | 'lisa' | 'shared';
    kind: 'bank' | 'cash' | 'wallet' | 'paypal' | 'other';
    note?: string | null;
    sort_order?: number;
  }>();
  const r = await c.env.DB.prepare(
    `INSERT INTO accounts (name, owner, kind, note, sort_order) VALUES (?, ?, ?, ?, ?)`
  ).bind(b.name, b.owner, b.kind, b.note ?? null, b.sort_order ?? 0).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<Record<string, any>>();
  const allowed = ['name', 'owner', 'kind', 'note', 'sort_order'];
  const sets = allowed.filter((k) => k in b);
  if (sets.length === 0) return c.json({ error: 'no fields' }, 400);
  await exec(
    c.env.DB,
    `UPDATE accounts SET ${sets.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [...sets.map((k) => b[k]), id]
  );
  return c.json({ ok: true });
});

app.delete('/:id', async (c) => {
  await exec(
    c.env.DB,
    `UPDATE accounts SET archived_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [Number(c.req.param('id'))]
  );
  return c.json({ ok: true });
});

// 残高調整（記録）
app.post('/:id/adjust', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ as_of_date: string; balance: number; note?: string }>();
  const r = await c.env.DB.prepare(
    `INSERT INTO account_balances (account_id, as_of_date, balance, note) VALUES (?, ?, ?, ?)`
  ).bind(id, b.as_of_date, b.balance, b.note ?? null).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

export default app;
