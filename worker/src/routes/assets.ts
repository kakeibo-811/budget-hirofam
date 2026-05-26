import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, selectOne, exec, idempotentLink } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const BOM = '\uFEFF';

type Owner = 'toshi' | 'lisa' | 'shared' | 'other';
type AssetTarget = 'repair_reserve' | 'loan_toshi' | 'loan_lisa' | 'home_loan' | 'stocks_value' | 'stocks_pl';
type AssetEventType = 'repair_deposit' | 'repair_spend' | 'loan_extra_repayment' | 'loan_drawdown' | 'balance_adjustment' | 'mortgage_balance_update' | 'stock_value_update' | 'stock_profit_update';

type AssetRebuildEvent = {
  id: number;
  event_date: string;
  target: AssetTarget;
  event_type: AssetEventType;
  amount: number;
  paid_by: Owner | null;
  burden_owner: Owner | null;
  account_id: number | null;
  note: string | null;
  source_type: string | null;
  source_key: string | null;
  created_at: string;
  updated_at: string;
};

type MortgageScheduleRow = {
  id?: number;
  schedule_source: string;
  payment_date: string;
  starting_balance: number;
  interest: number;
  payment: number;
  principal: number;
  ending_balance: number;
  final_payment: string | null;
  note?: string | null;
};

type ProjectionRow = {
  month: string;
  payment_date: string;
  repair_reserve_balance: number;
  repair_reserve_delta: number;
  repair_monthly_deposit: number;
  scheduled_repair_deductions: number;
  scheduled_repair_deduction_labels: string[];
  toshi_loan_balance: number;
  toshi_loan_repayment: number;
  lisa_loan_balance: number;
  lisa_loan_repayment: number;
  mortgage_starting_balance: number;
  mortgage_interest: number;
  mortgage_payment: number;
  mortgage_principal: number;
  mortgage_ending_balance: number;
  is_mortgage_imported: boolean;
  note: string;
};

type AssetSettings = Record<string, string>;

const defaultSettings: AssetSettings = {
  plan_start_date: '2026-05-25',
  projection_end_month: '2051-05',
  repair_reserve_start_balance: '393668',
  repair_reserve_monthly_deposit: '130000',
  mortgage_start_balance: '38970413',
  mortgage_monthly_payment: '150263',
  mortgage_interest_rate: '1.19',
  loan_toshi_start_balance: '924213',
  loan_lisa_start_balance: '164045',
  loan_toshi_monthly_repayment: '10000',
  loan_lisa_monthly_repayment: '10000',
  loan_repayment_day: '25',
};

const settingAliases: Record<string, string[]> = {
  repair_reserve_monthly_deposit: [
    'monthly_repair_saving',
    'monthly_repair_reserve_deposit',
    'repair_fund_monthly_deposit',
    'repair_reserve_monthly_amount',
    'repair_reserve_monthly_saving',
    'monthly_repair_deposit',
    'monthly_repair_reserve',
    'repair_monthly_deposit',
    '修繕積立月額',
    '毎月の修繕積立',
  ],
  repair_reserve_start_balance: ['repair_fund_start_balance', 'repair_reserve_initial_balance', '修繕積立金初期残高'],
  mortgage_monthly_payment: ['monthly_mortgage_payment', 'home_loan_monthly_payment', '住宅ローン毎月返済'],
  mortgage_start_balance: ['home_loan_start_balance', 'mortgage_balance_start', '住宅ローン初期残高'],
  loan_toshi_start_balance: ['toshi_loan_start_balance', 'husband_loan_start_balance', '夫貸付残高'],
  loan_lisa_start_balance: ['lisa_loan_start_balance', 'wife_loan_start_balance', '妻貸付残高'],
};

function canonicalSettingKey(key: string): string {
  for (const [canonical, aliases] of Object.entries(settingAliases)) {
    if (key === canonical || aliases.includes(key)) return canonical;
  }
  return key;
}

function applySettingAliases(settings: AssetSettings): AssetSettings {
  const merged = { ...settings };
  for (const [canonical, aliases] of Object.entries(settingAliases)) {
    const canonicalRowExists = Object.prototype.hasOwnProperty.call(settings, canonical);
    if (!canonicalRowExists || merged[canonical] === undefined || merged[canonical] === '') {
      for (const alias of aliases) {
        if (settings[alias] !== undefined && settings[alias] !== '') { merged[canonical] = settings[alias]; break; }
      }
    }
  }
  return merged;
}

async function putSettingWithAliases(db: D1Database, key: string, value: string) {
  const canonical = canonicalSettingKey(key);
  await putSetting(db, canonical, value);
  for (const alias of settingAliases[canonical] || []) await putSetting(db, alias, value);
}

function parseMoney(input: unknown): number {
  const s = String(input ?? '').replace(/^\uFEFF/, '').replace(/[￥¥,，\s]/g, '').trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function parseMaybeNumber(input: string | undefined): number | null {
  if (input === undefined) return null;
  const s = String(input).trim();
  if (!s) return null;
  const n = Number(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function fmtMonth(dateOrMonth: string): string {
  return String(dateOrMonth || '').slice(0, 7);
}

function ymd(year: number, month1: number, day: number): string {
  const days = new Date(Date.UTC(year, month1, 0)).getUTCDate();
  const d = Math.min(Math.max(1, day), days);
  return `${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthDiff(from: string, to: string): number {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

function paymentDateForMonth(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  return ymd(y, m, day);
}

function normalizeDateLoose(input: unknown): string {
  const raw = String(input ?? '').trim().replace(/^\uFEFF/, '');
  if (!raw) return '';
  const slash = raw.replace(/[.\/]/g, '-');
  const m = slash.match(/^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return slash;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  return `${y}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function csv(headers: string[], rows: unknown[][]): string {
  return BOM + [headers.map(csvEscape).join(','), ...rows.map((r) => r.map(csvEscape).join(','))].join('\n') + '\n';
}

function parseCsv(text: string): string[][] {
  const src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else cell += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return String(h || '').trim().toLowerCase().replace(/^\uFEFF/, '').replace(/[\s_\-　]/g, '').replace(/[()（）]/g, '');
}

function idx(headers: string[], names: string[]): number {
  const n = names.map(normalizeHeader);
  for (let i = 0; i < headers.length; i++) if (n.includes(headers[i])) return i;
  return -1;
}

function normalizeOwner(input: unknown, fallback: Owner = 'other'): Owner {
  const raw = String(input ?? '').trim();
  const lower = raw.toLowerCase();
  const map: Record<string, Owner> = {
    '夫': 'toshi', '旦那': 'toshi', '主人': 'toshi', 'toshi': 'toshi', 'husband': 'toshi', 't': 'toshi',
    '妻': 'lisa', 'lisa': 'lisa', 'wife': 'lisa', 'l': 'lisa',
    '共同': 'shared', '共通': 'shared', '折半': 'shared', 'shared': 'shared', 'joint': 'shared', 'split': 'shared',
    'その他': 'other', '対象外': 'other', 'other': 'other',
  };
  return map[raw] || map[lower] || fallback;
}

function normalizeEventType(input: unknown): AssetEventType {
  const raw = String(input ?? '').trim().toLowerCase();
  const map: Record<string, AssetEventType> = {
    'repair_deposit': 'repair_deposit', '積立': 'repair_deposit', '修繕積立': 'repair_deposit', '入金': 'repair_deposit',
    'repair_spend': 'repair_spend', '修繕費': 'repair_spend', '支出': 'repair_spend', '出金': 'repair_spend',
    'loan_extra_repayment': 'loan_extra_repayment', '一括返済': 'loan_extra_repayment', '返済': 'loan_extra_repayment', 'extra repayment': 'loan_extra_repayment',
    'loan_drawdown': 'loan_drawdown', '貸付増加': 'loan_drawdown', '貸付': 'loan_drawdown', 'drawdown': 'loan_drawdown',
    'balance_adjustment': 'balance_adjustment', '調整': 'balance_adjustment', '残高調整': 'balance_adjustment',
    'mortgage_balance_update': 'mortgage_balance_update', '住宅ローン残高更新': 'mortgage_balance_update',
    'stock_value_update': 'stock_value_update', '株式評価更新': 'stock_value_update',
    'stock_profit_update': 'stock_profit_update', '株式損益更新': 'stock_profit_update',
  };
  return map[raw] || 'balance_adjustment';
}

function normalizeTarget(input: unknown): AssetTarget {
  const raw = String(input ?? '').trim().toLowerCase().replace(/[\s_\-　]/g, '');
  const map: Record<string, AssetTarget> = {
    'repairreserve': 'repair_reserve', 'repairfund': 'repair_reserve', '修繕積立金': 'repair_reserve', '修繕積立': 'repair_reserve',
    'loantoshi': 'loan_toshi', 'toshi': 'loan_toshi', '夫貸付': 'loan_toshi', '夫への貸付金': 'loan_toshi', '旦那貸付': 'loan_toshi',
    'loanlisa': 'loan_lisa', 'lisa': 'loan_lisa', '妻貸付': 'loan_lisa', '妻への貸付金': 'loan_lisa',
    'homeloan': 'home_loan', 'mortgage': 'home_loan', '住宅ローン': 'home_loan', '住宅ローン残高': 'home_loan',
    'stocksvalue': 'stocks_value', 'stockvalue': 'stocks_value', '株式評価額': 'stocks_value',
    'stockspl': 'stocks_pl', 'stockprofit': 'stocks_pl', '株式損益': 'stocks_pl',
  };
  return map[raw] || 'repair_reserve';
}

async function tableExists(db: D1Database, tableName: string): Promise<boolean> {
  try {
    const row = await selectOne<{ name: string }>(db,
      `SELECT name FROM sqlite_master WHERE type='table' AND name = ?`,
      [tableName]
    );
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

async function getSettings(db: D1Database): Promise<AssetSettings> {
  const settings = { ...defaultSettings };

  // Legacy settings are read only as fallback. They must never override
  // the rebuilt asset settings edited in this tab.
  if (await tableExists(db, 'asset_settings')) {
    try {
      const legacyRows = await selectAll<{ key: string; value: string }>(db, `SELECT key, value FROM asset_settings`);
      const legacy: AssetSettings = {};
      for (const r of legacyRows) legacy[r.key] = r.value;
      const normalizedLegacy = applySettingAliases(legacy);
      for (const [k, v] of Object.entries(normalizedLegacy)) {
        if (settings[k] === undefined || settings[k] === '') settings[k] = v;
      }
      for (const [canonical, aliases] of Object.entries(settingAliases)) {
        if (normalizedLegacy[canonical] !== undefined && !Object.prototype.hasOwnProperty.call(settings, canonical)) {
          settings[canonical] = normalizedLegacy[canonical];
        }
        for (const alias of aliases) {
          if (legacy[alias] !== undefined && !Object.prototype.hasOwnProperty.call(settings, canonical)) {
            settings[canonical] = legacy[alias];
          }
        }
      }
    } catch {}
  }

  const rebuildRows = await selectAll<{ key: string; value: string }>(db, `SELECT key, value FROM asset_rebuild_settings`);
  const rebuild: AssetSettings = {};
  for (const r of rebuildRows) rebuild[r.key] = r.value;
  const normalizedRebuild = applySettingAliases(rebuild);
  for (const [k, v] of Object.entries(normalizedRebuild)) settings[k] = v;

  return applySettingAliases(settings);
}

function settingNumber(settings: AssetSettings, key: string): number {
  return parseMoney(settings[key] ?? defaultSettings[key] ?? '0');
}

function settingFloat(settings: AssetSettings, key: string): number {
  const n = Number(settings[key] ?? defaultSettings[key] ?? '0');
  return Number.isFinite(n) ? n : 0;
}

async function putSetting(db: D1Database, key: string, value: string, note?: string | null) {
  await db.prepare(
    `INSERT INTO asset_rebuild_settings (key, value, note, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, note = COALESCE(excluded.note, asset_rebuild_settings.note), updated_at = CURRENT_TIMESTAMP`
  ).bind(key, value, note ?? null).run();
}

async function getEvents(db: D1Database, fromMonth: string, toMonth: string): Promise<AssetRebuildEvent[]> {
  return await selectAll<AssetRebuildEvent>(db,
    `SELECT * FROM asset_rebuild_events
     WHERE event_date >= ? AND event_date <= ?
     ORDER BY event_date ASC, id ASC`,
    [`${fromMonth}-01`, `${toMonth}-31`]
  );
}

async function getMortgageRows(db: D1Database, source: string, fromMonth: string, toMonth: string): Promise<MortgageScheduleRow[]> {
  return await selectAll<MortgageScheduleRow>(db,
    `SELECT schedule_source, payment_date, starting_balance, interest, payment, principal, ending_balance, final_payment, note
     FROM mortgage_schedule_rows
     WHERE schedule_source = ? AND payment_date >= ? AND payment_date <= ?
     ORDER BY payment_date ASC`,
    [source, `${fromMonth}-01`, `${toMonth}-31`]
  );
}

function buildFallbackMortgage(settings: AssetSettings, fromMonth: string, toMonth: string): Map<string, MortgageScheduleRow> {
  const map = new Map<string, MortgageScheduleRow>();
  const startMonth = fmtMonth(settings.plan_start_date || defaultSettings.plan_start_date);
  const paymentDay = Number(settings.loan_repayment_day || '25') || 25;
  const monthlyPayment = settingNumber(settings, 'mortgage_monthly_payment');
  const annualRate = settingFloat(settings, 'mortgage_interest_rate') / 100;
  let balance = settingNumber(settings, 'mortgage_start_balance');
  const totalMonths = Math.max(0, Math.min(420, monthDiff(startMonth, toMonth)));
  for (let i = 0; i <= totalMonths; i++) {
    const month = addMonths(startMonth, i);
    const paymentDate = paymentDateForMonth(month, paymentDay);
    const starting = balance;
    const interest = balance > 0 ? Math.round(balance * annualRate / 12) : 0;
    const scheduledPayment = balance + interest <= monthlyPayment ? balance + interest : monthlyPayment;
    const principal = Math.max(0, scheduledPayment - interest);
    balance = Math.max(0, balance - principal);
    if (month >= fromMonth && month <= toMonth) {
      map.set(month, {
        schedule_source: 'computed_1_19_fallback',
        payment_date: paymentDate,
        starting_balance: starting,
        interest,
        payment: scheduledPayment,
        principal,
        ending_balance: balance,
        final_payment: balance === 0 ? 'yes' : null,
        note: 'Computed fallback. Import the official mortgage CSV to replace this.',
      });
    }
    if (balance === 0 && month > toMonth) break;
  }
  return map;
}

function calculateProjection(settings: AssetSettings, events: AssetRebuildEvent[], mortgageRows: MortgageScheduleRow[], fromMonth: string, toMonth: string): ProjectionRow[] {
  const startMonth = fmtMonth(settings.plan_start_date || defaultSettings.plan_start_date);
  const paymentDay = Number(settings.loan_repayment_day || '25') || 25;
  const repairMonthly = settingNumber(settings, 'repair_reserve_monthly_deposit');
  const toshiMonthly = settingNumber(settings, 'loan_toshi_monthly_repayment');
  const lisaMonthly = settingNumber(settings, 'loan_lisa_monthly_repayment');
  let repair = settingNumber(settings, 'repair_reserve_start_balance');
  let toshiLoan = settingNumber(settings, 'loan_toshi_start_balance');
  let lisaLoan = settingNumber(settings, 'loan_lisa_start_balance');
  let mortgageBalance = settingNumber(settings, 'mortgage_start_balance');

  const importedMortgage = new Map<string, MortgageScheduleRow>();
  for (const row of mortgageRows) importedMortgage.set(fmtMonth(row.payment_date), row);
  const fallbackMortgage = buildFallbackMortgage(settings, startMonth, toMonth);
  const eventsByMonth = new Map<string, AssetRebuildEvent[]>();
  for (const ev of events) {
    const m = fmtMonth(ev.event_date);
    if (!eventsByMonth.has(m)) eventsByMonth.set(m, []);
    eventsByMonth.get(m)!.push(ev);
  }

  const rows: ProjectionRow[] = [];
  const count = Math.max(0, Math.min(420, monthDiff(startMonth, toMonth)));
  for (let i = 0; i <= count; i++) {
    const month = addMonths(startMonth, i);
    const paymentDate = paymentDateForMonth(month, paymentDay);
    let repairDelta = 0;
    let noteParts: string[] = [];

    const thisToshiRepay = Math.min(toshiMonthly, Math.max(0, toshiLoan));
    const thisLisaRepay = Math.min(lisaMonthly, Math.max(0, lisaLoan));
    toshiLoan -= thisToshiRepay;
    lisaLoan -= thisLisaRepay;
    repairDelta += repairMonthly + thisToshiRepay + thisLisaRepay;
    noteParts.push(`repair deposit ${repairMonthly}, Toshi repay ${thisToshiRepay}, Lisa repay ${thisLisaRepay}`);

    for (const ev of eventsByMonth.get(month) || []) {
      const amount = Math.round(Number(ev.amount) || 0);
      if (ev.event_type === 'repair_deposit') repairDelta += amount;
      if (ev.event_type === 'repair_spend') repairDelta -= amount;
      if (ev.event_type === 'loan_extra_repayment') {
        if (ev.target === 'loan_toshi') { const x = Math.min(amount, toshiLoan); toshiLoan -= x; repairDelta += x; }
        if (ev.target === 'loan_lisa') { const x = Math.min(amount, lisaLoan); lisaLoan -= x; repairDelta += x; }
      }
      if (ev.event_type === 'loan_drawdown') {
        if (ev.target === 'loan_toshi') { toshiLoan += amount; repairDelta -= amount; }
        if (ev.target === 'loan_lisa') { lisaLoan += amount; repairDelta -= amount; }
      }
      if (ev.event_type === 'balance_adjustment') {
        if (ev.target === 'repair_reserve') { repairDelta += amount; }
        if (ev.target === 'loan_toshi') { toshiLoan = Math.max(0, amount); }
        if (ev.target === 'loan_lisa') { lisaLoan = Math.max(0, amount); }
      }
      if (ev.event_type === 'mortgage_balance_update' && ev.target === 'home_loan') mortgageBalance = Math.max(0, amount);
      noteParts.push(`${ev.event_type}:${ev.target}:${amount}`);
    }
    repair += repairDelta;

    const imported = importedMortgage.get(month);
    const fallback = fallbackMortgage.get(month);
    const mortgage = imported || fallback || {
      starting_balance: mortgageBalance,
      interest: 0,
      payment: 0,
      principal: 0,
      ending_balance: mortgageBalance,
      payment_date: paymentDate,
      schedule_source: 'none',
      final_payment: null,
    };
    mortgageBalance = Math.max(0, Number(mortgage.ending_balance || 0));

    if (month >= fromMonth && month <= toMonth) {
      rows.push({
        month,
        payment_date: mortgage.payment_date || paymentDate,
        repair_reserve_balance: repair,
        repair_reserve_delta: repairDelta,
        repair_monthly_deposit: repairMonthly,
        scheduled_repair_deductions: 0,
        scheduled_repair_deduction_labels: [],
        toshi_loan_balance: Math.max(0, toshiLoan),
        toshi_loan_repayment: thisToshiRepay,
        lisa_loan_balance: Math.max(0, lisaLoan),
        lisa_loan_repayment: thisLisaRepay,
        mortgage_starting_balance: Number(mortgage.starting_balance || 0),
        mortgage_interest: Number(mortgage.interest || 0),
        mortgage_payment: Number(mortgage.payment || 0),
        mortgage_principal: Number(mortgage.principal || 0),
        mortgage_ending_balance: mortgageBalance,
        is_mortgage_imported: Boolean(imported),
        note: noteParts.join(' / '),
      });
    }
  }
  return rows;
}


function recurrenceInterval(sp: any): number | null {
  const freq = String(sp.frequency || '').toLowerCase();
  if (freq === 'every_3_years') return 3;
  if (freq === 'every_5_years') return 5;
  const n = Number(sp.interval_years || 0);
  return n > 0 ? Math.round(n) : null;
}

function scheduledPaymentOccursInMonth(sp: any, month: string): boolean {
  const [year, monthNum] = month.split('-').map(Number);
  const freq = String(sp.frequency || 'monthly').toLowerCase();
  if (freq === 'monthly') return true;
  if (freq === 'yearly') return Number(sp.due_month || 0) === monthNum;
  if (freq === 'once' || freq === 'irregular') return String(sp.due_date || '').startsWith(month);
  const interval = recurrenceInterval(sp);
  if (!interval) return false;
  const dueMonth = Number(sp.due_month || (sp.due_date ? String(sp.due_date).slice(5, 7) : 0));
  if (dueMonth !== monthNum) return false;
  const startYear = Number(sp.recurrence_start_year || (sp.due_date ? String(sp.due_date).slice(0, 4) : 2026));
  return year >= startYear && (year - startYear) % interval === 0;
}

async function repairReserveScheduledDeductions(db: D1Database, from: string, to: string): Promise<Map<string, { amount: number; labels: string[] }>> {
  const cats = ['property_tax', 'earthquake_insurance', 'fire_insurance', 'repair_spend'];
  const rows = await selectAll<any>(db, `SELECT * FROM scheduled_payments
    WHERE archived_at IS NULL AND active = 1
      AND category IN (${cats.map(() => '?').join(',')})
    ORDER BY sort_order ASC, id ASC`, cats);
  const map = new Map<string, { amount: number; labels: string[] }>();
  const months: string[] = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) months.push(m);
  for (const sp of rows) {
    for (const month of months) {
      const [y, mm] = month.split('-').map(Number);
      if (!scheduledPaymentOccursInMonth(sp, month)) continue;
      const current = map.get(month) || { amount: 0, labels: [] };
      current.amount += Math.max(0, Number(sp.amount || 0));
      current.labels.push(`${sp.name}:${sp.amount}${sp.frequency ? ':' + sp.frequency : ''}`);
      map.set(month, current);
    }
  }
  return map;
}

async function projectionFromDb(db: D1Database, from: string, to: string, scheduleSource = 'mortgage_schedule_1_19'): Promise<{ settings: AssetSettings; rows: ProjectionRow[]; events: AssetRebuildEvent[]; mortgage_count: number; scheduled_deductions: any[] }> {
  const settings = await getSettings(db);
  const events = await getEvents(db, fmtMonth(settings.plan_start_date || defaultSettings.plan_start_date), to);
  const mortgageRows = await getMortgageRows(db, scheduleSource, fmtMonth(settings.plan_start_date || defaultSettings.plan_start_date), to);
  const rows = calculateProjection(settings, events, mortgageRows, from, to);
  const deductions = await repairReserveScheduledDeductions(db, from, to);
  const deductionRows: any[] = [];
  let runningAdjustment = 0;
  for (const r of rows) {
    const d = deductions.get(r.month);
    if (d && d.amount > 0) {
      runningAdjustment += d.amount;
      r.scheduled_repair_deductions = d.amount;
      r.scheduled_repair_deduction_labels = d.labels;
      r.repair_reserve_delta -= d.amount;
      r.repair_reserve_balance -= runningAdjustment;
      r.note = [r.note, `scheduled repair-reserve payment: -${d.amount} (${d.labels.join('; ')})`].filter(Boolean).join(' / ');
      deductionRows.push({ month: r.month, amount: d.amount, labels: d.labels });
    } else if (runningAdjustment > 0) {
      r.repair_reserve_balance -= runningAdjustment;
    }
  }
  return { settings, events, mortgage_count: mortgageRows.length, rows, scheduled_deductions: deductionRows };
}

function parseMortgageCsv(text: string, source = 'mortgage_schedule_1_19'): { rows: MortgageScheduleRow[]; warnings: string[] } {
  const raw = parseCsv(text);
  if (!raw.length) return { rows: [], warnings: ['CSV is empty'] };
  const headers = raw[0].map(normalizeHeader);
  const iDate = idx(headers, ['date', 'paymentdate', '返済日', '支払日']);
  const iStart = idx(headers, ['startingbalance', 'startbalance', '開始残高', '返済前残高']);
  const iInterest = idx(headers, ['interest', '利息']);
  const iPayment = idx(headers, ['payment', '返済額', '支払額']);
  const iPrincipal = idx(headers, ['principal', '元金']);
  const iEnd = idx(headers, ['endingbalance', 'endbalance', '終了残高', '返済後残高', '残高']);
  const iFinal = idx(headers, ['finalpayment', 'final', '完済']);
  const warnings: string[] = [];
  if (iDate < 0) warnings.push('Date/payment_date column not found');
  if (iEnd < 0) warnings.push('Ending Balance column not found');
  const rows: MortgageScheduleRow[] = [];
  for (let r = 1; r < raw.length; r++) {
    const c = raw[r];
    const paymentDate = normalizeDateLoose(iDate >= 0 ? c[iDate] : '');
    const ending = parseMoney(iEnd >= 0 ? c[iEnd] : '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(paymentDate)) { warnings.push(`line ${r + 1}: invalid date`); continue; }
    rows.push({
      schedule_source: source,
      payment_date: paymentDate,
      starting_balance: parseMoney(iStart >= 0 ? c[iStart] : ''),
      interest: parseMoney(iInterest >= 0 ? c[iInterest] : ''),
      payment: parseMoney(iPayment >= 0 ? c[iPayment] : ''),
      principal: parseMoney(iPrincipal >= 0 ? c[iPrincipal] : ''),
      ending_balance: ending,
      final_payment: iFinal >= 0 ? String(c[iFinal] || '').trim() || null : null,
      note: 'Imported mortgage schedule row',
    });
  }
  return { rows, warnings };
}

app.get('/settings', async (c) => {
  c.header('Cache-Control', 'no-store, max-age=0');
  return c.json({ items: await getSettings(c.env.DB), defaults: defaultSettings });
});

app.put('/settings', async (c) => {
  const body = await c.req.json<{ items?: Record<string, string | number>; key?: string; value?: string | number }>();
  if (body.items) {
    for (const [k, v] of Object.entries(body.items)) await putSettingWithAliases(c.env.DB, k, String(v));
  } else if (body.key) {
    await putSettingWithAliases(c.env.DB, body.key, String(body.value ?? ''));
  } else {
    return c.json({ error: 'items or key is required' }, 400);
  }
  const settings = await getSettings(c.env.DB);
  const from = fmtMonth(settings.plan_start_date || defaultSettings.plan_start_date);
  const to = settings.projection_end_month || defaultSettings.projection_end_month;
  const projection = await projectionFromDb(c.env.DB, from, to, 'mortgage_schedule_1_19');
  c.header('Cache-Control', 'no-store, max-age=0');
  return c.json({
    ok: true,
    items: settings,
    applied: {
      repair_reserve_monthly_deposit: settings.repair_reserve_monthly_deposit,
      mortgage_monthly_payment: settings.mortgage_monthly_payment,
      loan_toshi_monthly_repayment: settings.loan_toshi_monthly_repayment,
      loan_lisa_monthly_repayment: settings.loan_lisa_monthly_repayment,
    },
    projection_check: projection.rows.slice(0, 3).map((r) => ({
      month: r.month,
      repair_monthly_deposit: r.repair_monthly_deposit,
      repair_reserve_delta: r.repair_reserve_delta,
      repair_reserve_balance: r.repair_reserve_balance,
    })),
  });
});

app.get('/settings/debug', async (c) => {
  const settings = await getSettings(c.env.DB);
  const projection = await projectionFromDb(
    c.env.DB,
    fmtMonth(settings.plan_start_date || defaultSettings.plan_start_date),
    addMonths(fmtMonth(settings.plan_start_date || defaultSettings.plan_start_date), 2),
    'mortgage_schedule_1_19'
  );
  c.header('Cache-Control', 'no-store, max-age=0');
  return c.json({ settings, projection_check: projection.rows.slice(0, 3) });
});

app.get('/projection', async (c) => {
  const settings = await getSettings(c.env.DB);
  const from = c.req.query('from') || fmtMonth(settings.plan_start_date || defaultSettings.plan_start_date);
  const to = c.req.query('to') || settings.projection_end_month || defaultSettings.projection_end_month;
  const scheduleSource = c.req.query('schedule_source') || 'mortgage_schedule_1_19';
  c.header('Cache-Control', 'no-store, max-age=0');
  return c.json(await projectionFromDb(c.env.DB, from, to, scheduleSource));
});

app.get('/summary', async (c) => {
  const month = c.req.query('month') || fmtMonth(new Date().toISOString());
  const p = await projectionFromDb(c.env.DB, month, month);
  const row = p.rows[0] || null;
  const payoff = await selectOne<{ last_month: string; rows: number }>(c.env.DB,
    `SELECT MAX(substr(payment_date,1,7)) AS last_month, COUNT(*) AS rows FROM mortgage_schedule_rows WHERE schedule_source = 'mortgage_schedule_1_19'`
  );
  return c.json({ month, row, payoff_month: payoff?.last_month || null, mortgage_rows: payoff?.rows || 0 });
});

app.get('/events', async (c) => {
  const from = c.req.query('from') || '2026-01';
  const to = c.req.query('to') || '2051-12';
  return c.json({ items: await getEvents(c.env.DB, from, to) });
});

app.post('/events', async (c) => {
  const b = await c.req.json<any>();
  const target = normalizeTarget(b.target || b.setting_key);
  const eventType = normalizeEventType(b.event_type);
  const amount = parseMoney(b.amount);
  const date = normalizeDateLoose(b.event_date || b.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'event_date must be YYYY-MM-DD' }, 400);
  const result = await c.env.DB.prepare(
    `INSERT INTO asset_rebuild_events (event_date, target, event_type, amount, paid_by, burden_owner, account_id, note, source_type, source_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(date, target, eventType, amount, normalizeOwner(b.paid_by, 'other'), normalizeOwner(b.burden_owner, 'other'), b.account_id ?? null, b.note ?? null, b.source_type ?? 'manual', b.source_key ?? null).run();
  return c.json({ ok: true, id: result.meta.last_row_id }, 201);
});

app.patch('/events/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<any>();
  const fields: string[] = [];
  const values: any[] = [];
  const patch: Record<string, any> = {};
  if ('event_date' in b || 'date' in b) patch.event_date = normalizeDateLoose(b.event_date || b.date);
  if ('target' in b || 'setting_key' in b) patch.target = normalizeTarget(b.target || b.setting_key);
  if ('event_type' in b) patch.event_type = normalizeEventType(b.event_type);
  if ('amount' in b) patch.amount = parseMoney(b.amount);
  if ('paid_by' in b) patch.paid_by = normalizeOwner(b.paid_by, 'other');
  if ('burden_owner' in b) patch.burden_owner = normalizeOwner(b.burden_owner, 'other');
  if ('account_id' in b) patch.account_id = b.account_id ?? null;
  if ('note' in b) patch.note = b.note ?? null;
  for (const [k, v] of Object.entries(patch)) { fields.push(`${k} = ?`); values.push(v); }
  if (!fields.length) return c.json({ error: 'no fields to update' }, 400);
  await exec(c.env.DB, `UPDATE asset_rebuild_events SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [...values, id]);
  return c.json({ ok: true });
});

app.delete('/events/:id', async (c) => {
  const id = Number(c.req.param('id'));
  await exec(c.env.DB, `DELETE FROM asset_rebuild_events WHERE id = ?`, [id]);
  return c.json({ ok: true });
});

app.post('/mortgage/import/preview', async (c) => {
  const b = await c.req.json<{ csv?: string; source?: string }>();
  const result = parseMortgageCsv(b.csv || '', b.source || 'mortgage_schedule_1_19');
  return c.json({ count: result.rows.length, rows: result.rows.slice(0, 24), warnings: result.warnings });
});

app.post('/mortgage/import/commit', async (c) => {
  const b = await c.req.json<{ csv?: string; rows?: MortgageScheduleRow[]; source?: string; replace?: boolean; confirm?: boolean }>();
  if (!b.confirm) return c.json({ error: 'confirm is required' }, 400);
  const source = b.source || 'mortgage_schedule_1_19';
  const parsed = b.rows ? { rows: b.rows, warnings: [] as string[] } : parseMortgageCsv(b.csv || '', source);
  let replaced = 0;
  if (b.replace !== false) {
    const r = await c.env.DB.prepare(`DELETE FROM mortgage_schedule_rows WHERE schedule_source = ?`).bind(source).run();
    replaced = Number((r.meta as any)?.changes || 0);
  }
  let inserted = 0;
  const stmt = c.env.DB.prepare(
    `INSERT INTO mortgage_schedule_rows
     (schedule_source, payment_date, starting_balance, interest, payment, principal, ending_balance, final_payment, note, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(schedule_source, payment_date) DO UPDATE SET
       starting_balance = excluded.starting_balance,
       interest = excluded.interest,
       payment = excluded.payment,
       principal = excluded.principal,
       ending_balance = excluded.ending_balance,
       final_payment = excluded.final_payment,
       note = excluded.note,
       updated_at = CURRENT_TIMESTAMP`
  );
  const binds = parsed.rows.map((r) => stmt.bind(source, r.payment_date, r.starting_balance, r.interest, r.payment, r.principal, r.ending_balance, r.final_payment, r.note || null));
  for (let i = 0; i < binds.length; i += 50) {
    const res = await c.env.DB.batch(binds.slice(i, i + 50));
    inserted += res.length;
  }
  await putSetting(c.env.DB, 'projection_end_month', parsed.rows.length ? fmtMonth(parsed.rows[parsed.rows.length - 1].payment_date) : defaultSettings.projection_end_month);
  return c.json({ ok: true, source, replaced, inserted, warnings: parsed.warnings, first: parsed.rows[0]?.payment_date || null, last: parsed.rows[parsed.rows.length - 1]?.payment_date || null });
});

app.post('/sync-loan-repayments', async (c) => {
  const b = await c.req.json<{ from?: string; to?: string; confirm?: boolean }>();
  if (!b.confirm) return c.json({ error: 'confirm is required' }, 400);
  const settings = await getSettings(c.env.DB);
  const from = b.from || fmtMonth(settings.plan_start_date || defaultSettings.plan_start_date);
  const to = b.to || addMonths(from, 11);
  const p = await projectionFromDb(c.env.DB, from, to);
  let inserted = 0;
  let skipped = 0;
  for (const row of p.rows) {
    const entries: { owner: Owner; amount: number; label: string; sourceId: number }[] = [
      { owner: 'toshi', amount: row.toshi_loan_repayment, label: '夫 貸付金返済', sourceId: Number(row.month.replace('-', '')) * 10 + 1 },
      { owner: 'lisa', amount: row.lisa_loan_repayment, label: '妻 貸付金返済', sourceId: Number(row.month.replace('-', '')) * 10 + 2 },
    ];
    for (const entry of entries) {
      if (entry.amount <= 0) continue;
      const existing = await selectOne<{ id: number }>(c.env.DB,
        `SELECT id FROM ledger_links WHERE source_type = ? AND source_id = ? AND owner = ? AND month = ?`,
        ['asset_loan_repayment_v2', entry.sourceId, entry.owner, row.month]
      );
      if (existing) { skipped++; continue; }
      const r = await c.env.DB.prepare(
        `INSERT INTO expenses (date, amount, description, payer, paid_by, burden_owner, billing_month, payment_due_date, cycle_month, card_id, category, note)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
      ).bind(row.payment_date, entry.amount, entry.label, entry.owner, entry.owner, entry.owner, row.month, row.payment_date, row.month, '貸付金返済', 'asset_rebuild_v2 sync').run();
      await idempotentLink(c.env.DB, { source_type: 'asset_loan_repayment_v2', source_id: entry.sourceId, owner: entry.owner, month: row.month, amount: entry.amount, expense_id: Number(r.meta.last_row_id) });
      inserted++;
    }
  }
  await c.env.DB.prepare(
    `INSERT INTO asset_rebuild_sync_runs (sync_type, from_month, to_month, inserted_count, skipped_count, note)
     VALUES ('loan_repayments_to_expenses', ?, ?, ?, ?, ?)`
  ).bind(from, to, inserted, skipped, 'Synced monthly loan repayments to expenses').run();
  return c.json({ ok: true, from, to, inserted, skipped });
});

app.get('/export.csv', async (c) => {
  const from = c.req.query('from') || '2026-05';
  const to = c.req.query('to') || '2051-05';
  const p = await projectionFromDb(c.env.DB, from, to);
  const headers = ['month','payment_date','repair_reserve_balance','repair_reserve_delta','repair_monthly_deposit','scheduled_repair_deductions','scheduled_repair_deduction_labels','toshi_loan_balance','toshi_loan_repayment','lisa_loan_balance','lisa_loan_repayment','mortgage_starting_balance','mortgage_interest','mortgage_payment','mortgage_principal','mortgage_ending_balance','mortgage_imported','note'];
  const rows = p.rows.map((r) => [r.month, r.payment_date, r.repair_reserve_balance, r.repair_reserve_delta, r.repair_monthly_deposit, r.scheduled_repair_deductions || 0, (r.scheduled_repair_deduction_labels || []).join(' / '), r.toshi_loan_balance, r.toshi_loan_repayment, r.lisa_loan_balance, r.lisa_loan_repayment, r.mortgage_starting_balance, r.mortgage_interest, r.mortgage_payment, r.mortgage_principal, r.mortgage_ending_balance, r.is_mortgage_imported ? 1 : 0, r.note]);
  return new Response(csv(headers, rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="asset-rebuild-${from}-${to}.csv"` } });
});

app.get('/audit', async (c) => {
  const mortgage = await selectOne<any>(c.env.DB, `SELECT COUNT(*) AS rows, MIN(payment_date) AS first_date, MAX(payment_date) AS last_date, MIN(ending_balance) AS min_balance FROM mortgage_schedule_rows WHERE schedule_source = 'mortgage_schedule_1_19'`);
  const loanLinks = await selectOne<any>(c.env.DB, `SELECT COUNT(*) AS rows, SUM(amount) AS amount FROM ledger_links WHERE source_type = 'asset_loan_repayment_v2'`);
  const settings = await getSettings(c.env.DB);
  return c.json({ settings, mortgage_schedule: mortgage, loan_repayment_links: loanLinks, model: 'repair_reserve + mortgage + husband/wife loans rebuilt from Phase11' });
});

export default app;
