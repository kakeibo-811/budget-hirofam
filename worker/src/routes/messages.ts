import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, exec } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.get('/', async (c) => {
  const { month } = c.req.query();
  const where = month ? `WHERE month = ?` : '';
  const params = month ? [month] : [];
  const rows = await selectAll(
    c.env.DB,
    `SELECT * FROM messages ${where} ORDER BY created_at DESC LIMIT 200`,
    params
  );
  const items = rows.map((r: any) => {
    const a = String(r.author || '').trim().toLowerCase();
    if (!a || a === 'dev@local' || a === 'unknown' || r.author === '夫婦メモ') return { ...r, author: '' };
    return r;
  });
  return c.json({ items });
});

app.post('/', async (c) => {
  const user = c.get('user');
  const b = await c.req.json<{ month: string; body: string; }>();
  const rawAuthor = user?.email || 'unknown';
  const author = rawAuthor === 'dev@local' || rawAuthor === 'unknown' ? '' : rawAuthor;
  const r = await c.env.DB.prepare(
    `INSERT INTO messages (month, author, body) VALUES (?, ?, ?)`
  ).bind(b.month, author, b.body).run();
  return c.json({ id: r.meta.last_row_id }, 201);
});

app.delete('/:id', async (c) => {
  await exec(c.env.DB, `DELETE FROM messages WHERE id = ?`, [Number(c.req.param('id'))]);
  return c.json({ ok: true });
});

export default app;
