import { el, clear, api, formatYen, thisMonth, shiftMonth } from '../utils';
import { getLocale, t } from '../i18n';
import { MonthPicker } from '../components/month-picker';

type Settings = Record<string, string>;
type ProjectionRow = {
  month: string;
  payment_date: string;
  repair_reserve_balance: number;
  repair_reserve_delta: number;
  repair_monthly_deposit: number;
  scheduled_repair_deductions?: number;
  scheduled_repair_deduction_labels?: string[];
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

type InvestmentHolding = { id: number; symbol: string; name?: string; owner: string; quantity: number; average_cost?: number; manual_price?: number; latest_price?: number; market_value?: number; unrealized_pl?: number; note?: string };

type AssetEvent = {
  id: number;
  event_date: string;
  target: string;
  event_type: string;
  amount: number;
  paid_by: string | null;
  burden_owner: string | null;
  note: string | null;
};

const ja = () => getLocale() !== 'en';
const L = (jp: string, en: string) => ja() ? jp : en;

function input(value = '', attrs: Record<string, any> = {}): HTMLInputElement {
  return el('input', { value, ...attrs }) as HTMLInputElement;
}

function select(options: [string, string][], value: string): HTMLSelectElement {
  const s = el('select') as HTMLSelectElement;
  for (const [v, label] of options) s.appendChild(el('option', { value: v, selected: v === value }, [label]));
  s.value = value;
  return s;
}

function btn(label: string, onClick: () => void | Promise<void>, secondary = true): HTMLButtonElement {
  return el('button', { class: `btn ${secondary ? 'btn-secondary' : ''}`, onClick }, [label]) as HTMLButtonElement;
}

function toNumber(v: string): number { return Math.round(Number(String(v || '0').replace(/,/g, '')) || 0); }

async function readFileText(file: File, encoding = 'utf-8'): Promise<string> {
  const buf = await file.arrayBuffer();
  return new TextDecoder(encoding).decode(buf);
}

function download(url: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function settingField(settings: Settings, key: string, label: string, type = 'number'): HTMLElement {
  return el('label', { class: 'field' }, [
    el('span', {}, [label]),
    input(settings[key] ?? '', { name: key, type, class: 'wide-input' }),
  ]);
}

function planDateForMonth(month: string, day = 25): string {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  const d = Math.min(Math.max(1, day), last);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function showApiError(e: any, fallback: string) {
  const msg = e?.detail || e?.message || e?.error || String(e || fallback);
  alert(`${fallback}\n${msg}`);
}

function renderSettings(settings: Settings, onSave: () => Promise<void>): HTMLElement {
  const card = el('details', { class: 'card', open: false }, [
    el('summary', {}, [L('前提設定を編集', 'Edit assumptions')]),
  ]);
  const grid = el('div', { class: 'form-grid asset-settings-grid' }, [
    settingField(settings, 'plan_start_date', L('開始日', 'Start date'), 'date'),
    settingField(settings, 'projection_end_month', L('表示終了月', 'Projection end'), 'month'),
    settingField(settings, 'repair_reserve_start_balance', L('修繕積立金 初期残高', 'Repair reserve initial')),
    settingField(settings, 'repair_reserve_monthly_deposit', L('毎月の修繕積立', 'Monthly repair saving')),
    settingField(settings, 'mortgage_start_balance', L('住宅ローン 初期残高', 'Mortgage initial')),
    settingField(settings, 'mortgage_monthly_payment', L('住宅ローン 毎月返済', 'Mortgage payment')),
    settingField(settings, 'mortgage_interest_rate', L('住宅ローン金利%', 'Mortgage rate %'), 'number'),
    settingField(settings, 'loan_toshi_start_balance', L('夫への貸付残高', 'Husband loan balance')),
    settingField(settings, 'loan_lisa_start_balance', L('妻への貸付残高', 'Wife loan balance')),
    settingField(settings, 'loan_toshi_monthly_repayment', L('夫 毎月返済', 'Husband monthly repayment')),
    settingField(settings, 'loan_lisa_monthly_repayment', L('妻 毎月返済', 'Wife monthly repayment')),
    settingField(settings, 'loan_repayment_day', L('返済日', 'Repayment day')),
  ]);
  const save = btn(L('設定を保存して月次計画へ反映', 'Save and refresh monthly plan'), async () => {
    const inputs = Array.from(grid.querySelectorAll('input')) as HTMLInputElement[];
    const items: Record<string, string> = {};
    for (const i of inputs) items[i.name] = i.value;
    try {
      const result = await api.put<any>('/api/assets/settings', { items });
      const applied = result?.applied || result?.items || {};
      const first = result?.projection_check?.[0];
      alert(L(
        `保存しました。月次計画へ反映します。\nDB上の毎月修繕積立: ${applied.repair_reserve_monthly_deposit ?? items.repair_reserve_monthly_deposit}円\n月次計画先頭: ${first ? `${first.month} / 毎月積立 ${first.repair_monthly_deposit}円 / 増減 ${first.repair_reserve_delta}円` : '未取得'}`,
        `Saved and refreshing the monthly plan.\nMonthly repair saving in DB: ${applied.repair_reserve_monthly_deposit ?? items.repair_reserve_monthly_deposit}\nFirst plan row: ${first ? `${first.month} / monthly ${first.repair_monthly_deposit} / delta ${first.repair_reserve_delta}` : 'not loaded'}`
      ));
      await onSave();
    } catch (e) {
      showApiError(e, L('前提設定を保存できませんでした', 'Could not save assumptions'));
    }
  }, false);
  card.appendChild(el('p', { class: 'muted' }, [L('保存するとDBへ保存し、キャッシュを使わずに月次計画を再取得します。修繕積立額を変更すると、下の「毎月積立」と「積立増減」に即時反映されます。', 'Saving writes to DB and reloads the monthly plan without cache. Changing monthly repair saving immediately updates Monthly saving and Reserve delta below.')]));
  card.appendChild(grid);
  card.appendChild(save);
  return card;
}

function renderSummary(rows: ProjectionRow[], month: string): HTMLElement {
  const r = rows.find((x) => x.month === month) || rows[0];
  const card = el('div', { class: 'card' }, [el('h3', {}, [L('資産・負債サマリー', 'Assets/Liabilities Summary')])]);
  const grid = el('div', { class: 'card-grid' });
  const items: [string, string, string][] = r ? [
    [L('修繕積立金', 'Repair reserve'), formatYen(r.repair_reserve_balance), L(`今月増減 ${formatYen(r.repair_reserve_delta)}`, `Delta ${formatYen(r.repair_reserve_delta)}`)],
    [L('夫への貸付残高', 'Husband loan'), formatYen(r.toshi_loan_balance), L(`今月返済 ${formatYen(r.toshi_loan_repayment)}`, `Repay ${formatYen(r.toshi_loan_repayment)}`)],
    [L('妻への貸付残高', 'Wife loan'), formatYen(r.lisa_loan_balance), L(`今月返済 ${formatYen(r.lisa_loan_repayment)}`, `Repay ${formatYen(r.lisa_loan_repayment)}`)],
    [L('住宅ローン残高', 'Mortgage balance'), formatYen(r.mortgage_ending_balance), L(`返済 ${formatYen(r.mortgage_payment)} / 元金 ${formatYen(r.mortgage_principal)}`, `Payment ${formatYen(r.mortgage_payment)}`)],
  ] : [];
  for (const [label, value, sub] of items) grid.appendChild(el('div', { class: 'metric' }, [
    el('div', { class: 'metric-label' }, [label]),
    el('div', { class: 'metric-value' }, [value]),
    el('div', { class: 'muted' }, [sub]),
  ]));
  card.appendChild(el('p', { class: 'muted' }, [L('保存後すぐ月次計画を再読込します。修繕積立額を変更すると、下の「毎月の修繕積立」と「積立増減」に反映されます。', 'After saving, the monthly plan reloads. Changing monthly repair saving updates the Monthly repair saving and reserve delta columns below.')]));
  card.appendChild(grid);
  card.appendChild(el('p', { class: 'muted' }, [L('150,263円は住宅ローン返済、130,000円は修繕積立金として扱い、夫/妻の貸付金返済は修繕積立金へ戻る計算です。', 'Mortgage payment, repair saving, and Husband/Wife loan repayments are separated and linked.')])) ;
  return card;
}

function renderProjectionTable(rows: ProjectionRow[], month: string, onSaved: () => Promise<void>): HTMLElement {
  const wrap = el('div', { class: 'table-wrap asset-table-wrap' });
  const table = el('table', { class: 'data compact-table asset-ledger-table' });
  table.innerHTML = `<thead><tr>
    <th>${L('月', 'Month')}</th><th>${L('返済日', 'Pay date')}</th>
    <th class="num">${L('修繕積立残高', 'Repair reserve')}</th><th class="num">${L('積立増減', 'Reserve delta')}</th><th class="num">${L('毎月積立', 'Monthly saving')}</th><th class="num">${L('保険/税金支払', 'Insurance/tax payment')}</th><th>${L('支払内容', 'Payment items')}</th>
    <th class="num">${L('夫貸付残', 'H loan')}</th><th class="num">${L('夫返済', 'H repay')}</th>
    <th class="num">${L('妻貸付残', 'W loan')}</th><th class="num">${L('妻返済', 'W repay')}</th>
    <th class="num">${L('住宅ローン残高', 'Mortgage')}</th><th class="num">${L('返済額', 'Payment')}</th><th>${L('種別', 'Type')}</th><th>${L('月次調整', 'Adjust')}</th>
  </tr></thead>`;
  const tbody = el('tbody');
  for (const r of rows) tbody.appendChild(el('tr', { class: r.month === month ? 'current-row' : '' }, [
    el('td', { class: 'mono' }, [r.month]),
    el('td', { class: 'mono' }, [r.payment_date]),
    el('td', { class: 'num' }, [formatYen(r.repair_reserve_balance)]),
    el('td', { class: 'num' }, [formatYen(r.repair_reserve_delta)]),
    el('td', { class: 'num' }, [formatYen(r.repair_monthly_deposit)]),
    el('td', { class: 'num' }, [Number(r.scheduled_repair_deductions || 0) ? formatYen(r.scheduled_repair_deductions || 0) : '—']),
    el('td', {}, [(r.scheduled_repair_deduction_labels || []).length ? (r.scheduled_repair_deduction_labels || []).join(' / ') : '—']),
    el('td', { class: 'num' }, [formatYen(r.toshi_loan_balance)]),
    el('td', { class: 'num' }, [formatYen(r.toshi_loan_repayment)]),
    el('td', { class: 'num' }, [formatYen(r.lisa_loan_balance)]),
    el('td', { class: 'num' }, [formatYen(r.lisa_loan_repayment)]),
    el('td', { class: 'num' }, [formatYen(r.mortgage_ending_balance)]),
    el('td', { class: 'num' }, [formatYen(r.mortgage_payment)]),
    el('td', {}, [r.is_mortgage_imported ? L('取込済', 'Imported') : L('自動試算', 'Computed')]),
    el('td', { class: 'row-actions' }, [
      btn(L('修繕入金', 'Reserve +'), async () => {
        const amount = prompt(L(`${r.month} に追加で修繕積立へ入金する金額を入力`, `Additional repair-reserve deposit for ${r.month}`), '0');
        if (amount === null) return;
        await api.post('/api/assets/events', { target: 'repair_reserve', event_type: 'repair_deposit', event_date: planDateForMonth(r.month), amount, paid_by: 'shared', burden_owner: 'shared', note: L('月次計画から手動追加', 'Manual monthly plan deposit') });
        await onSaved();
      }),
      btn(L('修繕支出', 'Reserve -'), async () => {
        const amount = prompt(L(`${r.month} に修繕積立金から支払う金額を入力`, `Repair-reserve spending for ${r.month}`), '0');
        if (amount === null) return;
        const note = prompt(L('支払内容メモ', 'Payment note'), L('月次計画から手動支出', 'Manual monthly plan spending')) || '';
        await api.post('/api/assets/events', { target: 'repair_reserve', event_type: 'repair_spend', event_date: planDateForMonth(r.month), amount, paid_by: 'shared', burden_owner: 'shared', note });
        await onSaved();
      }),
    ]),
  ]));
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}

function renderManualMonthlyPlanEditor(defaultMonth: string, onSaved: () => Promise<void>): HTMLElement {
  const card = el('details', { class: 'card' }, [el('summary', {}, [L('月次計画を手動調整', 'Manually adjust monthly plan')])]);
  const m = input(defaultMonth, { type: 'month' });
  const target = select([
    ['repair_reserve', L('修繕積立金', 'Repair reserve')],
    ['loan_toshi', L('夫への貸付', 'Husband loan')],
    ['loan_lisa', L('妻への貸付', 'Wife loan')],
    ['home_loan', L('住宅ローン', 'Mortgage')],
  ], 'repair_reserve');
  const type = select([
    ['repair_deposit', L('修繕積立入金', 'Repair deposit')],
    ['repair_spend', L('修繕積立から支払', 'Repair spending')],
    ['loan_extra_repayment', L('貸付金一括返済', 'Loan extra repayment')],
    ['loan_drawdown', L('貸付増加', 'Loan drawdown')],
    ['balance_adjustment', L('残高調整', 'Balance adjustment')],
    ['mortgage_balance_update', L('住宅ローン残高更新', 'Mortgage balance update')],
  ], 'repair_spend');
  const amount = input('', { type: 'number', placeholder: '100000' });
  const note = input('', { placeholder: L('例: 火災保険支払 / 一括返済', 'e.g. fire insurance / extra repayment') });
  const save = btn(L('月次計画へ反映', 'Apply to monthly plan'), async () => {
    if (!m.value || !amount.value) { alert(L('月と金額を入力してください', 'Enter month and amount')); return; }
    if (!confirm(L(`${m.value} の月次計画に ${amount.value}円 を反映します。`, `Apply ${amount.value} to the ${m.value} monthly plan?`))) return;
    try {
      await api.post('/api/assets/events', {
        target: target.value,
        event_type: type.value,
        event_date: planDateForMonth(m.value),
        amount: amount.value,
        paid_by: 'shared',
        burden_owner: 'shared',
        note: note.value || L('月次計画から手動調整', 'Manual monthly plan adjustment'),
      });
      amount.value = '';
      note.value = '';
      await onSaved();
    } catch (e) {
      showApiError(e, L('月次計画へ反映できませんでした', 'Could not apply monthly adjustment'));
    }
  }, false);
  card.appendChild(el('p', { class: 'muted' }, [L('月次計画の行を直接書き換える代わりに、監査できる調整イベントを作成します。保存後すぐ再計算されます。', 'Creates an auditable adjustment event instead of overwriting the row directly. The plan recalculates immediately.')])) ;
  card.appendChild(el('div', { class: 'form-grid' }, [
    el('label', {}, [L('対象月', 'Month'), m]),
    el('label', {}, [L('対象', 'Target'), target]),
    el('label', {}, [L('種別', 'Type'), type]),
    el('label', {}, [L('金額', 'Amount'), amount]),
    el('label', {}, [L('メモ', 'Note'), note]),
    save,
  ]));
  return card;
}

function renderEventForm(onSaved: () => Promise<void>): HTMLElement {
  const card = el('details', { class: 'card' }, [el('summary', {}, [L('一括返済・貸付増加・修繕支出を追加', 'Add repayment/drawdown/repair event')])]);
  const target = select([
    ['loan_toshi', L('夫への貸付', 'Husband loan')], ['loan_lisa', L('妻への貸付', 'Wife loan')], ['repair_reserve', L('修繕積立金', 'Repair reserve')], ['home_loan', L('住宅ローン', 'Mortgage')]
  ], 'loan_lisa');
  const eventType = select([
    ['loan_extra_repayment', L('一括返済', 'Extra repayment')], ['loan_drawdown', L('貸付増加', 'Loan drawdown')], ['repair_deposit', L('修繕積立入金', 'Repair deposit')], ['repair_spend', L('修繕支出', 'Repair spend')], ['balance_adjustment', L('残高調整', 'Balance adjustment')]
  ], 'loan_extra_repayment');
  const date = input(`${thisMonth()}-25`, { type: 'date' });
  const amount = input('', { type: 'number', placeholder: '100000' });
  const paidBy = select([['toshi', L('夫', 'Husband')], ['lisa', L('妻', 'Wife')], ['shared', L('共同', 'Shared')], ['other', L('その他', 'Other')]], 'lisa');
  const note = input('', { placeholder: L('メモ', 'Note'), class: 'wide-input' });
  const save = btn(L('追加', 'Add'), async () => {
    await api.post('/api/assets/events', { target: target.value, event_type: eventType.value, event_date: date.value, amount: toNumber(amount.value), paid_by: paidBy.value, burden_owner: paidBy.value, note: note.value });
    alert(L('追加しました', 'Added'));
    await onSaved();
  }, false);
  card.appendChild(el('div', { class: 'form-grid' }, [
    el('label', {}, [L('対象', 'Target'), target]), el('label', {}, [L('種別', 'Type'), eventType]), el('label', {}, [L('日付', 'Date'), date]), el('label', {}, [L('金額', 'Amount'), amount]), el('label', {}, [L('支払元', 'Paid by'), paidBy]), el('label', {}, [L('メモ', 'Note'), note]), save,
  ]));
  return card;
}

function renderMortgageImport(onDone: () => Promise<void>): HTMLElement {
  const card = el('details', { class: 'card' }, [el('summary', {}, [L('住宅ローン返済計画CSVを取り込む', 'Import full mortgage schedule CSV')])]);
  const file = el('input', { type: 'file', accept: '.csv,text/csv' }) as HTMLInputElement;
  const encoding = select([['utf-8', 'UTF-8'], ['shift-jis', 'Shift-JIS'] ], 'utf-8');
  const textarea = el('textarea', { rows: 6, placeholder: 'Date,Starting Balance,Interest,Payment,Principal,Ending Balance,Final Payment' }) as HTMLTextAreaElement;
  const preview = el('div');
  file.addEventListener('change', async () => {
    if (file.files?.[0]) textarea.value = await readFileText(file.files[0], encoding.value);
  });
  const previewBtn = btn(L('プレビュー', 'Preview'), async () => {
    const r = await api.post('/api/assets/mortgage/import/preview', { csv: textarea.value, source: 'mortgage_schedule_1_19' });
    clear(preview);
    preview.appendChild(el('div', { class: 'banner' }, [L(`読込候補 ${r.count}件 / 警告 ${r.warnings.length}件`, `Rows ${r.count} / warnings ${r.warnings.length}`)]));
    const wrap = el('div', { class: 'table-wrap' });
    const table = el('table', { class: 'data compact-table' });
    table.innerHTML = `<thead><tr><th>Date</th><th class="num">Start</th><th class="num">Interest</th><th class="num">Payment</th><th class="num">Principal</th><th class="num">End</th></tr></thead>`;
    const tbody = el('tbody');
    for (const x of r.rows || []) tbody.appendChild(el('tr', {}, [el('td', {}, [x.payment_date]), el('td', { class: 'num' }, [formatYen(x.starting_balance)]), el('td', { class: 'num' }, [formatYen(x.interest)]), el('td', { class: 'num' }, [formatYen(x.payment)]), el('td', { class: 'num' }, [formatYen(x.principal)]), el('td', { class: 'num' }, [formatYen(x.ending_balance)])]));
    table.appendChild(tbody); wrap.appendChild(table); preview.appendChild(wrap);
  });
  const commitBtn = btn(L('確定取り込み', 'Commit import'), async () => {
    if (!confirm(L('既存の mortgage_schedule_1_19 を置き換えて取り込みます。よろしいですか？', 'Replace existing mortgage schedule?'))) return;
    const r = await api.post('/api/assets/mortgage/import/commit', { csv: textarea.value, source: 'mortgage_schedule_1_19', replace: true, confirm: true });
    alert(L(`取り込み完了: ${r.inserted}件 / 最終 ${r.last}`, `Imported ${r.inserted} rows / last ${r.last}`));
    await onDone();
  }, false);
  card.appendChild(el('div', { class: 'form-grid' }, [el('label', {}, [L('文字コード', 'Encoding'), encoding]), el('label', {}, [L('ファイル', 'File'), file])]));
  card.appendChild(textarea);
  card.appendChild(el('div', { class: 'row-flex' }, [previewBtn, commitBtn]));
  card.appendChild(preview);
  return card;
}

function renderScheduledDeductions(rows: any[]): HTMLElement {
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${L('月','Month')}</th><th class="num">${L('支払額','Amount')}</th><th>${L('内容','Items')}</th></tr></thead>`;
  const tb = el('tbody');
  for (const r of rows) tb.appendChild(el('tr', {}, [el('td', {}, [r.month]), el('td', { class: 'num' }, [formatYen(r.amount)]), el('td', {}, [(r.labels || []).join(' / ')])]));
  table.appendChild(tb); wrap.appendChild(table); return wrap;
}

function renderInvestments(onDone: () => Promise<void>): HTMLElement {
  const card = el('details', { class: 'card', open: false }, [el('summary', {}, [L('株・投資残高', 'Stocks / Investment holdings')])]);
  const list = el('div', { class: 'table-wrap' }, [el('div', { class: 'muted' }, [L('読み込み中...', 'Loading...')])]);
  const symbol = input('', { placeholder: L('銘柄コード 例: 7203', 'Symbol e.g. 7203') });
  const name = input('', { placeholder: L('名称', 'Name') });
  const ownerSel = select([['shared', L('共同', 'Shared')], ['toshi', L('夫', 'Husband')], ['lisa', L('妻', 'Wife')], ['other', L('その他', 'Other')]], 'shared');
  const qty = input('', { type: 'number', step: '0.0001', placeholder: L('数量', 'Quantity') });
  const cost = input('', { type: 'number', placeholder: L('取得単価', 'Average cost') });
  const price = input('', { type: 'number', placeholder: L('現在価格/手入力', 'Current price / manual') });
  async function refresh() {
    const data = await api.get<{ items: InvestmentHolding[] }>('/api/investments');
    clear(list);
    const table = el('table', { class: 'data compact-table' });
    table.innerHTML = `<thead><tr><th>${L('銘柄','Symbol')}</th><th>${L('所有','Owner')}</th><th class="num">${L('数量','Qty')}</th><th class="num">${L('価格','Price')}</th><th class="num">${L('評価額','Value')}</th><th class="num">${L('損益','P/L')}</th><th>${L('操作','Actions')}</th></tr></thead>`;
    const tb = el('tbody');
    for (const h of data.items || []) tb.appendChild(el('tr', {}, [
      el('td', {}, [`${h.symbol}${h.name ? ` / ${h.name}` : ''}`]),
      el('td', {}, [h.owner]),
      el('td', { class: 'num' }, [String(h.quantity || 0)]),
      el('td', { class: 'num' }, [formatYen(Number(h.latest_price || h.manual_price || 0))]),
      el('td', { class: 'num' }, [formatYen(Number(h.market_value || 0))]),
      el('td', { class: 'num' }, [formatYen(Number(h.unrealized_pl || 0))]),
      el('td', {}, [
        btn(L('価格取得', 'Refresh'), async () => { const r = await api.post<any>(`/api/investments/${h.id}/refresh`, {}); alert(r.ok ? L('価格を更新しました', 'Quote refreshed') : `${L('取得できませんでした', 'Could not refresh')}: ${r.error}`); await refresh(); await onDone(); }),
        btn(L('削除', 'Delete'), async () => { if (!confirm(L('削除しますか？', 'Delete this holding?'))) return; await api.delete(`/api/investments/${h.id}`); await refresh(); await onDone(); }),
      ]),
    ]));
    if (!(data.items || []).length) tb.appendChild(el('tr', {}, [el('td', { colspan: '7', class: 'muted' }, [t('common.no_data')]) as any]));
    table.appendChild(tb); list.appendChild(table);
  }
  const add = btn(L('銘柄を追加', 'Add holding'), async () => {
    await api.post('/api/investments', { symbol: symbol.value, name: name.value, owner: ownerSel.value, quantity: Number(qty.value || 0), average_cost: Number(cost.value || 0), manual_price: Number(price.value || 0), currency: 'JPY' });
    symbol.value = name.value = qty.value = cost.value = price.value = '';
    await refresh(); await onDone();
  }, false);
  card.appendChild(el('div', { class: 'form-grid' }, [
    el('label', {}, [L('銘柄', 'Symbol'), symbol]), el('label', {}, [L('名称', 'Name'), name]), el('label', {}, [L('所有', 'Owner'), ownerSel]), el('label', {}, [L('数量', 'Quantity'), qty]), el('label', {}, [L('取得単価', 'Average cost'), cost]), el('label', {}, [L('現在価格', 'Current price'), price]), add,
  ]));
  card.appendChild(el('p', { class: 'muted' }, [L('Yahoo等の外部価格取得はベストエフォートです。取得できない場合は現在価格を手入力してください。', 'External quote lookup is best-effort. Enter manual price if unavailable.')])) ;
  card.appendChild(list);
  refresh().catch(() => { clear(list); list.appendChild(el('div', { class: 'banner banner-warn' }, [L('投資残高を読み込めませんでした', 'Could not load investments')])); });
  return card;
}

export async function renderAssets(root: HTMLElement, month = thisMonth()) {
  clear(root);
  const endDefault = '2051-05';
  let fromMonth = month;
  let toMonth = shiftMonth(month, 11);
  const header = el('div', { class: 'tab-head' }, [
    el('div', {}, [el('h2', {}, [L('資産・負債', 'Assets & Liabilities')]), el('p', { class: 'muted' }, [L('このタブはPhase11でゼロから再設計されています。住宅ローン、修繕積立金、夫/妻への貸付金を分け、返済を他タブへ連動します。', 'Rebuilt model for mortgage, repair reserve, and Husband/Wife loans.')])]),
  ]);
  const picker = new MonthPicker(month);
  picker.onChange(async (m) => { await renderAssets(root, m); });
  root.appendChild(header);
  root.appendChild(picker.element());

  const status = el('div', { class: 'muted' }, [L('読み込み中...', 'Loading...')]);
  root.appendChild(status);

  async function load() {
    const res = await api.get(`/api/assets/projection?from=${fromMonth}&to=${toMonth}&_ts=${Date.now()}`) as { settings: Settings; rows: ProjectionRow[]; events: AssetEvent[]; mortgage_count: number };
    clear(root);
    root.appendChild(header);
    root.appendChild(picker.element());
    const toolbar = el('div', { class: 'card row-flex' }, [
      el('label', {}, [L('表示開始', 'From'), input(fromMonth, { type: 'month', onChange: async (e: Event) => { fromMonth = (e.target as HTMLInputElement).value; await load(); } })]),
      el('label', {}, [L('表示終了', 'To'), input(toMonth, { type: 'month', onChange: async (e: Event) => { toMonth = (e.target as HTMLInputElement).value; await load(); } })]),
      btn(L('2051年完済まで表示', 'Show through payoff 2051'), async () => { fromMonth = res.settings.plan_start_date.slice(0,7); toMonth = res.settings.projection_end_month || endDefault; await load(); }),
      btn(L('CSV出力', 'Export CSV'), () => download(`/api/assets/export.csv?from=${fromMonth}&to=${toMonth}`)),
      btn(L('前提反映を確認', 'Check assumptions'), async () => {
        const d = await api.get<any>(`/api/assets/settings/debug?_ts=${Date.now()}`);
        alert(L(
          `DB上の毎月修繕積立: ${d.settings?.repair_reserve_monthly_deposit}円\n月次計画先頭: ${d.projection_check?.[0]?.month} / 毎月積立 ${d.projection_check?.[0]?.repair_monthly_deposit}円 / 増減 ${d.projection_check?.[0]?.repair_reserve_delta}円`,
          `Monthly repair saving in DB: ${d.settings?.repair_reserve_monthly_deposit}\nFirst plan row: ${d.projection_check?.[0]?.month} / monthly saving ${d.projection_check?.[0]?.repair_monthly_deposit} / delta ${d.projection_check?.[0]?.repair_reserve_delta}`
        ));
      }),
    ]);
    root.appendChild(toolbar);
    root.appendChild(renderSummary(res.rows, month));
    root.appendChild(renderSettings(res.settings, load));
    root.appendChild(renderMortgageImport(load));
    root.appendChild(renderInvestments(load));
    if ((res as any).scheduled_deductions?.length) root.appendChild(el('div', { class: 'card' }, [el('h3', {}, [L('修繕積立金から支払う定期支出', 'Scheduled deductions from repair reserve')]), renderScheduledDeductions((res as any).scheduled_deductions)]));
    root.appendChild(renderEventForm(load));
    root.appendChild(el('div', { class: 'card' }, [
      el('h3', {}, [L('他タブ連動', 'Tab linkage')]),
      el('p', { class: 'muted' }, [L('夫/妻の毎月1万円返済を明細タブに支出として作成します。同じ月・同じ所有者は二重作成しません。', 'Sync monthly loan repayments to expenses idempotently.')]),
      btn(L('貸付金返済を明細へ連動', 'Sync loan repayments to expenses'), async () => {
        if (!confirm(L(`${fromMonth}〜${toMonth}の貸付金返済を明細へ連動します。よろしいですか？`, `Sync loan repayments from ${fromMonth} to ${toMonth}?`))) return;
        const r = await api.post('/api/assets/sync-loan-repayments', { from: fromMonth, to: toMonth, confirm: true });
        alert(L(`作成 ${r.inserted}件 / 重複スキップ ${r.skipped}件`, `Inserted ${r.inserted} / skipped ${r.skipped}`));
      }, false),
    ]));
    root.appendChild(el('div', { class: 'card' }, [
      el('h3', {}, [L('2051年までの月次計画', 'Monthly plan through 2051')]),
      el('p', { class: 'muted' }, [L(`住宅ローンCSV行数: ${res.mortgage_count}件。0件の場合は1.19%/150,263円の自動試算を表示します。火災保険・地震保険・固定資産税を払う月は表の「保険/税金支払」「支払内容」に明記します。`, `Mortgage imported rows: ${res.mortgage_count}. If zero, computed fallback is shown. Insurance/tax payment months are shown in the payment columns.`)]),
      renderManualMonthlyPlanEditor(month, load),
      renderProjectionTable(res.rows, month, load),
    ]));
  }
  await load();
}

