import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, selectOne } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

type Owner = 'toshi' | 'lisa' | 'shared' | 'other';
type CashEvent = { date: string; owner: Owner; amount: number; kind: 'income' | 'payment'; label: string; source: string };
type AppSettings = Record<string, string>;

const dashboardSettingDefaults: AppSettings = {
  budget_cycle_start_day: '25',
  dashboard_actuals_override_plans: 'true',
  dashboard_card_fixed_split_explained: 'true',
};

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function daysInMonth(year: number, month1: number): number { return new Date(Date.UTC(year, month1, 0)).getUTCDate(); }
function cycleRange(month: string, startDay = 25): { start: string; end: string; label: string } {
  const [y, m] = month.split('-').map(Number);
  const start = `${month}-${String(Math.min(startDay, daysInMonth(y, m))).padStart(2, '0')}`;
  const next = addMonths(month, 1);
  const [ny, nm] = next.split('-').map(Number);
  const endDay = Math.max(1, startDay - 1);
  const end = `${next}-${String(Math.min(endDay, daysInMonth(ny, nm))).padStart(2, '0')}`;
  return { start, end, label: `${start}..${end}` };
}
function half(n: number): number { return Math.round((Number(n) || 0) / 2); }
function inRange(date: string, start: string, end: string): boolean { return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date >= start && date <= end : false; }
function dueDateForMonthly(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${String(Math.min(Math.max(1, day), daysInMonth(y, m))).padStart(2, '0')}`;
}
function ownerValue(v: any): Owner {
  const raw = String(v || '').trim();
  const s = raw.toLowerCase();
  const map: Record<string, Owner> = {
    '夫': 'toshi', '旦那': 'toshi', '主人': 'toshi', 'toshi': 'toshi', 'husband': 'toshi', 't': 'toshi', '夫負担': 'toshi',
    '妻': 'lisa', 'lisa': 'lisa', 'wife': 'lisa', 'l': 'lisa', '妻負担': 'lisa',
    '共同': 'shared', '共通': 'shared', '折半': 'shared', '半分': 'shared', 'shared': 'shared', 'joint': 'shared', 'split': 'shared', 'half': 'shared', '両方': 'shared',
    'その他': 'other', '対象外': 'other', 'other': 'other', 'others': 'other', 'exclude': 'other', 'excluded': 'other',
  };
  return map[raw] || map[s] || 'other';
}
function monthList(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = /^\d{4}-\d{2}$/.test(from) ? from : new Date().toISOString().slice(0, 7);
  const end = /^\d{4}-\d{2}$/.test(to) ? to : cur;
  for (let guard = 0; cur <= end && guard < 84; guard++) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}

async function getAppSettings(db: D1Database, defaults: AppSettings = dashboardSettingDefaults): Promise<AppSettings> {
  const settings = { ...defaults };
  const keys = Object.keys(defaults);
  if (!keys.length) return settings;
  const rows = await selectAll<{ key: string; value: string }>(
    db,
    `SELECT key, value FROM app_settings WHERE key IN (${keys.map(() => '?').join(',')})`,
    keys
  );
  for (const r of rows) settings[r.key] = r.value;
  return settings;
}

async function putAppSettings(db: D1Database, items: Record<string, string | number | boolean>) {
  const allowed = new Set(Object.keys(dashboardSettingDefaults));
  for (const [key, value] of Object.entries(items)) {
    if (!allowed.has(key)) continue;
    await db.prepare(
      `INSERT INTO app_settings (key, value, note, updated_at)
       VALUES (?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
    ).bind(key, String(value), 'Editable app behavior setting').run();
  }
}

function inferActualPayer(row: any): Owner {
  const explicit = ownerValue(row.paid_by);
  if (explicit !== 'other') return explicit;
  const cardDefault = ownerValue(row.card_default_paid_by);
  if (cardDefault !== 'other') return cardDefault;
  const cardOwner = ownerValue(row.card_owner);
  if (cardOwner !== 'other' && cardOwner !== 'shared') return cardOwner;
  if (row.card_id) return 'toshi';
  return ownerValue(row.payer);
}

function inferBurdenOwner(row: any): Owner {
  return ownerValue(row.burden_owner || row.payer);
}

function isHouseholdContribution(row: any): boolean {
  return String(row.kind || '').toLowerCase() === 'household_contribution';
}

function compactText(v: any): string {
  return String(v || '').toLowerCase().replace(/[\s_\-　・．\.／\/（）()「」『』【】\[\]:：,，]/g, '');
}

function plannedMatchesExpense(plan: any, expenses: any[]): boolean {
  const planAmount = Number(plan.amount || 0);
  if (!planAmount) return false;
  const planPaidBy = ownerValue(plan.paid_by || 'toshi');
  const planBurden = ownerValue(plan.burden_owner || plan.owner || 'shared');
  const planName = compactText(plan.name || plan.description || '');
  const planCategory = compactText(plan.category || '');
  return expenses.some((e) => {
    if (Number(e.amount || 0) !== planAmount) return false;
    const ePaidBy = ownerValue(e.paid_by || (e.card_id ? 'toshi' : e.payer));
    const eBurden = ownerValue(e.burden_owner || e.payer);
    if (ePaidBy !== planPaidBy || eBurden !== planBurden) return false;
    const eDesc = compactText(e.description || '');
    const eCat = compactText(e.category || '');
    if (planName && eDesc && (eDesc.includes(planName) || planName.includes(eDesc))) return true;
    if (planCategory && eCat && planCategory === eCat) return true;
    // A conservative fallback for recurring non-card payments: exact amount + payer/burden + generic recurring category.
    if (planCategory && ['propertytax','earthquakeinsurance','fireinsurance','insurance','tax'].includes(planCategory)) return true;
    return false;
  });
}

function dedupePlannedAgainstActuals(expenses: any[], scheduled: any[], fixed: any[]) {
  const suppressed: any[] = [];
  const scheduledOut = scheduled.filter((sp) => {
    const dup = plannedMatchesExpense(sp, expenses);
    if (dup) suppressed.push({ source: 'scheduled_payment', id: sp.id, name: sp.name, amount: sp.amount, reason: 'matched_actual_expense_same_month' });
    return !dup;
  });
  const fixedOut = fixed.filter((fp) => {
    const dup = plannedMatchesExpense(fp, expenses);
    if (dup) suppressed.push({ source: 'fixed_cost', id: fp.id || fp.fixed_cost_id, name: fp.name, amount: fp.amount, reason: 'matched_actual_expense_same_month' });
    return !dup;
  });
  return { scheduled: scheduledOut, fixed: fixedOut, suppressed };
}


function recurrenceInterval(sp: any): number | null {
  const freq = String(sp.frequency || '').toLowerCase();
  if (freq === 'every_3_years') return 3;
  if (freq === 'every_5_years') return 5;
  const n = Number(sp.interval_years || 0);
  return n > 0 ? Math.round(n) : null;
}

function occursByRecurrence(sp: any, month: string): boolean {
  const [year, monthNum] = month.split('-').map(Number);
  const interval = recurrenceInterval(sp);
  if (!interval) return false;
  const dueMonth = Number(sp.due_month || (sp.due_date ? String(sp.due_date).slice(5, 7) : 0));
  if (dueMonth !== monthNum) return false;
  const startYear = Number(sp.recurrence_start_year || (sp.due_date ? String(sp.due_date).slice(0, 4) : 2026));
  return year >= startYear && (year - startYear) % interval === 0;
}

function activeInMonth(sp: any, month: string): boolean {
  const from = String(sp.active_from_month || '');
  const to = String(sp.active_to_month || '');
  if (/^\d{4}-\d{2}$/.test(from) && month < from) return false;
  if (/^\d{4}-\d{2}$/.test(to) && month > to) return false;
  return true;
}

async function scheduledOccurrences(db: D1Database, period: { start: string; end: string }, month: string): Promise<any[]> {
  const rows = await selectAll<any>(db, `SELECT sp.*, a.name AS account_name FROM scheduled_payments sp LEFT JOIN accounts a ON a.id = sp.account_id WHERE sp.archived_at IS NULL AND sp.active = 1 ORDER BY sp.sort_order ASC, sp.id ASC`);
  const months = [month, addMonths(month, 1)];
  const out: any[] = [];
  for (const sp of rows) {
    const freq = String(sp.frequency || 'monthly');
    if (freq === 'monthly') {
      for (const m of months) {
        if (!activeInMonth(sp, m)) continue;
        const d = dueDateForMonthly(m, Number(sp.due_day || 1));
        if (inRange(d, period.start, period.end)) out.push({ ...sp, due: d });
      }
    } else if (freq === 'yearly' || freq === 'every_3_years' || freq === 'every_5_years') {
      for (const m of months) {
        if (!activeInMonth(sp, m)) continue;
        const [y, mm] = m.split('-').map(Number);
        if (freq === 'yearly' && Number(sp.due_month || 0) !== mm) continue;
        if ((freq === 'every_3_years' || freq === 'every_5_years') && !occursByRecurrence(sp, m)) continue;
        const d = `${y}-${String(mm).padStart(2, '0')}-${String(Math.min(Number(sp.due_day || 1), daysInMonth(y, mm))).padStart(2, '0')}`;
        if (inRange(d, period.start, period.end)) out.push({ ...sp, due: d });
      }
    } else if (sp.due_date && activeInMonth(sp, String(sp.due_date).slice(0, 7)) && inRange(sp.due_date, period.start, period.end)) {
      out.push({ ...sp, due: sp.due_date });
    }
  }
  return out;
}

async function recurringIncomeOccurrences(db: D1Database, period: { start: string; end: string }, month: string): Promise<any[]> {
  const rows = await selectAll<any>(db, `SELECT * FROM recurring_incomes WHERE active = 1 AND archived_at IS NULL ORDER BY owner ASC, pay_day ASC, id ASC`);
  const months = [month, addMonths(month, 1)];
  const out: any[] = [];
  for (const r of rows) {
    for (const m of months) {
      const date = dueDateForMonthly(m, Number(r.pay_day || 1));
      if (inRange(date, period.start, period.end)) out.push({ ...r, date, description: r.name || 'recurring income' });
    }
  }
  return out;
}


async function fixedOccurrences(db: D1Database, month: string): Promise<any[]> {
  const rows = await selectAll<any>(db, `SELECT s.*, f.name, f.owner, f.split, f.pay_day, f.category, f.account_id,
       COALESCE(s.paid_by, f.paid_by, 'toshi') AS paid_by,
       COALESCE(s.burden_owner, f.burden_owner, f.owner, 'shared') AS burden_owner,
       COALESCE(s.payment_due_date, printf('%s-%02d', s.month, COALESCE(f.pay_day, 1))) AS due,
       a.name AS account_name
     FROM fixed_cost_snapshots s
     JOIN fixed_costs f ON f.id = s.fixed_cost_id
     LEFT JOIN accounts a ON a.id = f.account_id
     WHERE s.month = ?
       AND f.archived_at IS NULL
       AND (f.active_from_month IS NULL OR f.active_from_month = '' OR f.active_from_month <= ?)
       AND (f.active_to_month IS NULL OR f.active_to_month = '' OR f.active_to_month >= ?)
       AND NOT EXISTS (SELECT 1 FROM ledger_links l WHERE l.source_type = 'fixed_cost' AND l.source_id = s.id)
      ORDER BY due ASC, s.id ASC`, [month, month, month]);
  if (rows.length > 0) return rows;
  // If snapshots have not been generated yet, still show the fixed master as forecast-only plan.
  return await selectAll<any>(db, `SELECT NULL AS id, f.id AS fixed_cost_id, ? AS month, f.amount, f.name, f.owner, f.split, f.pay_day, f.category, f.account_id,
       COALESCE(f.paid_by, 'toshi') AS paid_by,
       COALESCE(f.burden_owner, f.owner, 'shared') AS burden_owner,
       printf('%s-%02d', ?, COALESCE(f.pay_day, 1)) AS due,
       a.name AS account_name
     FROM fixed_costs f
     LEFT JOIN accounts a ON a.id = f.account_id
     WHERE f.archived_at IS NULL
       AND (f.active_from_month IS NULL OR f.active_from_month = '' OR f.active_from_month <= ?)
       AND (f.active_to_month IS NULL OR f.active_to_month = '' OR f.active_to_month >= ?)
      ORDER BY due ASC, f.id ASC`, [month, month, month, month]);
}

async function latestBalances(db: D1Database) {
  return await selectAll<any>(db, `SELECT a.id, a.name, a.owner, a.kind, b.balance, b.as_of_date
     FROM accounts a
     LEFT JOIN account_balances b ON b.id = (SELECT id FROM account_balances WHERE account_id = a.id ORDER BY as_of_date DESC, id DESC LIMIT 1)
     WHERE a.archived_at IS NULL ORDER BY a.sort_order ASC, a.id ASC`);
}

function makeForecast(owner: Owner, events: CashEvent[], opening: number) {
  const sorted = events.filter((e) => e.owner === owner).sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  let balance = opening;
  let minBalance = opening;
  let minDate = sorted[0]?.date || null;
  const timeline = sorted.map((e) => {
    balance += e.amount;
    if (balance < minBalance) { minBalance = balance; minDate = e.date; }
    return { ...e, balance_after: balance };
  });
  return { owner, opening_balance: opening, ending_balance: balance, minimum_balance: minBalance, lowest_date: minDate, shortfall: Math.max(0, -minBalance), timeline };
}

app.get('/dashboard/:month', async (c) => {
  const month = c.req.param('month');
  const appSettings = await getAppSettings(c.env.DB);
  const configuredCycleStart = Number(appSettings.budget_cycle_start_day || 25);
  const cycleStartDay = Number(c.req.query('cycle_start_day') || configuredCycleStart || 25);
  const period = cycleRange(month, cycleStartDay);

  const income = { total: 0, toshi: 0, lisa: 0, household_contribution: 0 };
  const incomeRows = await selectAll<any>(c.env.DB, `SELECT date, owner, amount, description, kind FROM incomes WHERE archived_at IS NULL AND date >= ? AND date <= ?`, [period.start, period.end]);
  for (const r of incomeRows) {
    const amt = Number(r.amount || 0);
    if (isHouseholdContribution(r)) {
      income.household_contribution += amt;
      continue;
    }
    income.total += amt;
    if (ownerValue(r.owner) === 'toshi') income.toshi += amt;
    if (ownerValue(r.owner) === 'lisa') income.lisa += amt;
  }
  const recurringIncomeRows = await recurringIncomeOccurrences(c.env.DB, period, month);
  for (const r of recurringIncomeRows) {
    const amt = Number(r.amount || 0);
    if (isHouseholdContribution(r)) {
      income.household_contribution += amt;
      continue;
    }
    income.total += amt;
    if (ownerValue(r.owner) === 'toshi') income.toshi += amt;
    if (ownerValue(r.owner) === 'lisa') income.lisa += amt;
  }

  const rows = await selectAll<any>(c.env.DB, `SELECT e.*, c.name AS card_name, c.owner AS card_owner, c.default_paid_by AS card_default_paid_by, c.default_burden_owner AS card_default_burden_owner
     FROM expenses e LEFT JOIN cards c ON c.id = e.card_id
     WHERE e.archived_at IS NULL AND COALESCE(e.cycle_month, e.billing_month) = ?
       AND LOWER(COALESCE(e.category, '')) NOT IN ('loan', 'loan_repayment')
     ORDER BY COALESCE(e.payment_due_date, e.date) ASC, e.id ASC`, [month]);
  const schedRaw = await scheduledOccurrences(c.env.DB, period, month);
  const fixedPlansRaw = await fixedOccurrences(c.env.DB, month);
  const dedupedPlans = appSettings.dashboard_actuals_override_plans === 'false'
    ? { scheduled: schedRaw, fixed: fixedPlansRaw, suppressed: [] as any[] }
    : dedupePlannedAgainstActuals(rows, schedRaw, fixedPlansRaw);
  const sched = dedupedPlans.scheduled;
  const fixedPlans = dedupedPlans.fixed;

  let householdTotal = 0, splitTotal = 0, wifePersonal = 0, husbandOwn = 0, wifeDueGross = 0, husbandDueGross = 0, husbandPaid = 0, wifePaid = 0;
  let actualExpenseTotal = 0, cardExpenseTotal = 0, nonCardActualExpenseTotal = 0;
  const wifeTransferLines: any[] = [];
  const addWifeLine = (source: string, item: any, amount: number, reason: string, shareRate: number) => { if (amount > 0) wifeTransferLines.push({ source, id: item.id || item.source_id || null, date: item.payment_due_date || item.due || item.date || null, description: item.description || item.name || '', category: item.category || '', original_amount: Number(item.amount || amount || 0), wife_due_amount: Math.round(amount), reason, share_rate: shareRate }); };
  const addHusbandCreditLine = (source: string, item: any, amount: number, reason: string, shareRate: number) => { if (amount > 0) wifeTransferLines.push({ source, id: item.id || item.source_id || null, date: item.payment_due_date || item.due || item.date || null, description: item.description || item.name || '', category: item.category || '', original_amount: Number(item.amount || amount || 0), wife_due_amount: -Math.round(amount), reason, share_rate: shareRate }); };
  for (const r of rows) {
    const amount = Number(r.amount || 0);
    const burden = inferBurdenOwner(r);
    const paidBy = inferActualPayer(r);
    if (burden === 'other') { continue; }
    actualExpenseTotal += amount;
    if (r.card_id) cardExpenseTotal += amount;
    else nonCardActualExpenseTotal += amount;
    householdTotal += amount;
    if (burden === 'shared') splitTotal += amount;
    if (burden === 'lisa') wifePersonal += amount;
    if (burden === 'toshi') husbandOwn += amount;
    if (paidBy === 'toshi') {
      husbandPaid += amount;
      if (burden === 'lisa') { wifeDueGross += amount; addWifeLine('expense', r, amount, 'wife_personal_paid_by_husband', 1); }
      if (burden === 'shared') { const h = half(amount); wifeDueGross += h; addWifeLine('expense', r, h, 'split_paid_by_husband', 0.5); }
    }
    if (paidBy === 'lisa') {
      wifePaid += amount;
      if (burden === 'toshi') { husbandDueGross += amount; addHusbandCreditLine('expense', r, amount, 'husband_personal_paid_by_wife', 1); }
      if (burden === 'shared') { const h = half(amount); husbandDueGross += h; addHusbandCreditLine('expense', r, h, 'split_paid_by_wife', 0.5); }
    }
  }
  for (const sp of sched) {
    const amount = Number(sp.amount || 0);
    const burden = ownerValue(sp.burden_owner);
    const paidBy = ownerValue(sp.paid_by);
    householdTotal += amount;
    if (burden === 'shared' || Number(sp.split || 0) === 1) splitTotal += amount;
    if (burden === 'lisa') wifePersonal += amount;
    if (burden === 'toshi') husbandOwn += amount;
    if (paidBy === 'toshi') {
      husbandPaid += amount;
      if (burden === 'lisa') { wifeDueGross += amount; addWifeLine('scheduled_payment', sp, amount, 'fixed_or_scheduled_paid_by_husband', 1); }
      if (burden === 'shared' || Number(sp.split || 0) === 1) { const h = half(amount); wifeDueGross += h; addWifeLine('scheduled_payment', sp, h, 'fixed_or_scheduled_paid_by_husband', 0.5); }
    }
    if (paidBy === 'lisa') {
      wifePaid += amount;
      if (burden === 'toshi') { husbandDueGross += amount; addHusbandCreditLine('scheduled_payment', sp, amount, 'credit_husband_paid_by_wife', 1); }
      if (burden === 'shared' || Number(sp.split || 0) === 1) { const h = half(amount); husbandDueGross += h; addHusbandCreditLine('scheduled_payment', sp, h, 'credit_husband_paid_by_wife', 0.5); }
    }
  }
  let fixedTotal = 0;
  const scheduledTotal = sched.reduce((a, x) => a + Number(x.amount || 0), 0);
  for (const fp of fixedPlans) {
    const amount = Number(fp.amount || 0);
    const burden = ownerValue(fp.burden_owner || fp.owner);
    const paidBy = ownerValue(fp.paid_by || 'toshi');
    fixedTotal += amount;
    householdTotal += amount;
    if (burden === 'shared' || Number(fp.split || 0) === 1) splitTotal += amount;
    if (burden === 'lisa') wifePersonal += amount;
    if (burden === 'toshi') husbandOwn += amount;
    if (paidBy === 'toshi') {
      husbandPaid += amount;
      if (burden === 'lisa') { wifeDueGross += amount; addWifeLine('fixed_cost', fp, amount, 'fixed_or_scheduled_paid_by_husband', 1); }
      if (burden === 'shared' || Number(fp.split || 0) === 1) { const h = half(amount); wifeDueGross += h; addWifeLine('fixed_cost', fp, h, 'fixed_or_scheduled_paid_by_husband', 0.5); }
    }
    if (paidBy === 'lisa') {
      wifePaid += amount;
      if (burden === 'toshi') { husbandDueGross += amount; addHusbandCreditLine('fixed_cost', fp, amount, 'credit_husband_paid_by_wife', 1); }
      if (burden === 'shared' || Number(fp.split || 0) === 1) { const h = half(amount); husbandDueGross += h; addHusbandCreditLine('fixed_cost', fp, h, 'credit_husband_paid_by_wife', 0.5); }
    }
  }
  const householdContributionTotal = Math.min(Number(income.household_contribution || 0), splitTotal);
  if (householdContributionTotal > 0) {
    householdTotal -= householdContributionTotal;
    splitTotal -= householdContributionTotal;
    const contributionByOwner = recurringIncomeRows
      .filter(isHouseholdContribution)
      .concat(incomeRows.filter(isHouseholdContribution))
      .reduce((acc, x) => {
        const owner = ownerValue(x.owner);
        acc[owner] = Number(acc[owner] || 0) + Number(x.amount || 0);
        return acc;
      }, {} as Record<Owner, number>);
    const toshiCredit = Math.min(Number(contributionByOwner.toshi || 0), householdContributionTotal);
    const lisaCredit = Math.min(Number(contributionByOwner.lisa || 0), Math.max(0, householdContributionTotal - toshiCredit));
    if (toshiCredit > 0) {
      const credit = half(toshiCredit);
      wifeDueGross = Math.max(0, wifeDueGross - credit);
      wifeTransferLines.push({ source: 'household_contribution', id: null, date: null, description: 'External household contribution received by Husband', category: 'household_contribution', original_amount: toshiCredit, wife_due_amount: -credit, reason: 'household_contribution_received_by_husband', share_rate: 0.5 });
    }
    if (lisaCredit > 0) {
      const credit = half(lisaCredit);
      husbandDueGross = Math.max(0, husbandDueGross - credit);
      wifeTransferLines.push({ source: 'household_contribution', id: null, date: null, description: 'External household contribution received by Wife', category: 'household_contribution', original_amount: lisaCredit, wife_due_amount: credit, reason: 'household_contribution_received_by_wife', share_rate: 0.5 });
    }
  }
  const netWifeToHusband = wifeDueGross - husbandDueGross;
  const wifeTransferDue = Math.max(0, netWifeToHusband);
  const husbandToWifeDue = Math.max(0, -netWifeToHusband);
  const wifeFinalBurden = wifePersonal + half(splitTotal);
  const husbandFinalBurden = householdTotal - wifeFinalBurden;
  const wifeTransferBreakdown = {
    wife_personal_paid_by_husband: wifeTransferLines.filter((x) => x.reason === 'wife_personal_paid_by_husband').reduce((a, x) => a + Math.max(0, Number(x.wife_due_amount || 0)), 0),
    split_paid_by_husband: wifeTransferLines.filter((x) => x.reason === 'split_paid_by_husband').reduce((a, x) => a + Math.max(0, Number(x.wife_due_amount || 0)), 0),
    fixed_or_scheduled_paid_by_husband: wifeTransferLines.filter((x) => x.reason === 'fixed_or_scheduled_paid_by_husband').reduce((a, x) => a + Math.max(0, Number(x.wife_due_amount || 0)), 0),
    credit_husband_paid_by_wife: Math.abs(wifeTransferLines.filter((x) => Number(x.wife_due_amount || 0) < 0).reduce((a, x) => a + Number(x.wife_due_amount || 0), 0)),
    household_contribution_received_by_husband: Math.abs(wifeTransferLines.filter((x) => x.reason === 'household_contribution_received_by_husband').reduce((a, x) => a + Number(x.wife_due_amount || 0), 0)),
    household_contribution_received_by_wife: wifeTransferLines.filter((x) => x.reason === 'household_contribution_received_by_wife').reduce((a, x) => a + Math.max(0, Number(x.wife_due_amount || 0)), 0),
  };

  const balances = await latestBalances(c.env.DB);
  const investmentSummary = await selectOne<any>(c.env.DB, `SELECT
       COALESCE(SUM(quantity * COALESCE(manual_price, average_cost, 0)), 0) AS total,
       COALESCE(SUM(quantity * COALESCE(average_cost, 0)), 0) AS cost,
       COUNT(*) AS count
     FROM investment_holdings WHERE archived_at IS NULL`) || { total: 0, cost: 0, count: 0 };
  const assetSummary = await selectOne<any>(c.env.DB, `SELECT
       COALESCE(SUM(CASE WHEN key = 'repair_reserve_start_balance' THEN CAST(value AS INTEGER) ELSE 0 END),0) AS repair_seed
     FROM asset_rebuild_settings`) || { repair_seed: 0 };
  const openingByOwner = { toshi: 0, lisa: 0, shared: 0, other: 0 } as Record<Owner, number>;
  for (const b of balances) openingByOwner[ownerValue(b.owner)] += Number(b.balance || 0);
  const cashEvents: CashEvent[] = [];
  for (const x of incomeRows) cashEvents.push({ date: x.date, owner: ownerValue(x.owner), amount: Number(x.amount || 0), kind: 'income', label: x.description || 'income', source: 'income' });
  for (const x of recurringIncomeRows) cashEvents.push({ date: x.date, owner: ownerValue(x.owner), amount: Number(x.amount || 0), kind: 'income', label: x.description || 'recurring income', source: 'recurring_income' });
  for (const r of rows) {
    const burden = inferBurdenOwner(r);
    if (burden === 'other') continue;
    cashEvents.push({ date: r.payment_due_date || r.date, owner: inferActualPayer(r), amount: -Number(r.amount || 0), kind: 'payment', label: r.description, source: 'expense' });
  }
  for (const sp of sched) cashEvents.push({ date: sp.due, owner: ownerValue(sp.paid_by), amount: -Number(sp.amount || 0), kind: 'payment', label: sp.name, source: 'scheduled_payment' });
  for (const fp of fixedPlans) cashEvents.push({ date: fp.due, owner: ownerValue(fp.paid_by || 'toshi'), amount: -Number(fp.amount || 0), kind: 'payment', label: fp.name, source: 'fixed_cost' });
  const forecasts = {
    toshi: makeForecast('toshi', cashEvents, openingByOwner.toshi),
    lisa: makeForecast('lisa', cashEvents, openingByOwner.lisa),
    shared: makeForecast('shared', cashEvents, openingByOwner.shared),
  };

  return c.json({
    month,
    period: { ...period, cycle_start_day: cycleStartDay, basis: `salary_cycle_${cycleStartDay}_to_${cycleStartDay - 1 || 31}` },
    income,
    settings: appSettings,
    aggregation_policy: {
      actuals_override_plans: appSettings.dashboard_actuals_override_plans === 'true',
      card_fixed_split_explained: appSettings.dashboard_card_fixed_split_explained === 'true',
      note: 'Household total = actual expenses for the budget month + remaining fixed/scheduled plans not matched to actual expenses.',
    },
    household: {
      total: householdTotal,
      gross_total: householdTotal + householdContributionTotal,
      household_contribution: householdContributionTotal,
      split_total: splitTotal,
      split_each: half(splitTotal),
      wife_personal_advanced: wifePersonal,
      husband_only: husbandOwn,
      fixed_total: fixedTotal,
      scheduled_total: scheduledTotal,
      actual_expense_total: actualExpenseTotal,
      card_expense_total: cardExpenseTotal,
      non_card_actual_expense_total: nonCardActualExpenseTotal,
      planned_total: fixedTotal + scheduledTotal,
      suppressed_planned_total: dedupedPlans.suppressed.reduce((a, x) => a + Number(x.amount || 0), 0),
    },
    settlement: { wife_due_to_husband: wifeTransferDue, husband_due_to_wife: husbandToWifeDue, net_wife_to_husband: netWifeToHusband, wife_final_burden: wifeFinalBurden, husband_final_burden: husbandFinalBurden, husband_split_share: splitTotal - half(splitTotal), wife_split_share: half(splitTotal), husband_salary_balance: Number(income.toshi || 0) - husbandFinalBurden, wife_salary_balance: Number(income.lisa || 0) - wifeTransferDue, direction: netWifeToHusband > 0 ? 'lisa_to_toshi' : netWifeToHusband < 0 ? 'toshi_to_lisa' : 'none', wife_transfer_lines: wifeTransferLines, wife_transfer_breakdown: wifeTransferBreakdown, wife_transfer_positive_total: wifeTransferLines.filter(x => x.wife_due_amount > 0).reduce((a,x) => a + Number(x.wife_due_amount || 0), 0), wife_transfer_credit_total: Math.abs(wifeTransferLines.filter(x => x.wife_due_amount < 0).reduce((a,x) => a + Number(x.wife_due_amount || 0), 0)) },
    cashflow: { forecasts, account_balances: balances, scheduled_payments: sched, fixed_plans: fixedPlans, suppressed_planned: dedupedPlans.suppressed, duplicate_policy: 'actual expenses override fixed/scheduled plans in the same month' },
    assets: { investments: { total: Math.round(Number(investmentSummary.total || 0)), cost: Math.round(Number(investmentSummary.cost || 0)), unrealized_pl: Math.round(Number(investmentSummary.total || 0) - Number(investmentSummary.cost || 0)), count: Number(investmentSummary.count || 0) }, repair_seed: Number(assetSummary.repair_seed || 0), total_net_assets_hint: Math.round(Number(investmentSummary.total || 0) + Number(openingByOwner.shared || 0)) },
    evidence: rows.slice(0, 300),
  });
});

app.get('/cashflow/:month', async (c) => {
  const month = c.req.param('month');
  const period = cycleRange(month, Number(c.req.query('cycle_start_day') || 25));
  const dash = await (await app.fetch(new Request(new URL(`/api/analytics/dashboard/${month}`, new URL(c.req.url).origin).toString()), c.env as any)).json();
  return c.json({ month, period, cashflow: (dash as any).cashflow, settlement: (dash as any).settlement });
});

app.get('/cashflow-range', async (c) => {
  const from = c.req.query('from') || new Date().toISOString().slice(0, 7);
  const to = c.req.query('to') || addMonths(from, 5);
  const cycleStartDay = Number(c.req.query('cycle_start_day') || 25);
  const months = monthList(from, to);
  const balances = await latestBalances(c.env.DB);
  const openingByOwner = { toshi: 0, lisa: 0, shared: 0, other: 0 } as Record<Owner, number>;
  for (const b of balances) openingByOwner[ownerValue(b.owner)] += Number(b.balance || 0);
  const cashEvents: CashEvent[] = [];
  const seen = new Set<string>();
  const pushEvent = (e: CashEvent) => {
    const key = [e.date, e.owner, e.amount, e.source, e.label].join('|');
    if (seen.has(key)) return;
    seen.add(key);
    cashEvents.push(e);
  };

  for (const month of months) {
    const period = cycleRange(month, cycleStartDay);
    const incomeRows = await selectAll<any>(c.env.DB, `SELECT date, owner, amount, description, kind FROM incomes WHERE archived_at IS NULL AND date >= ? AND date <= ?`, [period.start, period.end]);
    for (const x of incomeRows) pushEvent({ date: x.date, owner: ownerValue(x.owner), amount: Number(x.amount || 0), kind: 'income', label: x.description || 'income', source: String(x.kind || 'income') });
    for (const x of await recurringIncomeOccurrences(c.env.DB, period, month)) pushEvent({ date: x.date, owner: ownerValue(x.owner), amount: Number(x.amount || 0), kind: 'income', label: x.description || 'recurring income', source: String(x.kind || 'recurring_income') });

    const expenses = await selectAll<any>(c.env.DB, `SELECT e.*, c.name AS card_name, c.owner AS card_owner, c.default_paid_by AS card_default_paid_by, c.default_burden_owner AS card_default_burden_owner
       FROM expenses e LEFT JOIN cards c ON c.id = e.card_id
       WHERE e.archived_at IS NULL AND COALESCE(e.cycle_month, e.billing_month) = ?
         AND LOWER(COALESCE(e.category, '')) NOT IN ('loan', 'loan_repayment')
       ORDER BY COALESCE(e.payment_due_date, e.date) ASC, e.id ASC`, [month]);
    const deduped = dedupePlannedAgainstActuals(expenses, await scheduledOccurrences(c.env.DB, period, month), await fixedOccurrences(c.env.DB, month));
    for (const r of expenses) {
      if (inferBurdenOwner(r) === 'other') continue;
      pushEvent({ date: r.payment_due_date || r.date, owner: inferActualPayer(r), amount: -Number(r.amount || 0), kind: 'payment', label: r.description, source: 'expense' });
    }
    for (const sp of deduped.scheduled) pushEvent({ date: sp.due, owner: ownerValue(sp.paid_by), amount: -Number(sp.amount || 0), kind: 'payment', label: sp.name, source: 'scheduled_payment' });
    for (const fp of deduped.fixed) pushEvent({ date: fp.due, owner: ownerValue(fp.paid_by || 'toshi'), amount: -Number(fp.amount || 0), kind: 'payment', label: fp.name, source: 'fixed_cost' });
  }

  const forecasts = {
    toshi: makeForecast('toshi', cashEvents, openingByOwner.toshi),
    lisa: makeForecast('lisa', cashEvents, openingByOwner.lisa),
    shared: makeForecast('shared', cashEvents, openingByOwner.shared),
  };
  return c.json({ from, to, months, account_balances: balances, forecasts, events: cashEvents.sort((a, b) => a.date.localeCompare(b.date)) });
});

app.get('/timeline', async (c) => {
  const { from, to } = c.req.query();
  const fromMonth = from || '2024-01';
  const toMonth = to || '2030-12';
  const rows = await selectAll(c.env.DB, `SELECT COALESCE(cycle_month, billing_month) AS month,
       SUM(CASE WHEN COALESCE(burden_owner, payer) = 'toshi' THEN amount ELSE 0 END) AS toshi,
       SUM(CASE WHEN COALESCE(burden_owner, payer) = 'lisa' THEN amount ELSE 0 END) AS lisa,
       SUM(CASE WHEN COALESCE(burden_owner, payer) = 'shared' THEN amount ELSE 0 END) AS shared,
       SUM(amount) AS total
     FROM expenses
     WHERE archived_at IS NULL AND COALESCE(cycle_month, billing_month) >= ? AND COALESCE(cycle_month, billing_month) <= ?
     GROUP BY COALESCE(cycle_month, billing_month) ORDER BY month ASC`, [fromMonth, toMonth]);
  return c.json({ items: rows });
});

app.get('/settings', async (c) => {
  c.header('Cache-Control', 'no-store, max-age=0');
  return c.json({ items: await getAppSettings(c.env.DB), defaults: dashboardSettingDefaults });
});

app.put('/settings', async (c) => {
  const body = await c.req.json<{ items?: Record<string, string | number | boolean> }>();
  await putAppSettings(c.env.DB, body.items || {});
  c.header('Cache-Control', 'no-store, max-age=0');
  return c.json({ ok: true, items: await getAppSettings(c.env.DB), defaults: dashboardSettingDefaults });
});

export default app;
