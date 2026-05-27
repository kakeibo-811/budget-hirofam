import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, exec } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

type EntityConfig = {
  table: string;
  label: string;
  idColumn: string;
  softDeleteColumn?: string;
  updatedAt?: boolean;
  defaultSort: string;
  allowedSort: string[];
  allowedUpdate: string[];
  selectSql: string;
  monthColumn?: string;
  sourceFilter?: boolean;
};

const ENTITIES: Record<string, EntityConfig> = {
  expenses: {
    table: 'expenses', label: 'Expenses', idColumn: 'id', softDeleteColumn: 'archived_at', updatedAt: true,
    defaultSort: 'date', allowedSort: ['date','amount','billing_month','cycle_month','payment_due_date','description','id'],
    allowedUpdate: ['date','amount','description','payer','paid_by','burden_owner','billing_month','cycle_month','payment_due_date','payment_method','card_id','category','note'],
    monthColumn: 'COALESCE(e.cycle_month, e.billing_month)', sourceFilter: true,
    selectSql: `SELECT e.id, e.date, e.amount, e.description, e.payer, e.paid_by, e.burden_owner, e.billing_month, e.cycle_month, e.payment_due_date, e.payment_method, e.card_id, c.name AS card_name, e.category, e.note, e.archived_at FROM expenses e LEFT JOIN cards c ON c.id = e.card_id`,
  },
  fixed_costs: {
    table: 'fixed_costs', label: 'Fixed costs', idColumn: 'id', softDeleteColumn: 'archived_at', updatedAt: true,
    defaultSort: 'sort_order', allowedSort: ['sort_order','name','amount','pay_day','id'],
    allowedUpdate: ['name','amount','owner','split','pay_day','paid_by','burden_owner','account_id','category','frequency','due_date','active_from_month','active_to_month','note','sort_order'],
    selectSql: `SELECT id, name, amount, owner, split, pay_day, paid_by, burden_owner, account_id, category, frequency, due_date, active_from_month, active_to_month, note, sort_order, archived_at FROM fixed_costs`,
  },
  scheduled_payments: {
    table: 'scheduled_payments', label: 'Scheduled payments', idColumn: 'id', softDeleteColumn: 'archived_at', updatedAt: true,
    defaultSort: 'sort_order', allowedSort: ['sort_order','name','amount','due_date','due_day','id'],
    allowedUpdate: ['name','amount','frequency','due_day','due_month','due_date','interval_years','recurrence_start_year','active_from_month','active_to_month','paid_by','burden_owner','split','account_id','category','active','note','sort_order'],
    selectSql: `SELECT id, name, amount, frequency, due_day, due_month, due_date, interval_years, recurrence_start_year, active_from_month, active_to_month, paid_by, burden_owner, split, account_id, category, active, note, sort_order, archived_at FROM scheduled_payments`,
  },
  incomes: {
    table: 'incomes', label: 'Incomes', idColumn: 'id', softDeleteColumn: 'archived_at', updatedAt: false,
    defaultSort: 'date', allowedSort: ['date','amount','owner','kind','id'],
    allowedUpdate: ['date','amount','owner','kind','description','note'],
    monthColumn: "strftime('%Y-%m', date)",
    selectSql: `SELECT id, date, amount, owner, kind, description, note, archived_at FROM incomes`,
  },
  cards: {
    table: 'cards', label: 'Cards', idColumn: 'id', softDeleteColumn: 'archived_at', updatedAt: true,
    defaultSort: 'sort_order', allowedSort: ['sort_order','name','owner','close_day','pay_day','id'],
    allowedUpdate: ['name','owner','close_day','pay_day','note','sort_order','card_kind','default_burden_owner','default_paid_by','billing_rule','rule_note'],
    selectSql: `SELECT id, name, owner, close_day, pay_day, note, sort_order, card_kind, default_burden_owner, default_paid_by, billing_rule, rule_note, archived_at FROM cards`,
  },
  accounts: {
    table: 'accounts', label: 'Accounts', idColumn: 'id', softDeleteColumn: 'archived_at', updatedAt: true,
    defaultSort: 'sort_order', allowedSort: ['sort_order','name','owner','kind','id'],
    allowedUpdate: ['name','owner','kind','note','sort_order'],
    selectSql: `SELECT id, name, owner, kind, note, sort_order, archived_at FROM accounts`,
  },
  settlement_adjustments: {
    table: 'settlement_adjustments', label: 'Settlement adjustments', idColumn: 'id', softDeleteColumn: 'archived_at', updatedAt: true,
    defaultSort: 'id', allowedSort: ['month','amount','direction','id'],
    allowedUpdate: ['month','direction','amount','description','note'],
    monthColumn: 'month',
    selectSql: `SELECT id, month, direction, amount, description, note, archived_at FROM settlement_adjustments`,
  },
  asset_events: {
    table: 'asset_rebuild_events', label: 'Asset events', idColumn: 'id', softDeleteColumn: 'archived_at', updatedAt: true,
    defaultSort: 'event_date', allowedSort: ['event_date','event_type','amount','owner','id'],
    allowedUpdate: ['event_date','event_type','owner','amount','description','note','source_type','source_id'],
    monthColumn: "substr(event_date, 1, 7)",
    selectSql: `SELECT id, event_date, event_type, owner, amount, description, note, source_type, source_id, archived_at FROM asset_rebuild_events`,
  },
  investments: {
    table: 'investment_holdings', label: 'Investments', idColumn: 'id', softDeleteColumn: 'archived_at', updatedAt: true,
    defaultSort: 'symbol', allowedSort: ['symbol','name','owner','quantity','manual_price','id'],
    allowedUpdate: ['symbol','name','market','owner','quantity','average_cost','manual_price','currency','note'],
    selectSql: `SELECT id, symbol, name, market, owner, quantity, average_cost, manual_price, currency, note, archived_at FROM investment_holdings`,
  },
};

function cfg(entity: string): EntityConfig | null { return ENTITIES[entity] || null; }
function ascDesc(input: string | undefined): 'ASC' | 'DESC' { return String(input || '').toLowerCase() === 'desc' ? 'DESC' : 'ASC'; }
function safeIds(value: any): number[] {
  return Array.isArray(value) ? value.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 500) : [];
}
function chunk<T>(arr: T[], size = 50): T[][] { const out: T[][] = []; for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size)); return out; }
function normalizeFields(conf: EntityConfig, fields: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of conf.allowedUpdate) if (Object.prototype.hasOwnProperty.call(fields, k) && fields[k] !== undefined && fields[k] !== '') out[k] = fields[k];
  return out;
}

app.get('/entities', (c) => c.json({ entities: Object.entries(ENTITIES).map(([key, v]) => ({ key, label: v.label, allowed_update: v.allowedUpdate, allowed_sort: v.allowedSort })) }));

app.get('/:entity', async (c) => {
  const entity = c.req.param('entity');
  const conf = cfg(entity);
  if (!conf) return c.json({ error: 'unsupported entity' }, 404);
  const q = c.req.query();
  const where: string[] = [];
  const params: any[] = [];
  if (conf.softDeleteColumn && q.include_archived !== 'true') where.push(`${conf.softDeleteColumn} IS NULL`);
  if (q.month && conf.monthColumn) { where.push(`${conf.monthColumn} = ?`); params.push(q.month); }
  if (entity === 'expenses' && q.source) {
    where.push(`e.id IN (SELECT expense_id FROM expense_import_keys WHERE source = ?${q.month ? ' AND target_month = ?' : ''})`);
    params.push(q.source);
    if (q.month) params.push(q.month);
  }
  const sort = conf.allowedSort.includes(String(q.sort || '')) ? String(q.sort) : conf.defaultSort;
  const order = ascDesc(q.order);
  const limit = Math.min(Math.max(1, Number(q.limit || 500)), 1000);
  const whereSql = where.length ? ` WHERE ${where.join(' AND ')}` : '';
  const rows = await selectAll(c.env.DB, `${conf.selectSql}${whereSql} ORDER BY ${sort} ${order}, ${conf.idColumn} ${order} LIMIT ?`, [...params, limit]);
  return c.json({ entity, items: rows, sort, order, limit });
});

app.post('/:entity/bulk-update', async (c) => {
  const entity = c.req.param('entity');
  const conf = cfg(entity);
  if (!conf) return c.json({ error: 'unsupported entity' }, 404);
  const b = await c.req.json<any>();
  if (!b.confirm) return c.json({ error: 'confirm is required' }, 400);
  const ids = safeIds(b.ids);
  const fields = normalizeFields(conf, b.fields || {});
  if (!ids.length) return c.json({ error: 'ids are required' }, 400);
  if (!Object.keys(fields).length) return c.json({ error: 'no allowed fields' }, 400);
  let updated = 0;
  for (const idsChunk of chunk(ids)) {
    const sets = Object.keys(fields).map((k) => `${k} = ?`);
    if (conf.updatedAt) sets.push(`updated_at = CURRENT_TIMESTAMP`);
    const placeholders = idsChunk.map(() => '?').join(',');
    const r = await exec(c.env.DB, `UPDATE ${conf.table} SET ${sets.join(', ')} WHERE ${conf.idColumn} IN (${placeholders})`, [...Object.values(fields), ...idsChunk]);
    updated += Number((r.meta as any)?.changes || 0);
  }
  await c.env.DB.prepare(`INSERT INTO bulk_operation_log (entity, operation, ids_json, fields_json, affected_count) VALUES (?, 'bulk_update', ?, ?, ?)`).bind(entity, JSON.stringify(ids), JSON.stringify(fields), updated).run();
  return c.json({ ok: true, entity, updated });
});

app.post('/:entity/bulk-delete', async (c) => {
  const entity = c.req.param('entity');
  const conf = cfg(entity);
  if (!conf) return c.json({ error: 'unsupported entity' }, 404);
  const b = await c.req.json<any>();
  if (!b.confirm) return c.json({ error: 'confirm is required' }, 400);
  const ids = safeIds(b.ids);
  if (!ids.length) return c.json({ error: 'ids are required' }, 400);
  let deleted = 0;
  for (const idsChunk of chunk(ids)) {
    const placeholders = idsChunk.map(() => '?').join(',');
    const sql = conf.softDeleteColumn
      ? `UPDATE ${conf.table} SET ${conf.softDeleteColumn} = CURRENT_TIMESTAMP${conf.updatedAt ? ', updated_at = CURRENT_TIMESTAMP' : ''} WHERE ${conf.idColumn} IN (${placeholders})`
      : `DELETE FROM ${conf.table} WHERE ${conf.idColumn} IN (${placeholders})`;
    const r = await exec(c.env.DB, sql, idsChunk);
    deleted += Number((r.meta as any)?.changes || 0);
  }
  await c.env.DB.prepare(`INSERT INTO bulk_operation_log (entity, operation, ids_json, fields_json, affected_count) VALUES (?, 'bulk_delete', ?, ?, ?)`).bind(entity, JSON.stringify(ids), null, deleted).run();
  return c.json({ ok: true, entity, deleted });
});

app.post('/expenses/delete-imported-month', async (c) => {
  const b = await c.req.json<any>();
  const source = String(b.source || '').trim();
  const month = String(b.month || b.target_month || '').trim();
  if (!b.confirm) return c.json({ error: 'confirm is required' }, 400);
  if (!source || !/^\d{4}-\d{2}$/.test(month)) return c.json({ error: 'source and month(YYYY-MM) are required' }, 400);
  const r = await exec(c.env.DB, `UPDATE expenses SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id IN (SELECT expense_id FROM expense_import_keys WHERE source = ? AND target_month = ?)`, [source, month]);
  const affected = Number((r.meta as any)?.changes || 0);
  await c.env.DB.prepare(`INSERT INTO bulk_operation_log (entity, operation, ids_json, fields_json, affected_count) VALUES ('expenses', 'delete_imported_month', ?, ?, ?)`).bind(JSON.stringify({ source, month }), null, affected).run();
  return c.json({ ok: true, source, month, deleted: affected });
});

export default app;
