import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, selectOne, exec } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

type Owner = 'toshi' | 'lisa' | 'shared' | 'other';
function owner(v: any): Owner {
  const s = String(v || '').trim().toLowerCase();
  const map: Record<string, Owner> = { '夫': 'toshi', husband: 'toshi', toshi: 'toshi', '妻': 'lisa', wife: 'lisa', lisa: 'lisa', '共同': 'shared', shared: 'shared', joint: 'shared', 'その他': 'other', other: 'other' };
  return map[s] || 'shared';
}
function money(v: any): number {
  const n = Number(String(v ?? '').replace(/[￥¥,，\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function normSymbol(symbol: string, market?: string): string {
  const s = String(symbol || '').trim().toUpperCase();
  if (!s) return '';
  if ((market || '').toUpperCase() === 'TYO' && /^\d{4}$/.test(s)) return `${s}.T`;
  return s;
}

async function getLatestManualOrSnapshot(db: D1Database, id: number, manual: number | null | undefined) {
  if (manual && Number(manual) > 0) return { price: Number(manual), source: 'manual' };
  const snap = await selectOne<{ price: number; source: string }>(db, `SELECT price, source FROM investment_price_snapshots WHERE holding_id = ? ORDER BY as_of DESC, id DESC LIMIT 1`, [id]);
  return snap ? { price: Number(snap.price || 0), source: snap.source || 'snapshot' } : { price: 0, source: 'none' };
}

app.get('/', async (c) => {
  const rows = await selectAll<any>(c.env.DB, `SELECT * FROM investment_holdings WHERE archived_at IS NULL ORDER BY owner ASC, symbol ASC, id ASC`);
  const items = [];
  for (const r of rows) {
    const latest = await getLatestManualOrSnapshot(c.env.DB, r.id, r.manual_price);
    const value = Number(r.quantity || 0) * Number(latest.price || 0);
    const cost = Number(r.quantity || 0) * Number(r.average_cost || 0);
    items.push({ ...r, latest_price: latest.price, price_source: latest.source, market_value: Math.round(value), unrealized_pl: Math.round(value - cost) });
  }
  return c.json({ items });
});

app.get('/summary', async (c) => {
  const rows = await selectAll<any>(c.env.DB, `SELECT * FROM investment_holdings WHERE archived_at IS NULL`);
  let total = 0, cost = 0;
  const byOwner: Record<string, number> = { toshi: 0, lisa: 0, shared: 0, other: 0 };
  for (const r of rows) {
    const latest = await getLatestManualOrSnapshot(c.env.DB, r.id, r.manual_price);
    const value = Math.round(Number(r.quantity || 0) * Number(latest.price || 0));
    total += value;
    cost += Math.round(Number(r.quantity || 0) * Number(r.average_cost || 0));
    byOwner[owner(r.owner)] += value;
  }
  return c.json({ total, cost, unrealized_pl: total - cost, by_owner: byOwner, count: rows.length });
});

app.post('/', async (c) => {
  const b = await c.req.json<any>();
  const symbol = String(b.symbol || '').trim();
  if (!symbol) return c.json({ error: 'symbol is required' }, 400);
  const r = await c.env.DB.prepare(`INSERT INTO investment_holdings (symbol, name, market, owner, quantity, average_cost, manual_price, currency, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(symbol, b.name || null, b.market || 'TYO', owner(b.owner), Number(b.quantity || 0), b.average_cost == null ? null : money(b.average_cost), b.manual_price == null ? null : money(b.manual_price), b.currency || 'JPY', b.note || null).run();
  return c.json({ ok: true, id: r.meta.last_row_id }, 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<any>();
  const allowed = ['symbol','name','market','quantity','average_cost','manual_price','currency','note'];
  const sets: string[] = [];
  const vals: any[] = [];
  for (const k of allowed) if (k in b) { sets.push(`${k} = ?`); vals.push(k.includes('cost') || k.includes('price') || k === 'quantity' ? (b[k] == null || b[k] === '' ? null : money(b[k])) : b[k]); }
  if ('owner' in b) { sets.push('owner = ?'); vals.push(owner(b.owner)); }
  if (!sets.length) return c.json({ error: 'no fields' }, 400);
  await exec(c.env.DB, `UPDATE investment_holdings SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...vals, id]);
  return c.json({ ok: true });
});

app.delete('/:id', async (c) => {
  await exec(c.env.DB, `UPDATE investment_holdings SET archived_at = CURRENT_TIMESTAMP WHERE id = ?`, [Number(c.req.param('id'))]);
  return c.json({ ok: true });
});

app.post('/:id/price', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<any>();
  const h = await selectOne<any>(c.env.DB, `SELECT * FROM investment_holdings WHERE id = ? AND archived_at IS NULL`, [id]);
  if (!h) return c.json({ error: 'holding not found' }, 404);
  const price = money(b.price);
  if (price <= 0) return c.json({ error: 'price must be positive' }, 400);
  await c.env.DB.prepare(`INSERT INTO investment_price_snapshots (holding_id, symbol, market, price, currency, source) VALUES (?, ?, ?, ?, ?, ?)`)
    .bind(id, h.symbol, h.market, price, b.currency || h.currency || 'JPY', b.source || 'manual').run();
  await exec(c.env.DB, `UPDATE investment_holdings SET manual_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [price, id]);
  return c.json({ ok: true });
});

app.post('/:id/refresh', async (c) => {
  const id = Number(c.req.param('id'));
  const h = await selectOne<any>(c.env.DB, `SELECT * FROM investment_holdings WHERE id = ? AND archived_at IS NULL`, [id]);
  if (!h) return c.json({ error: 'holding not found' }, 404);
  const symbol = normSymbol(h.symbol, h.market);
  if (!symbol) return c.json({ error: 'symbol is required' }, 400);
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`quote fetch failed ${res.status}`);
    const data: any = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice || meta?.previousClose || 0);
    const currency = String(meta?.currency || h.currency || 'JPY');
    if (!Number.isFinite(price) || price <= 0) throw new Error('price not available');
    await c.env.DB.prepare(`INSERT INTO investment_price_snapshots (holding_id, symbol, market, price, currency, source) VALUES (?, ?, ?, ?, ?, ?)`)
      .bind(id, h.symbol, h.market, price, currency, 'yahoo_finance_chart').run();
    await exec(c.env.DB, `UPDATE investment_holdings SET manual_price = ?, currency = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [price, currency, id]);
    return c.json({ ok: true, symbol, price, currency, source: 'yahoo_finance_chart' });
  } catch (e) {
    return c.json({ ok: false, error: String(e), hint: 'Yahoo lookup is best-effort. Enter manual_price if unavailable.' }, 502);
  }
});

export default app;
