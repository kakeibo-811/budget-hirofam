import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, selectOne, exec, idempotentLink } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

type Owner = 'toshi' | 'lisa' | 'shared' | 'other';

type FixedMaster = {
  id: number;
  name: string;
  amount: number;
  owner: Owner;
  split: number;
  pay_day: number | null;
  paid_by?: Owner | null;
  burden_owner?: Owner | null;
  account_id?: number | null;
  category?: string | null;
  frequency?: string | null;
  due_date?: string | null;
  active_from_month?: string | null;
  active_to_month?: string | null;
  note?: string | null;
  sort_order: number;
  account_name?: string | null;
};

type FixedSnapshot = {
  id: number;
  fixed_cost_id: number;
  month: string;
  amount: number;
  locked: number;
  name: string;
  owner: Owner;
  split: number;
  pay_day: number | null;
  paid_by?: Owner | null;
  burden_owner?: Owner | null;
  account_id?: number | null;
  category?: string | null;
  payment_due_date?: string | null;
  synced_expense_id?: number | null;
};

function cleanOwner(v: any): Owner {
  const raw = String(v || '').trim();
  const s = raw.toLowerCase();
  const map: Record<string, Owner> = {
    '夫': 'toshi', '旦那': 'toshi', '主人': 'toshi', husband: 'toshi', toshi: 'toshi', t: 'toshi',
    '妻': 'lisa', wife: 'lisa', lisa: 'lisa', l: 'lisa',
    '共同': 'shared', '共通': 'shared', '折半': 'shared', shared: 'shared', joint: 'shared', split: 'shared',
    'その他': 'other', '対象外': 'other', other: 'other',
  };
  return map[raw] || map[s] || 'shared';
}

function cleanFrequency(v: any): string {
  const s = String(v || '').trim().toLowerCase();
  return ['monthly', 'once', 'yearly', 'every_3_years', 'every_5_years', 'irregular'].includes(s) ? s : 'monthly';
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function dueDateForMonth(month: string, day?: number | null): string {
  const [y, m] = month.split('-').map(Number);
  const safeDay = Math.min(Math.max(1, Number(day || 1)), daysInMonth(y, m));
  return `${month}-${String(safeDay).padStart(2, '0')}`;
}

function cycleMonthForDate(date: string, startDay = 25): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return String(date || '').slice(0, 7);
  const day = Number(date.slice(8, 10));
  if (day >= startDay) return date.slice(0, 7);
  const [y, m] = date.slice(0, 7).split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

function boolSplit(owner: Owner, split: any): 0 | 1 {
  if (owner === 'shared') return 1;
  return Number(split || 0) === 1 ? 1 : 0;
}

function cleanMonth(v: any): string | null {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

function activeInMonth(row: any, month: string): boolean {
  const from = String(row.active_from_month || '');
  const to = String(row.active_to_month || '');
  if (/^\d{4}-\d{2}$/.test(from) && month < from) return false;
  if (/^\d{4}-\d{2}$/.test(to) && month > to) return false;
  return true;
}

async function ensureSnapshots(db: D1Database, month: string): Promise<{ created: number }> {
  const masters = await selectAll<FixedMaster>(
    db,
    `SELECT * FROM fixed_costs WHERE archived_at IS NULL ORDER BY sort_order ASC, id ASC`
  );
  let created = 0;
  for (const m of masters) {
    if (!activeInMonth(m, month)) continue;
    const due = dueDateForMonth(month, m.pay_day || 1);
    const r = await db.prepare(
      `INSERT INTO fixed_cost_snapshots
       (fixed_cost_id, month, amount, locked, paid_by, burden_owner, payment_due_date)
       VALUES (?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT(fixed_cost_id, month) DO NOTHING`
    ).bind(
      m.id,
      month,
      Number(m.amount || 0),
      cleanOwner(m.paid_by || 'toshi'),
      cleanOwner(m.burden_owner || m.owner || 'shared'),
      due
    ).run();
    if ((r.meta?.changes ?? 0) > 0) created++;
  }
  return { created };
}

async function fixedOccurrences(db: D1Database, month: string): Promise<any[]> {
  await ensureSnapshots(db, month);
  return await selectAll<any>(
    db,
    `SELECT s.*, f.name, f.owner, f.split, f.pay_day, f.note, f.category, f.account_id,
            COALESCE(s.paid_by, f.paid_by, 'toshi') AS paid_by,
            COALESCE(s.burden_owner, f.burden_owner, f.owner, 'shared') AS burden_owner,
            COALESCE(s.payment_due_date, printf('%s-%02d', s.month, COALESCE(f.pay_day, 1))) AS due,
            a.name AS account_name,
            l.expense_id AS linked_expense_id
     FROM fixed_cost_snapshots s
     JOIN fixed_costs f ON f.id = s.fixed_cost_id
     LEFT JOIN accounts a ON a.id = f.account_id
     LEFT JOIN ledger_links l ON l.source_type = 'fixed_cost' AND l.source_id = s.id
     WHERE s.month = ? AND f.archived_at IS NULL
       AND (f.active_from_month IS NULL OR f.active_from_month = '' OR f.active_from_month <= ?)
       AND (f.active_to_month IS NULL OR f.active_to_month = '' OR f.active_to_month >= ?)
     ORDER BY due ASC, s.id ASC`,
    [month, month, month]
  );
}

app.get('/', async (c) => {
  const rows = await selectAll<FixedMaster>(
    c.env.DB,
    `SELECT f.*, a.name AS account_name
     FROM fixed_costs f
     LEFT JOIN accounts a ON a.id = f.account_id
     WHERE f.archived_at IS NULL
     ORDER BY f.sort_order ASC, f.id ASC`
  );
  return c.json({ items: rows });
});

app.get('/snapshots', async (c) => {
  const { month } = c.req.query();
  if (!month) return c.json({ error: 'month required (YYYY-MM)' }, 400);
  const rows = await fixedOccurrences(c.env.DB, month);
  return c.json({ items: rows });
});

app.get('/overview', async (c) => {
  const month = c.req.query('month');
  if (!month) return c.json({ error: 'month required (YYYY-MM)' }, 400);
  const [masters, snapshots, scheduled] = await Promise.all([
    selectAll<FixedMaster>(c.env.DB, `SELECT f.*, a.name AS account_name FROM fixed_costs f LEFT JOIN accounts a ON a.id = f.account_id WHERE f.archived_at IS NULL ORDER BY f.sort_order ASC, f.id ASC`),
    fixedOccurrences(c.env.DB, month),
    selectAll(c.env.DB, `SELECT sp.*, a.name AS account_name FROM scheduled_payments sp LEFT JOIN accounts a ON a.id = sp.account_id WHERE sp.archived_at IS NULL ORDER BY sp.active DESC, sp.sort_order ASC, sp.id ASC`),
  ]);
  const fixedTotal = snapshots.reduce((a, x: any) => a + Number(x.amount || 0), 0);
  const unsynced = snapshots.filter((x: any) => !x.linked_expense_id).length;
  return c.json({ masters, snapshots, scheduled, summary: { fixed_total: fixedTotal, unsynced } });
});

app.post('/', async (c) => {
  const b = await c.req.json<any>();
  const owner = cleanOwner(b.owner || b.burden_owner || 'shared');
  const paidBy = cleanOwner(b.paid_by || 'toshi');
  const burdenOwner = cleanOwner(b.burden_owner || owner);
  const split = boolSplit(burdenOwner || owner, b.split);
  const r = await c.env.DB.prepare(
    `INSERT INTO fixed_costs
    (name, amount, owner, split, pay_day, paid_by, burden_owner, account_id, category, frequency, due_date, active_from_month, active_to_month, note, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    String(b.name || '').trim(),
    Math.round(Number(b.amount || 0)),
    owner,
    split,
    b.pay_day ? Number(b.pay_day) : null,
    paidBy,
    burdenOwner,
    b.account_id ? Number(b.account_id) : null,
    b.category || 'fixed_cost',
    cleanFrequency(b.frequency || 'monthly'),
    b.due_date || null,
    cleanMonth(b.active_from_month),
    cleanMonth(b.active_to_month),
    b.note || null,
    b.sort_order ? Number(b.sort_order) : 0
  ).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<any>();

  if (b.mode === 'single') {
    if (!b.month) return c.json({ error: 'month required for single mode' }, 400);
    if (b.amount === undefined) return c.json({ error: 'amount required' }, 400);
    const master = await selectOne<FixedMaster>(c.env.DB, `SELECT * FROM fixed_costs WHERE id = ? AND archived_at IS NULL`, [id]);
    if (!master) return c.json({ error: 'fixed cost not found' }, 404);
    await c.env.DB.prepare(
      `INSERT INTO fixed_cost_snapshots
       (fixed_cost_id, month, amount, locked, paid_by, burden_owner, payment_due_date)
       VALUES (?, ?, ?, 0, ?, ?, ?)
       ON CONFLICT(fixed_cost_id, month) DO UPDATE SET
         amount = excluded.amount,
         paid_by = excluded.paid_by,
         burden_owner = excluded.burden_owner,
         payment_due_date = excluded.payment_due_date`
    ).bind(
      id,
      b.month,
      Math.round(Number(b.amount || 0)),
      cleanOwner(b.paid_by || master.paid_by || 'toshi'),
      cleanOwner(b.burden_owner || master.burden_owner || master.owner),
      b.payment_due_date || dueDateForMonth(b.month, master.pay_day || 1)
    ).run();
    return c.json({ ok: true, mode: 'single' });
  }

  const normalize: Record<string, (v: any) => any> = {
    name: (v) => String(v || '').trim(),
    amount: (v) => Math.round(Number(v || 0)),
    owner: cleanOwner,
    split: (v) => Number(v || 0) ? 1 : 0,
    pay_day: (v) => v ? Number(v) : null,
    paid_by: cleanOwner,
    burden_owner: cleanOwner,
    account_id: (v) => v ? Number(v) : null,
    category: (v) => String(v || 'fixed_cost'),
    frequency: cleanFrequency,
    due_date: (v) => v || null,
    active_from_month: cleanMonth,
    active_to_month: cleanMonth,
    note: (v) => v ?? null,
    sort_order: (v) => Number(v || 0),
  };
  const allowed = Object.keys(normalize);
  const sets = allowed.filter((k) => k in b);
  if (sets.length > 0) {
    await exec(
      c.env.DB,
      `UPDATE fixed_costs SET ${sets.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...sets.map((k) => normalize[k](b[k])), id]
    );
  }

  if (b.mode === 'forward' || b.mode === 'all') {
    if (b.mode === 'forward' && !b.month) return c.json({ error: 'month required for forward mode' }, 400);
    const params: any[] = [];
    const snapshotSets: string[] = [];
    if ('amount' in b) { snapshotSets.push('amount = ?'); params.push(Math.round(Number(b.amount || 0))); }
    if ('paid_by' in b) { snapshotSets.push('paid_by = ?'); params.push(cleanOwner(b.paid_by)); }
    if ('burden_owner' in b) { snapshotSets.push('burden_owner = ?'); params.push(cleanOwner(b.burden_owner)); }
    if (snapshotSets.length > 0) {
      params.push(id);
      let where = 'fixed_cost_id = ? AND locked = 0';
      if (b.mode === 'forward') { where += ' AND month >= ?'; params.push(b.month); }
      await c.env.DB.prepare(`UPDATE fixed_cost_snapshots SET ${snapshotSets.join(', ')} WHERE ${where}`).bind(...params).run();
    }
  }
  return c.json({ ok: true, mode: b.mode || 'master' });
});

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  await exec(c.env.DB, `UPDATE fixed_costs SET archived_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  return c.json({ ok: true });
});

app.post('/snapshots/generate', async (c) => {
  const b = await c.req.json<{ month: string }>();
  if (!b.month) return c.json({ error: 'month required' }, 400);
  const result = await ensureSnapshots(c.env.DB, b.month);
  return c.json({ ok: true, ...result });
});

app.post('/sync-month', async (c) => {
  const b = await c.req.json<{ month: string }>();
  if (!b.month) return c.json({ error: 'month required' }, 400);
  const snapshots = await fixedOccurrences(c.env.DB, b.month);
  let created = 0;
  let skipped = 0;
  const details: any[] = [];
  for (const s of snapshots) {
    const sourceId = Number(s.id);
    const existing = await selectOne<{ id: number; expense_id: number }>(
      c.env.DB,
      `SELECT id, expense_id FROM ledger_links WHERE source_type = 'fixed_cost' AND source_id = ? AND owner = ? AND month = ?`,
      [sourceId, cleanOwner(s.burden_owner), b.month]
    );
    if (existing) { skipped++; details.push({ snapshot_id: sourceId, action: 'skipped', expense_id: existing.expense_id }); continue; }
    const due = s.payment_due_date || dueDateForMonth(b.month, s.pay_day || 1);
    const burden = cleanOwner(s.burden_owner || s.owner);
    const paidBy = cleanOwner(s.paid_by || 'toshi');
    const amount = Math.round(Number(s.amount || 0));
    const r = await c.env.DB.prepare(
      `INSERT INTO expenses
       (date, amount, description, payer, billing_month, card_id, category, note, paid_by, burden_owner, settlement_role, payment_due_date, cycle_month)
       VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, 'fixed_cost_sync', ?, ?)`
    ).bind(
      due,
      amount,
      s.name,
      burden,
      b.month,
      s.category || 'fixed_cost',
      `AUTO_FIXED_COST_SYNC snapshot_id=${sourceId}`,
      paidBy,
      burden,
      due,
      cycleMonthForDate(due)
    ).run();
    const expenseId = Number(r.meta.last_row_id);
    await idempotentLink(c.env.DB, { source_type: 'fixed_cost', source_id: sourceId, owner: burden, month: b.month, amount, expense_id: expenseId });
    await c.env.DB.prepare(`UPDATE fixed_cost_snapshots SET synced_expense_id = ? WHERE id = ?`).bind(expenseId, sourceId).run();
    created++;
    details.push({ snapshot_id: sourceId, action: 'created', expense_id: expenseId });
  }
  return c.json({ ok: true, month: b.month, created, skipped, details });
});

export default app;
