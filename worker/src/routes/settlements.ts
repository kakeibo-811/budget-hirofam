import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, selectOne, exec } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
type Owner = 'toshi' | 'lisa' | 'shared' | 'other';
function owner(v: any): Owner {
  const s = String(v || '').trim().toLowerCase();
  const map: Record<string, Owner> = { '夫': 'toshi', husband: 'toshi', toshi: 'toshi', '妻': 'lisa', wife: 'lisa', lisa: 'lisa', '共同': 'shared', '折半': 'shared', shared: 'shared', joint: 'shared', 'その他': 'other', other: 'other' };
  return map[s] || 'other';
}
function half(n: number): number { return Math.round((Number(n) || 0) / 2); }
function money(v: any): number { const n = Number(String(v ?? '').replace(/[￥¥,，\s]/g, '')); return Number.isFinite(n) ? Math.round(n) : 0; }

function compactText(v: any): string {
  return String(v || '').toLowerCase().replace(/[\s_\-　・．\.／\/（）()「」『』【】\[\]:：,，]/g, '');
}

function plannedMatchesExpense(plan: any, expenses: any[]): boolean {
  const amount = Number(plan.amount || 0);
  if (!amount) return false;
  const paidBy = owner(plan.paid_by || 'toshi');
  const burden = owner(plan.burden_owner || plan.owner || 'shared');
  const name = compactText(plan.name || plan.description || '');
  const category = compactText(plan.category || '');
  return expenses.some((e) => {
    if (Number(e.amount || 0) !== amount) return false;
    if (owner(e.paid_by || (e.card_id ? 'toshi' : e.payer)) !== paidBy) return false;
    if (owner(e.burden_owner || e.payer) !== burden) return false;
    const desc = compactText(e.description || '');
    const cat = compactText(e.category || '');
    if (name && desc && (desc.includes(name) || name.includes(desc))) return true;
    if (category && cat && category === cat) return true;
    if (category && ['fixedcost','scheduledpayment','propertytax','earthquakeinsurance','fireinsurance','insurance','tax'].includes(category)) return true;
    return false;
  });
}


function scheduledOccursInMonth(sp: any, month: string): boolean {
  const [year, monthNum] = month.split('-').map(Number);
  const freq = String(sp.frequency || 'monthly').toLowerCase();
  if (freq === 'monthly') return true;
  if (freq === 'yearly') return Number(sp.due_month || 0) === monthNum;
  if (freq === 'once' || freq === 'irregular') return String(sp.due_date || '').startsWith(month);
  const interval = freq === 'every_3_years' ? 3 : freq === 'every_5_years' ? 5 : Number(sp.interval_years || 0);
  if (!interval) return false;
  const dueMonth = Number(sp.due_month || (sp.due_date ? String(sp.due_date).slice(5, 7) : 0));
  if (dueMonth !== monthNum) return false;
  const startYear = Number(sp.recurrence_start_year || (sp.due_date ? String(sp.due_date).slice(0, 4) : 2026));
  return year >= startYear && (year - startYear) % interval === 0;
}

async function settlementForMonth(db: D1Database, month: string) {
  const expenses = await selectAll<any>(db, `SELECT e.*, c.name AS card_name FROM expenses e LEFT JOIN cards c ON c.id = e.card_id
     WHERE e.archived_at IS NULL AND COALESCE(e.cycle_month, e.billing_month) = ?
       AND LOWER(COALESCE(e.category, '')) NOT IN ('loan', 'loan_repayment')
       AND NOT EXISTS (SELECT 1 FROM ledger_links l WHERE l.expense_id = e.id AND l.source_type IN ('loan_repayment','transfer'))
     ORDER BY COALESCE(e.payment_due_date, e.date) ASC, e.id ASC`, [month]);
  const fixedRaw = await selectAll<any>(db, `SELECT s.id, s.month, s.amount, s.payment_due_date AS date, f.name, f.owner, f.split, f.category,
       COALESCE(s.paid_by, f.paid_by, 'toshi') AS paid_by,
       COALESCE(s.burden_owner, f.burden_owner, f.owner, 'shared') AS burden_owner
     FROM fixed_cost_snapshots s JOIN fixed_costs f ON f.id = s.fixed_cost_id
     WHERE s.month = ? AND f.archived_at IS NULL
       AND NOT EXISTS (SELECT 1 FROM ledger_links l WHERE l.source_type = 'fixed_cost' AND l.source_id = s.id)
     ORDER BY COALESCE(s.payment_due_date, printf('%s-%02d', s.month, COALESCE(f.pay_day, 1))) ASC`, [month]);
  const fixed = fixedRaw.filter((f) => !plannedMatchesExpense(f, expenses));
  const allScheduled = await selectAll<any>(db, `SELECT * FROM scheduled_payments
     WHERE archived_at IS NULL AND active = 1
     ORDER BY sort_order ASC, id ASC`);
  const scheduled = allScheduled.filter((sp) => scheduledOccursInMonth(sp, month)).filter((sp) => !plannedMatchesExpense(sp, expenses));
  const adjustments = await selectAll<any>(db, `SELECT * FROM settlement_adjustments WHERE month = ? AND archived_at IS NULL ORDER BY created_at ASC, id ASC`, [month]);

  let toshiPaid = 0, lisaPaid = 0, sharedPaid = 0, splitTotal = 0, wifePersonal = 0, husbandPersonal = 0, wifeDueGross = 0, husbandDueGross = 0, adjustmentNet = 0;
  const lines: any[] = [];
  function addLine(kind: string, raw: any, amount: number, paidBy: Owner, burden: Owner, split = false) {
    if (paidBy === 'toshi') toshiPaid += amount; else if (paidBy === 'lisa') lisaPaid += amount; else if (paidBy === 'shared') sharedPaid += amount;
    if (burden === 'shared' || split) splitTotal += amount;
    if (burden === 'lisa') wifePersonal += amount;
    if (burden === 'toshi') husbandPersonal += amount;
    if (paidBy === 'toshi') {
      if (burden === 'lisa') wifeDueGross += amount;
      if (burden === 'shared' || split) wifeDueGross += half(amount);
    }
    if (paidBy === 'lisa') {
      if (burden === 'toshi') husbandDueGross += amount;
      if (burden === 'shared' || split) husbandDueGross += half(amount);
    }
    lines.push({ kind, amount, paid_by: paidBy, burden_owner: burden, split, ...raw });
  }
  for (const e of expenses) addLine('expense', { id: e.id, date: e.payment_due_date || e.date, description: e.description, card_name: e.card_name, category: e.category, source_id: e.id }, Number(e.amount || 0), owner(e.paid_by || (e.card_id ? 'toshi' : e.payer)), owner(e.burden_owner || e.payer), owner(e.burden_owner || e.payer) === 'shared');
  for (const f of fixed) addLine('fixed', { id: f.id, date: f.date, description: f.name, category: f.category, source_id: f.id }, Number(f.amount || 0), owner(f.paid_by), owner(f.burden_owner), Number(f.split || 0) === 1);
  for (const s of scheduled) addLine('scheduled', { id: s.id, date: s.due_date || (s.due_day ? `${month}-${String(s.due_day).padStart(2,'0')}` : month), description: s.name, category: s.category, source_id: s.id }, Number(s.amount || 0), owner(s.paid_by), owner(s.burden_owner), Number(s.split || 0) === 1);
  for (const a of adjustments) {
    const amt = Number(a.amount || 0);
    adjustmentNet += a.direction === 'lisa_to_toshi' ? amt : a.direction === 'toshi_to_lisa' ? -amt : 0;
    lines.push({ kind: 'adjustment', ...a, date: a.created_at?.slice(0,10), description: a.description, amount: amt });
  }
  const baseNet = wifeDueGross - husbandDueGross;
  const net = baseNet + adjustmentNet;
  const amount = Math.abs(net);
  const direction = net > 0 ? 'lisa_to_toshi' : net < 0 ? 'toshi_to_lisa' : 'none';
  return {
    month,
    summary: { total: expenses.reduce((a, x) => a + Number(x.amount || 0), 0) + fixed.reduce((a, x) => a + Number(x.amount || 0), 0) + scheduled.reduce((a, x) => a + Number(x.amount || 0), 0), toshi_paid: toshiPaid, lisa_paid: lisaPaid, shared_pot_paid: sharedPaid, split_total: splitTotal, split_each: half(splitTotal), wife_personal: wifePersonal, husband_personal: husbandPersonal, wife_due_gross: wifeDueGross, husband_due_gross: husbandDueGross, adjustment_net: adjustmentNet, direction, amount, lisa_to_toshi: Math.max(0, net), toshi_to_lisa: Math.max(0, -net) },
    lines,
    adjustments,
  };
}

app.get('/:month', async (c) => c.json(await settlementForMonth(c.env.DB, c.req.param('month'))));

app.post('/:month/adjustments', async (c) => {
  const month = c.req.param('month');
  const b = await c.req.json<any>();
  const direction = ['lisa_to_toshi','toshi_to_lisa','none'].includes(String(b.direction)) ? String(b.direction) : 'lisa_to_toshi';
  const amount = money(b.amount);
  if (amount <= 0) return c.json({ error: 'amount must be positive' }, 400);
  const r = await c.env.DB.prepare(`INSERT INTO settlement_adjustments (month, direction, amount, description, note) VALUES (?, ?, ?, ?, ?)`)
    .bind(month, direction, amount, String(b.description || 'Manual settlement adjustment'), b.note || null).run();
  return c.json({ ok: true, id: r.meta.last_row_id, result: await settlementForMonth(c.env.DB, month) }, 201);
});

app.patch('/adjustments/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const current = await selectOne<any>(c.env.DB, `SELECT * FROM settlement_adjustments WHERE id = ?`, [id]);
  if (!current) return c.json({ error: 'not found' }, 404);
  const b = await c.req.json<any>();
  const fields: string[] = [];
  const vals: any[] = [];
  if ('direction' in b) { fields.push('direction = ?'); vals.push(['lisa_to_toshi','toshi_to_lisa','none'].includes(String(b.direction)) ? String(b.direction) : current.direction); }
  if ('amount' in b) { fields.push('amount = ?'); vals.push(money(b.amount)); }
  if ('description' in b) { fields.push('description = ?'); vals.push(String(b.description || 'Manual settlement adjustment')); }
  if ('note' in b) { fields.push('note = ?'); vals.push(b.note || null); }
  if (!fields.length) return c.json({ error: 'no fields' }, 400);
  await exec(c.env.DB, `UPDATE settlement_adjustments SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...vals, id]);
  return c.json({ ok: true, result: await settlementForMonth(c.env.DB, current.month) });
});

app.delete('/adjustments/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const current = await selectOne<any>(c.env.DB, `SELECT * FROM settlement_adjustments WHERE id = ?`, [id]);
  if (!current) return c.json({ error: 'not found' }, 404);
  await exec(c.env.DB, `UPDATE settlement_adjustments SET archived_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  return c.json({ ok: true, result: await settlementForMonth(c.env.DB, current.month) });
});

export default app;
