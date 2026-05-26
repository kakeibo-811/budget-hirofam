import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, selectOne, exec } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get('/', async (c) => {
  const rows = await selectAll(
    c.env.DB,
    `SELECT * FROM cards WHERE archived_at IS NULL ORDER BY sort_order ASC, id ASC`
  );
  return c.json({ items: rows });
});

app.get('/:id', async (c) => {
  const row = await selectOne(c.env.DB, `SELECT * FROM cards WHERE id = ?`, [Number(c.req.param('id'))]);
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(row);
});

app.post('/', async (c) => {
  const b = await c.req.json<any>();
  const r = await c.env.DB.prepare(
    `INSERT INTO cards (name, owner, close_day, pay_day, note, sort_order, card_kind, default_burden_owner, default_paid_by, billing_rule, rule_note)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    b.name,
    b.owner || 'toshi',
    Number(b.close_day || 31),
    Number(b.pay_day || 27),
    b.note ?? null,
    b.sort_order ?? 0,
    b.card_kind || 'credit',
    b.default_burden_owner || 'shared',
    b.default_paid_by || 'toshi',
    b.billing_rule || 'payment_month',
    b.rule_note || null
  ).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<Record<string, any>>();
  const allowed = ['name', 'owner', 'close_day', 'pay_day', 'note', 'sort_order', 'card_kind', 'default_burden_owner', 'default_paid_by', 'billing_rule', 'rule_note'];
  const sets = allowed.filter((k) => k in b);
  if (sets.length === 0) return c.json({ error: 'no fields' }, 400);
  await exec(
    c.env.DB,
    `UPDATE cards SET ${sets.map((k) => `${k} = ?`).join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [...sets.map((k) => b[k]), id]
  );
  return c.json({ ok: true });
});

app.delete('/:id', async (c) => {
  await exec(c.env.DB, `UPDATE cards SET archived_at = CURRENT_TIMESTAMP WHERE id = ?`, [Number(c.req.param('id'))]);
  return c.json({ ok: true });
});

export default app;
