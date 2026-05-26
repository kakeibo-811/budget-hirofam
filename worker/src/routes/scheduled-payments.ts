import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, selectOne, exec } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

type ScheduledPayment = {
  id: number;
  name: string;
  amount: number;
  frequency: string;
  due_day: number | null;
  due_month: number | null;
  due_date: string | null;
  interval_years: number | null;
  recurrence_start_year: number | null;
  paid_by: string;
  burden_owner: string;
  split: number;
  category: string | null;
  account_id: number | null;
  active: number;
  note: string | null;
  sort_order: number;
};

function cleanOwner(v: any): string {
  const s = String(v || '').trim().toLowerCase();
  const map: Record<string, string> = { '夫': 'toshi', husband: 'toshi', toshi: 'toshi', '妻': 'lisa', wife: 'lisa', lisa: 'lisa', '共同': 'shared', '折半': 'shared', shared: 'shared', other: 'other', 'その他': 'other' };
  return map[s] || map[String(v || '').trim()] || 'shared';
}

function cleanFrequency(v: any): string {
  const s = String(v || 'monthly').trim().toLowerCase();
  return ['monthly','once','yearly','every_3_years','every_5_years','irregular'].includes(s) ? s : 'monthly';
}

function intervalForFrequency(freq: string, input: any): number | null {
  const n = Number(input || 0);
  if (n > 0) return Math.round(n);
  if (freq === 'every_3_years') return 3;
  if (freq === 'every_5_years') return 5;
  return null;
}

function startYearFrom(input: any, dueDate: any): number | null {
  const n = Number(input || 0);
  if (n > 1900) return Math.round(n);
  const y = String(dueDate || '').slice(0, 4);
  const yn = Number(y);
  return yn > 1900 ? yn : null;
}

app.get('/', async (c) => {
  const rows = await selectAll<ScheduledPayment>(
    c.env.DB,
    `SELECT sp.*, a.name AS account_name
     FROM scheduled_payments sp
     LEFT JOIN accounts a ON a.id = sp.account_id
     WHERE sp.archived_at IS NULL
     ORDER BY sp.active DESC, sp.sort_order ASC, sp.id ASC`
  );
  return c.json({ items: rows });
});

app.post('/', async (c) => {
  const b = await c.req.json<any>();
  const paidBy = cleanOwner(b.paid_by || 'toshi');
  const burdenOwner = cleanOwner(b.burden_owner || (b.split ? 'shared' : 'shared'));
  const frequency = cleanFrequency(b.frequency || 'monthly');
  const intervalYears = intervalForFrequency(frequency, b.interval_years);
  const recurrenceStartYear = startYearFrom(b.recurrence_start_year, b.due_date);
  const r = await c.env.DB.prepare(
    `INSERT INTO scheduled_payments
     (name, amount, frequency, due_day, due_month, due_date, interval_years, recurrence_start_year, paid_by, burden_owner, split, category, account_id, active, note, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    String(b.name || '').trim(),
    Math.round(Number(b.amount || 0)),
    frequency,
    b.due_day ? Number(b.due_day) : null,
    b.due_month ? Number(b.due_month) : null,
    b.due_date || null,
    intervalYears,
    recurrenceStartYear,
    paidBy,
    burdenOwner,
    b.split ? 1 : 0,
    b.category || null,
    b.account_id ? Number(b.account_id) : null,
    b.active === false ? 0 : 1,
    b.note || null,
    b.sort_order ? Number(b.sort_order) : 0
  ).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<Record<string, any>>();
  if ('paid_by' in b) b.paid_by = cleanOwner(b.paid_by);
  if ('burden_owner' in b) b.burden_owner = cleanOwner(b.burden_owner);
  if ('frequency' in b) b.frequency = cleanFrequency(b.frequency);
  if ('interval_years' in b) b.interval_years = intervalForFrequency(b.frequency || '', b.interval_years);
  if ('recurrence_start_year' in b) b.recurrence_start_year = startYearFrom(b.recurrence_start_year, b.due_date);
  const allowed = ['name', 'amount', 'frequency', 'due_day', 'due_month', 'due_date', 'interval_years', 'recurrence_start_year', 'paid_by', 'burden_owner', 'split', 'category', 'account_id', 'active', 'note', 'sort_order'];
  const sets = allowed.filter((k) => k in b);
  if (sets.length === 0) return c.json({ error: 'no fields' }, 400);
  await exec(c.env.DB, `UPDATE scheduled_payments SET ${sets.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...sets.map((k) => b[k]), id]);
  return c.json({ ok: true });
});

app.delete('/:id', async (c) => {
  await exec(c.env.DB, `UPDATE scheduled_payments SET archived_at = CURRENT_TIMESTAMP WHERE id = ?`, [Number(c.req.param('id'))]);
  return c.json({ ok: true });
});

export default app;
