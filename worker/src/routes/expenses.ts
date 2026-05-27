import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, selectOne, exec } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();
const BOM = '\uFEFF';

type Card = {
  id: number;
  name: string;
  owner: string;
  close_day: number;
  pay_day: number;
  default_paid_by?: string | null;
  default_burden_owner?: string | null;
  card_kind?: string | null;
};

type ExpenseRow = {
  id: number;
  date: string;
  amount: number;
  description: string;
  payer: string;
  paid_by?: string | null;
  burden_owner?: string | null;
  billing_month: string;
  card_id: number | null;
  category: string | null;
  note: string | null;
  card_name?: string | null;
  close_day?: number | null;
  pay_day?: number | null;
  payment_due_date?: string | null;
  cycle_month?: string | null;
  payment_method?: string | null;
  archived_at?: string | null;
};

type PreviewRow = {
  line: number;
  date: string;
  amount: number | null;
  description: string;
  payer: string;
  paid_by: string;
  burden_owner: string;
  billing_month: string;
  payment_due_date: string | null;
  cycle_month: string;
  card_id: number | null;
  card_name: string;
  category: string;
  note: string;
  import_key: string;
  warnings: string[];
};

function addMonthsDate(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1 + delta, Math.min(d || 1, 28)));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function paymentDateForBillingMonth(billingMonth: string, payDay?: number | null): string | null {
  if (!/^\d{4}-\d{2}$/.test(billingMonth) || !payDay) return null;
  const [y, m] = billingMonth.split('-').map(Number);
  const day = Math.min(Math.max(1, Number(payDay)), daysInMonth(y, m));
  return `${billingMonth}-${String(day).padStart(2, '0')}`;
}

function cycleMonthForDate(date: string, startDay = 25): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return String(date || '').slice(0, 7);
  const day = Number(date.slice(8, 10));
  if (day >= startDay) return date.slice(0, 7);
  const [y, m] = date.slice(0, 7).split('-').map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeDateLoose(input: unknown): string {
  const raw = String(input ?? '').trim().replace(/^\uFEFF/, '');
  if (!raw) return '';
  const slash = raw.replace(/[.\/]/g, '-');
  const m = slash.match(/^(\d{2}|\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return slash;
  let y = Number(m[1]);
  if (y < 100) y += 2000;
  const mm = String(Number(m[2])).padStart(2, '0');
  const dd = String(Number(m[3])).padStart(2, '0');
  return `${y}-${mm}-${dd}`;
}

function preferredCycleBasis(paymentDueDate: string | null, date: string): string {
  return paymentDueDate && /^\d{4}-\d{2}-\d{2}$/.test(paymentDueDate) ? paymentDueDate : date;
}

function billingMonthFor(date: string, card?: Card | null): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return String(date || '').slice(0, 7);
  if (!card) return date.slice(0, 7);
  const day = Number(date.slice(8, 10));
  const closeDay = Math.min(Math.max(1, Number(card.close_day || 31)), 31);
  return addMonthsDate(date, day <= closeDay ? 1 : 2);
}

function parseNumberLoose(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const s = String(input).trim().replace(/^\uFEFF/, '').replace(/[,，]/g, '').replace(/[￥¥\s]/g, '');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n) : null;
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
      else if (ch === '\n') { row.push(cell); if (row.some((v) => v.trim() !== '')) rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
  }
  row.push(cell);
  if (row.some((v) => v.trim() !== '')) rows.push(row);
  return rows;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/^\uFEFF/, '').replace(/[\s_\-　]/g, '').replace(/[()（）]/g, '');
}

function normalizePayer(input: string | undefined): string {
  const raw = String(input || '').trim();
  const lower = raw.toLowerCase();
  const map: Record<string, string> = {
    '夫': 'toshi', '旦那': 'toshi', '主人': 'toshi', 'toshi': 'toshi', 'husband': 'toshi', 't': 'toshi', '夫負担': 'toshi',
    '妻': 'lisa', 'lisa': 'lisa', 'wife': 'lisa', 'l': 'lisa', '妻負担': 'lisa',
    '共同': 'shared', '共通': 'shared', '折半': 'shared', '半分': 'shared', 'shared': 'shared', 'joint': 'shared', 'split': 'shared', 'half': 'shared', '両方': 'shared',
    'その他': 'other', '対象外': 'other', 'other': 'other', 'others': 'other',
  };
  return map[raw] || map[lower] || lower || 'other';
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function makeImportKey(r: { date: string; amount: number | null; description: string; payer: string; paid_by?: string; burden_owner?: string; billing_month: string; card_id: number | null; card_name?: string; category: string; note: string; explicit?: string }) {
  if (r.explicit && r.explicit.trim()) return `csv:${r.explicit.trim()}`;
  return ['csv-expense', r.date, String(r.amount ?? ''), r.description.trim(), r.payer, r.paid_by || '', r.burden_owner || r.payer, r.billing_month, String(r.card_id ?? ''), (r.card_name || '').trim(), r.category.trim(), r.note.trim()]
    .join('|')
    .replace(/\s+/g, ' ');
}

async function getCards(db: D1Database): Promise<Card[]> {
  return await selectAll<Card>(db, `SELECT * FROM cards WHERE archived_at IS NULL ORDER BY id ASC`);
}

function normalizeCardName(input: string | undefined): string {
  const raw = String(input || '').trim();
  const compact = raw.toLowerCase().replace(/[\s_\-　]/g, '');
  const aliases: Record<string, string> = {
    'jalcard': 'jal',
    'jalカード': 'jal',
    'jal': 'jal',
    'amazoncard': 'amazon',
    'amazonmastercard': 'amazon',
    'amazonカード': 'amazon',
    'amazon': 'amazon',
    'marriottamex': 'marriottamex',
    'marriott': 'marriottamex',
    'マリオットアメックス': 'marriottamex',
    'deltaamex': 'deltaamex',
    'デルタアメックス': 'deltaamex',
    'paypayカード': 'paypayカード',
    'paypaycard': 'paypayカード',
  };
  return aliases[compact] || compact;
}

function cardByInput(cards: Card[], cardIdRaw: string | undefined, cardNameRaw: string | undefined): Card | null {
  const id = parseNumberLoose(cardIdRaw);
  if (id !== null) return cards.find((c) => c.id === id) || null;
  const name = normalizeCardName(cardNameRaw);
  if (!name) return null;
  return cards.find((c) => normalizeCardName(c.name) === name) || null;
}

function idx(headers: string[], candidates: string[]): number {
  const normalized = candidates.map(normalizeHeader);
  for (let i = 0; i < headers.length; i++) if (normalized.includes(headers[i])) return i;
  return -1;
}

function fatalWarnings(warnings: string[]): string[] {
  return warnings.filter((w) => !w.startsWith('WARN:'));
}

async function logUndo(
  db: D1Database,
  operation: 'create' | 'update' | 'delete',
  recordId: number,
  beforeData: any | null,
  afterData: any | null
) {
  await db.prepare(
    `INSERT INTO undo_log (user_email, table_name, operation, record_id, before_data, after_data)
     VALUES (?, 'expenses', ?, ?, ?, ?)`
  ).bind(null, operation, recordId, beforeData ? JSON.stringify(beforeData) : null, afterData ? JSON.stringify(afterData) : null).run();
}

function normalizeOptionalDate(input: any): string | null {
  const v = String(input ?? '').trim();
  if (!v) return null;
  return normalizeDateLoose(v);
}

function normalizeMonth(input: any): string | null {
  const v = String(input ?? '').trim().replace(/\//g, '-');
  return /^\d{4}-\d{2}$/.test(v) ? v : null;
}

async function previewCsv(db: D1Database, text: string, opts: { source?: string; month_policy?: 'cycle' | 'card_payment' | 'explicit_or_card'; force_card_id?: number | null; target_billing_month?: string | null } = {}): Promise<{ rows: PreviewRow[]; warnings: string[]; count: number }> {
  const raw = parseCsv(text);
  if (raw.length === 0) return { rows: [], warnings: ['CSV is empty'], count: 0 };
  const headers = raw[0].map(normalizeHeader);
  const iDate = idx(headers, ['date', 'usage_date', '利用日', 'ご利用日', '日付']);
  const iAmount = idx(headers, ['amount', '利用金額', 'ご利用金額', '金額', 'お支払い金額']);
  const iDesc = idx(headers, ['description', 'desc', 'merchant', 'store', '利用店名', 'ご利用店名', '内容', '店名', '詳細']);
  const iPayer = idx(headers, ['payer', '支払者', '負担者', 'owner', '所有者']);
  const iPaidBy = idx(headers, ['paid_by', 'paidby', '実支払者', '実際の支払者', '立替者', '支払元']);
  const iBurden = idx(headers, ['burden_owner', 'burdenowner', '負担者', '最終負担者']);
  const iBilling = idx(headers, ['billing_month', 'billingmonth', '請求月', '支払予定月', 'お支払い月']);
  const iPaymentDue = idx(headers, ['payment_due_date', 'paymentdate', 'due_date', 'duedate', '支払日', '支払予定日', '引落日', '引き落とし日']);
  const iCardId = idx(headers, ['card_id', 'cardid', 'カードid']);
  const iCardName = idx(headers, ['card_name', 'card', 'カード名', 'カード']);
  const iCategory = idx(headers, ['category', 'カテゴリ', '分類']);
  const iNote = idx(headers, ['note', 'memo', 'メモ', '備考']);
  const iKey = idx(headers, ['import_key', 'transaction_id', '取込キー', '明細id', 'id']);
  const warnings: string[] = [];
  if (iDate < 0) warnings.push('date/利用日/ご利用日 column not found');
  if (iAmount < 0) warnings.push('amount/金額/ご利用金額 column not found');
  if (iDesc < 0) warnings.push('description/利用店名/内容 column not found');
  const cards = await getCards(db);
  const forcedCard = opts.force_card_id ? cards.find((c) => c.id === Number(opts.force_card_id)) || null : null;
  const targetBillingMonth = /^\d{4}-\d{2}$/.test(String(opts.target_billing_month || '')) ? String(opts.target_billing_month) : '';
  const rows: PreviewRow[] = [];
  for (let r = 1; r < raw.length; r++) {
    const cols = raw[r];
    const line = r + 1;
    const date = normalizeDateLoose(iDate >= 0 ? cols[iDate] : '');
    const amount = parseNumberLoose(iAmount >= 0 ? cols[iAmount] : '');
    const description = (iDesc >= 0 ? cols[iDesc] || '' : '').trim();
    const payer = normalizePayer(iPayer >= 0 ? cols[iPayer] : 'other');
    const burden_owner = normalizePayer(iBurden >= 0 ? cols[iBurden] : (iPayer >= 0 ? cols[iPayer] : 'other'));
    const rawCardName = iCardName >= 0 ? (cols[iCardName] || '').trim() : '';
    const card = forcedCard || cardByInput(cards, iCardId >= 0 ? cols[iCardId] : undefined, rawCardName);
    const cardName = card?.name || rawCardName;
    const explicitBilling = iBilling >= 0 ? (cols[iBilling] || '').trim().replace(/\//g, '-') : '';
    const source = String(opts.source || '').trim();
    const forceCycle = opts.month_policy === 'cycle' || source === 'kakeibo_all';
    const paid_by = normalizePayer(iPaidBy >= 0 ? cols[iPaidBy] : (source === 'kakeibo_all' ? 'toshi' : (card?.default_paid_by || card?.owner || payer)));
    const autoPaymentMonth = billingMonthFor(date, card);
    const chosenBillingMonth = targetBillingMonth || (/^\d{4}-\d{2}$/.test(explicitBilling) ? explicitBilling : autoPaymentMonth);
    const autoPaymentDate = paymentDateForBillingMonth(chosenBillingMonth, card?.pay_day);
    const explicitPaymentDue = iPaymentDue >= 0 ? normalizeOptionalDate(cols[iPaymentDue]) : null;
    const payment_due_date = explicitPaymentDue || (forceCycle ? date : autoPaymentDate);
    const cycle_month = cycleMonthForDate(preferredCycleBasis(payment_due_date, date));
    const billing_month = forceCycle && !targetBillingMonth ? cycle_month : chosenBillingMonth;
    const category = iCategory >= 0 ? (cols[iCategory] || '').trim() : '';
    const note = iNote >= 0 ? (cols[iNote] || '').trim() : '';
    const rowWarnings: string[] = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) rowWarnings.push('date must be YYYY-MM-DD');
    if (amount === null) rowWarnings.push('amount is invalid');
    if (!description) rowWarnings.push('description is empty');
    if (!['toshi', 'lisa', 'shared', 'other'].includes(payer)) rowWarnings.push('payer is invalid');
    if (opts.force_card_id && !forcedCard) rowWarnings.push('WARN: selected card was not found; imported without card link');
    if (rawCardName && !card && !opts.force_card_id) rowWarnings.push(`WARN: card not registered; imported without card link: ${rawCardName}`);
    if (!/^\d{4}-\d{2}$/.test(billing_month)) rowWarnings.push('billing_month could not be calculated');
    const import_key = makeImportKey({ date, amount, description, payer, paid_by, burden_owner, billing_month, card_id: card?.id ?? null, card_name: cardName, category, note, explicit: iKey >= 0 ? cols[iKey] : undefined });
    rows.push({ line, date, amount, description, payer, paid_by, burden_owner, billing_month, payment_due_date, cycle_month, card_id: card?.id ?? null, card_name: cardName, category, note, import_key, warnings: rowWarnings });
  }
  return { rows, warnings, count: rows.length };
}

function withPaymentDate(row: ExpenseRow): ExpenseRow {
  const payment_due_date = row.payment_due_date || paymentDateForBillingMonth(row.billing_month, row.pay_day);
  return { ...row, payment_due_date, cycle_month: row.cycle_month || cycleMonthForDate(preferredCycleBasis(payment_due_date, row.date)) };
}

app.get('/', async (c) => {
  const { month, payer, card_id, limit = '500', order = 'desc', sort = 'date' } = c.req.query();
  const basis = String(c.req.query('basis') || 'billing');
  const where: string[] = ['e.archived_at IS NULL'];
  const params: any[] = [];
  if (month) {
    if (basis === 'payment_due') where.push("substr(COALESCE(e.payment_due_date, e.date), 1, 7) = ?");
    else if (basis === 'cycle') where.push('COALESCE(e.cycle_month, e.billing_month) = ?');
    else where.push('e.billing_month = ?');
    params.push(month);
  }
  if (payer) { where.push('e.payer = ?'); params.push(payer); }
  if (card_id) { where.push('e.card_id = ?'); params.push(Number(card_id)); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortMap: Record<string, string> = { date: 'e.date', amount: 'e.amount', billing_month: 'e.billing_month', cycle_month: 'e.cycle_month', payment_due_date: 'e.payment_due_date', description: 'e.description', id: 'e.id' };
  const sortCol = sortMap[String(sort)] || 'e.date';
  const sortOrder = String(order).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const rows = await selectAll<ExpenseRow>(
    c.env.DB,
    `SELECT e.*, c.name AS card_name, c.close_day, c.pay_day
     FROM expenses e LEFT JOIN cards c ON e.card_id = c.id
     ${whereSql}
     ORDER BY ${sortCol} ${sortOrder}, e.id ${sortOrder}
     LIMIT ?`,
    [...params, Number(limit)]
  );
  return c.json({ items: rows.map(withPaymentDate) });
});

app.get('/billing-rules', async (c) => {
  const cards = await getCards(c.env.DB);
  return c.json({
    definition: 'Budget reporting is based on billing_month. payment_due_date is used for cashflow timing only.',
    items: cards.map((card) => ({
      ...card,
      example: {
        usage_date: '2026-04-15',
        billing_month: billingMonthFor('2026-04-15', card),
        payment_due_date: paymentDateForBillingMonth(billingMonthFor('2026-04-15', card), card.pay_day),
      },
    })),
  });
});

app.post('/import/preview', async (c) => {
  const b = await c.req.json<{ csv?: string; source?: string; month_policy?: 'cycle' | 'card_payment' | 'explicit_or_card'; force_card_id?: number | null; target_billing_month?: string | null }>();
  return c.json(await previewCsv(c.env.DB, b.csv || '', { source: b.source, month_policy: b.month_policy, force_card_id: b.force_card_id ?? null, target_billing_month: b.target_billing_month ?? null }));
});

app.post('/import/commit', async (c) => {
  const b = await c.req.json<{
    rows?: PreviewRow[];
    csv?: string;
    confirm?: boolean;
    source?: string;
    source_file?: string;
    target_month?: string;
    mode?: 'append' | 'replace_imported';
    month_policy?: 'cycle' | 'card_payment' | 'explicit_or_card';
    force_card_id?: number | null;
    target_billing_month?: string | null;
  }>();
  if (!b.confirm) return c.json({ error: 'confirm is required' }, 400);
  const rows = b.rows || (await previewCsv(c.env.DB, b.csv || '', { source: b.source, month_policy: b.month_policy, force_card_id: b.force_card_id ?? null, target_billing_month: b.target_billing_month ?? null })).rows;
  const source = String(b.source || 'csv').trim() || 'csv';
  const sourceFile = String(b.source_file || '').trim() || null;
  const mode = b.mode === 'replace_imported' ? 'replace_imported' : 'append';
  const distinctMonths = Array.from(new Set(rows.map((r) => r.billing_month).filter(Boolean)));
  const targetMonth = b.target_month || (distinctMonths.length === 1 ? distinctMonths[0] : null);
  const warningCount = rows.filter((r) => r.warnings?.length || r.amount === null).length;

  const batchInsert = await c.env.DB.prepare(
    `INSERT INTO import_batches (source, target, target_month, source_file, mode, status, warning_count)
     VALUES (?, 'expenses', ?, ?, ?, 'running', ?)`
  ).bind(source, targetMonth, sourceFile, mode, warningCount).run();
  const batchId = Number(batchInsert.meta.last_row_id);

  let replaced = 0;
  if (mode === 'replace_imported') {
    const where = targetMonth ? 'source = ? AND target_month = ?' : 'source = ?';
    const params = targetMonth ? [source, targetMonth] : [source];
    const archiveExpenses = await c.env.DB.prepare(
      `UPDATE expenses SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id IN (SELECT expense_id FROM expense_import_keys WHERE ${where})`
    ).bind(...params).run();
    await c.env.DB.prepare(`DELETE FROM expense_import_keys WHERE ${where}`).bind(...params).run();
    replaced = Number((archiveExpenses.meta as any)?.changes || 0);
  }

  let inserted = 0;
  let skippedInvalid = 0;
  let skippedDuplicate = 0;
  const details: any[] = [];
  for (const r of rows) {
    const fatal = fatalWarnings(r.warnings || []);
    if (fatal.length || r.amount === null) { skippedInvalid++; details.push({ line: r.line, status: 'invalid', warnings: r.warnings }); continue; }
    const existing = await selectOne<{ id: number }>(c.env.DB, `SELECT id FROM expense_import_keys WHERE import_key = ?`, [r.import_key]);
    if (existing) { skippedDuplicate++; details.push({ line: r.line, status: 'duplicate' }); continue; }
    const result = await c.env.DB.prepare(
      `INSERT INTO expenses (date, amount, description, payer, paid_by, burden_owner, billing_month, payment_due_date, cycle_month, card_id, category, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(r.date, r.amount, r.description, r.payer, r.paid_by, r.burden_owner || r.payer, r.billing_month, r.payment_due_date, r.cycle_month || r.billing_month, r.card_id, r.category || null, r.note || null).run();
    const expenseId = result.meta.last_row_id as number;
    await logUndo(c.env.DB, 'create', expenseId, null, { ...r, id: expenseId });
    await c.env.DB.prepare(
      `INSERT INTO expense_import_keys (import_key, source, expense_id, import_batch_id, source_file, target_month)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(r.import_key, source, expenseId, batchId, sourceFile, r.billing_month).run();
    inserted++;
    details.push({ line: r.line, status: 'inserted', expense_id: expenseId, warnings: r.warnings?.filter((x) => x.startsWith('WARN:')) || [] });
  }

  await c.env.DB.prepare(
    `UPDATE import_batches
     SET status = 'committed', inserted_count = ?, skipped_count = ?, replaced_count = ?, warning_count = ?
     WHERE id = ?`
  ).bind(inserted, skippedInvalid + skippedDuplicate, replaced, warningCount, batchId).run();

  return c.json({ ok: true, batch_id: batchId, source, target_month: targetMonth, mode, replaced, inserted, skipped_invalid: skippedInvalid, skipped_duplicate: skippedDuplicate, details });
});

app.get('/import/batches', async (c) => {
  const source = c.req.query('source');
  const targetMonth = c.req.query('target_month');
  const where: string[] = [`target = 'expenses'`];
  const params: any[] = [];
  if (source) { where.push('source = ?'); params.push(source); }
  if (targetMonth) { where.push('target_month = ?'); params.push(targetMonth); }
  const rows = await selectAll<any>(c.env.DB, `SELECT * FROM import_batches WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT 50`, params);
  return c.json({ items: rows });
});

app.get('/export.csv', async (c) => {
  const month = c.req.query('month');
  const lang = c.req.query('lang') || 'ja';
  const basis = String(c.req.query('basis') || 'billing');
  const monthWhere = basis === 'payment_due'
    ? "substr(COALESCE(e.payment_due_date, e.date), 1, 7) = ?"
    : basis === 'cycle'
      ? 'COALESCE(e.cycle_month, e.billing_month) = ?'
      : 'e.billing_month = ?';
  const where = month ? `WHERE e.archived_at IS NULL AND ${monthWhere}` : 'WHERE e.archived_at IS NULL';
  const params = month ? [month] : [];
  const rows = await selectAll<ExpenseRow>(
    c.env.DB,
    `SELECT e.*, c.name AS card_name, c.close_day, c.pay_day
     FROM expenses e LEFT JOIN cards c ON e.card_id = c.id
     ${where}
     ORDER BY e.date ASC, e.id ASC`,
    params
  );
  const headers = lang === 'en'
    ? ['date', 'amount', 'description', 'burden_owner', 'paid_by', 'payment_method', 'billing_month', 'cycle_month', 'payment_due_date', 'card_name', 'category', 'note']
    : ['日付', '金額', '内容', '負担者', '実支払者', '支払い手段', '請求月', '家計月', '支払予定日', 'カード名', 'カテゴリ', 'メモ'];
  const body = rows.map((x) => withPaymentDate(x)).map((r) => [r.date, r.amount, r.description, r.burden_owner || r.payer, r.paid_by || '', r.payment_method || (r.card_id ? 'card' : ''), r.billing_month, r.cycle_month || '', r.payment_due_date || '', r.card_name || '', r.category || '', r.note || '']);
  return new Response(BOM + [headers.map(csvEscape).join(','), ...body.map((r) => r.map(csvEscape).join(','))].join('\n') + '\n', {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="expenses-${month || 'all'}.csv"` },
  });
});

app.get('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await selectOne<ExpenseRow>(c.env.DB, `SELECT e.*, c.name AS card_name, c.close_day, c.pay_day FROM expenses e LEFT JOIN cards c ON e.card_id = c.id WHERE e.id = ? AND e.archived_at IS NULL`, [id]);
  if (!row) return c.json({ error: 'not found' }, 404);
  return c.json(withPaymentDate(row));
});

app.post('/', async (c) => {
  const body = await c.req.json<any>();
  const date = normalizeDateLoose(body.date);
  const amount = parseNumberLoose(body.amount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  if (amount === null) return c.json({ error: 'amount is invalid' }, 400);
  if (!body.description) return c.json({ error: 'description is required' }, 400);
  const card = body.card_id ? await selectOne<Card>(c.env.DB, `SELECT * FROM cards WHERE id = ?`, [Number(body.card_id)]) : null;
  const payer = normalizePayer(body.payer || body.burden_owner || 'other');
  const billingMonth = normalizeMonth(body.billing_month) || billingMonthFor(date, card);
  const explicitPaymentDue = normalizeOptionalDate(body.payment_due_date);
  const paymentDueDate = explicitPaymentDue || paymentDateForBillingMonth(billingMonth, card?.pay_day);
  const cycleMonth = normalizeMonth(body.cycle_month) || cycleMonthForDate(preferredCycleBasis(paymentDueDate, date));
  const paidBy = normalizePayer(body.paid_by || card?.default_paid_by || card?.owner || payer);
  const burdenOwner = normalizePayer(body.burden_owner || payer);
  const paymentMethod = String(body.payment_method || (body.card_id ? 'card' : 'other')).trim() || null;
  const r = await c.env.DB.prepare(
    `INSERT INTO expenses (date, amount, description, payer, paid_by, burden_owner, billing_month, payment_due_date, cycle_month, card_id, category, note, payment_method)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(date, amount, body.description, burdenOwner, paidBy, burdenOwner, billingMonth, paymentDueDate, cycleMonth, body.card_id ? Number(body.card_id) : null, body.category ?? null, body.note ?? null, paymentMethod).run();
  const id = Number(r.meta.last_row_id);
  const after = await selectOne<ExpenseRow>(c.env.DB, `SELECT * FROM expenses WHERE id = ?`, [id]);
  await logUndo(c.env.DB, 'create', id, null, after);
  return c.json({ id, billing_month: billingMonth, payment_due_date: paymentDueDate, cycle_month: cycleMonth }, 201);
});

app.patch('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const before = await selectOne<ExpenseRow>(c.env.DB, `SELECT * FROM expenses WHERE id = ? AND archived_at IS NULL`, [id]);
  if (!before) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<Record<string, any>>();
  const next: any = { ...before };
  if ('date' in body) next.date = normalizeDateLoose(body.date);
  if ('amount' in body) next.amount = parseNumberLoose(body.amount);
  if ('description' in body) next.description = String(body.description || '').trim();
  if ('payer' in body || 'burden_owner' in body) next.burden_owner = normalizePayer(body.burden_owner ?? body.payer);
  if ('payer' in body || 'burden_owner' in body) next.payer = next.burden_owner;
  if ('paid_by' in body) next.paid_by = normalizePayer(body.paid_by);
  if ('card_id' in body) next.card_id = body.card_id ? Number(body.card_id) : null;
  if ('category' in body) next.category = body.category || null;
  if ('note' in body) next.note = body.note || null;
  if ('payment_method' in body) next.payment_method = String(body.payment_method || '').trim() || null;

  const card = next.card_id ? await selectOne<Card>(c.env.DB, `SELECT * FROM cards WHERE id = ?`, [Number(next.card_id)]) : null;
  if ('billing_month' in body) next.billing_month = normalizeMonth(body.billing_month) || next.billing_month;
  if ('payment_due_date' in body) next.payment_due_date = normalizeOptionalDate(body.payment_due_date) || paymentDateForBillingMonth(next.billing_month, card?.pay_day);
  if (!('payment_due_date' in body) && ('billing_month' in body || 'card_id' in body)) next.payment_due_date = next.payment_due_date || paymentDateForBillingMonth(next.billing_month, card?.pay_day);
  if ('cycle_month' in body) next.cycle_month = normalizeMonth(body.cycle_month) || cycleMonthForDate(preferredCycleBasis(next.payment_due_date, next.date));
  else if ('date' in body || 'payment_due_date' in body || 'billing_month' in body || 'card_id' in body) next.cycle_month = cycleMonthForDate(preferredCycleBasis(next.payment_due_date, next.date));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(next.date)) return c.json({ error: 'date must be YYYY-MM-DD' }, 400);
  if (next.amount === null || next.amount === undefined) return c.json({ error: 'amount is invalid' }, 400);
  if (!next.description) return c.json({ error: 'description is required' }, 400);

  await exec(
    c.env.DB,
    `UPDATE expenses SET date = ?, amount = ?, description = ?, payer = ?, paid_by = ?, burden_owner = ?, billing_month = ?, payment_due_date = ?, cycle_month = ?, card_id = ?, category = ?, note = ?, payment_method = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [next.date, next.amount, next.description, next.payer, next.paid_by, next.burden_owner, next.billing_month, next.payment_due_date, next.cycle_month, next.card_id, next.category, next.note, next.payment_method, id]
  );
  const after = await selectOne<ExpenseRow>(c.env.DB, `SELECT * FROM expenses WHERE id = ?`, [id]);
  await logUndo(c.env.DB, 'update', id, before, after);
  return c.json({ ok: true, item: after });
});

app.delete('/:id', async (c) => {
  const id = Number(c.req.param('id'));
  const before = await selectOne<ExpenseRow>(c.env.DB, `SELECT * FROM expenses WHERE id = ? AND archived_at IS NULL`, [id]);
  if (!before) return c.json({ error: 'not found' }, 404);
  await exec(c.env.DB, `UPDATE expenses SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  const after = await selectOne<ExpenseRow>(c.env.DB, `SELECT * FROM expenses WHERE id = ?`, [id]);
  await logUndo(c.env.DB, 'delete', id, before, after);
  return c.json({ ok: true });
});

app.post('/undo-latest', async (c) => {
  const latest = await selectOne<any>(
    c.env.DB,
    `SELECT * FROM undo_log WHERE table_name = 'expenses' ORDER BY id DESC LIMIT 1`
  );
  if (!latest) return c.json({ error: 'undo log is empty' }, 404);
  const before = latest.before_data ? JSON.parse(latest.before_data) : null;
  const after = latest.after_data ? JSON.parse(latest.after_data) : null;
  const id = Number(latest.record_id || after?.id || before?.id);
  if (latest.operation === 'create') {
    await exec(c.env.DB, `UPDATE expenses SET archived_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  } else if (latest.operation === 'update' && before) {
    await exec(
      c.env.DB,
      `UPDATE expenses SET date = ?, amount = ?, description = ?, payer = ?, paid_by = ?, burden_owner = ?, billing_month = ?, payment_due_date = ?, cycle_month = ?, card_id = ?, category = ?, note = ?, payment_method = ?, archived_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [before.date, before.amount, before.description, before.payer, before.paid_by, before.burden_owner, before.billing_month, before.payment_due_date, before.cycle_month, before.card_id, before.category, before.note, before.payment_method ?? null, before.archived_at ?? null, id]
    );
  } else if (latest.operation === 'delete' && before) {
    await exec(c.env.DB, `UPDATE expenses SET archived_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  }
  await exec(c.env.DB, `DELETE FROM undo_log WHERE id = ?`, [latest.id]);
  return c.json({ ok: true, undone: latest.operation, id });
});

export default app;
