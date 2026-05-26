import { el, clear, api, formatYen } from '../utils';
import { t, getLocale } from '../i18n';
import { MonthPicker } from '../components/month-picker';

type DashboardData = {
  month: string;
  period: { start: string; end: string };
  income: { total: number; toshi: number; lisa: number };
  household: {
    total: number;
    husband_only: number;
    split_total: number;
    fixed_total: number;
    scheduled_total?: number;
    card_expense_total?: number;
    non_card_actual_expense_total?: number;
  };
  settlement: {
    wife_due_to_husband: number;
    husband_final_burden: number;
    husband_split_share: number;
    husband_salary_balance: number;
    wife_salary_balance: number;
    wife_transfer_lines?: any[];
    wife_transfer_breakdown?: {
      wife_personal_paid_by_husband: number;
      split_paid_by_husband: number;
      fixed_or_scheduled_paid_by_husband: number;
      credit_husband_paid_by_wife: number;
    };
  };
  cashflow?: any;
  evidence: any[];
};

type MoneyRow = [string, number, string?];

function L(ja: string, en: string): string {
  return getLocale() === 'en' ? en : ja;
}

function signedYen(value: number | null | undefined): string {
  const n = Math.round(Number(value || 0));
  return `${n >= 0 ? '+' : ''}${formatYen(n)}`;
}

function pct(part: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((part / total) * 100)}%`;
}

export function renderDashboard(root: HTMLElement) {
  clear(root);
  const picker = new MonthPicker();
  const content = el('div', { class: 'overview overview-ledger' });
  root.appendChild(picker.element());
  root.appendChild(content);

  async function load(month: string) {
    clear(content);
    content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
    try {
      const data = await api.get<DashboardData>(`/api/analytics/dashboard/${month}`);
      clear(content);
      renderOverview(content, data);
    } catch (e: any) {
      clear(content);
      content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー', 'Error')}: ${e.message}`]));
    }
  }

  picker.onChange(load);
  load(picker.get());
}

function renderOverview(root: HTMLElement, data: DashboardData) {
  const householdBalance = Number(data.income.total || 0) - Number(data.household.total || 0);
  const wifeOutgo = Math.max(0, Number(data.income.lisa || 0) - Number(data.settlement.wife_salary_balance || 0));

  root.appendChild(monthSummary(data, householdBalance));
  root.appendChild(el('div', { class: 'overview-kpi-grid' }, [
    kpiCard(L('収入合計', 'Total income'), data.income.total, L('夫婦の登録収入', 'Registered household income')),
    kpiCard(L('家計支出', 'Household spending'), data.household.total, L('実績と予定を含む', 'Actuals and planned costs')),
    kpiCard(L('差引', 'Balance'), householdBalance, L('収入 - 家計支出', 'Income minus spending'), true),
    kpiCard(L('妻→夫 精算', 'Wife to Husband'), data.settlement.wife_due_to_husband, L('振込予定額', 'Transfer due')),
  ]));

  root.appendChild(el('div', { class: 'overview-main-grid' }, [
    spendingCard(data),
    settlementCard(data),
  ]));

  root.appendChild(el('div', { class: 'overview-main-grid' }, [
    personCard(
      L('夫の状況', 'Husband'),
      data.income.toshi,
      data.settlement.husband_final_burden,
      data.settlement.husband_salary_balance,
      [
        [L('個人負担', 'Personal burden'), data.household.husband_only],
        [L('折半負担', 'Split share'), data.settlement.husband_split_share],
      ],
    ),
    personCard(
      L('妻の状況', 'Wife'),
      data.income.lisa,
      wifeOutgo,
      data.settlement.wife_salary_balance,
      [
        [L('夫へ振込', 'Transfer to husband'), data.settlement.wife_due_to_husband],
        [L('振込後の残り', 'After transfer'), data.settlement.wife_salary_balance],
      ],
    ),
  ]));

  root.appendChild(detailCard(L('精算の根拠', 'Settlement evidence'), transferRows(data.settlement.wife_transfer_lines || []), data.settlement.wife_due_to_husband));
  root.appendChild(detailCard(L('家計支出の明細', 'Household spending details'), evidenceRows(data.evidence || []), data.household.total));
  if (data.cashflow?.forecasts) root.appendChild(cashflowCard(data));
}

function monthSummary(data: DashboardData, balance: number): HTMLElement {
  return el('section', { class: 'overview-month-summary' }, [
    el('div', { class: 'overview-title-block' }, [
      el('div', { class: 'eyebrow' }, [L('概要', 'Overview')]),
      el('h2', {}, [L('今月の家計サマリー', 'Monthly household summary')]),
      el('p', { class: 'muted' }, [`${data.period.start} - ${data.period.end}`]),
    ]),
    el('div', { class: `overview-balance ${balance < 0 ? 'is-negative' : ''}` }, [
      el('span', {}, [L('差引', 'Balance')]),
      el('strong', {}, [signedYen(balance)]),
      el('small', {}, [L('収入合計から家計支出を引いた目安', 'Income minus household spending')]),
    ]),
  ]);
}

function kpiCard(label: string, amount: number, note: string, signed = false): HTMLElement {
  return el('section', { class: 'overview-kpi' }, [
    el('span', {}, [label]),
    el('strong', {}, [signed ? signedYen(amount) : formatYen(amount)]),
    el('small', {}, [note]),
  ]);
}

function spendingCard(data: DashboardData): HTMLElement {
  const fixedPlanned = Number(data.household.fixed_total || 0) + Number(data.household.scheduled_total || 0);
  const rows: MoneyRow[] = [
    [L('カード実績', 'Card actuals'), data.household.card_expense_total || 0, pct(data.household.card_expense_total || 0, data.household.total)],
    [L('カード以外の実績', 'Non-card actuals'), data.household.non_card_actual_expense_total || 0, pct(data.household.non_card_actual_expense_total || 0, data.household.total)],
    [L('固定費・予定支払い', 'Fixed and scheduled'), fixedPlanned, pct(fixedPlanned, data.household.total)],
  ];
  return panel(L('支出内訳', 'Spending breakdown'), L('家計支出に何が入っているか', 'What makes up household spending'), rows, data.household.total);
}

function settlementCard(data: DashboardData): HTMLElement {
  const wb = data.settlement.wife_transfer_breakdown || {
    wife_personal_paid_by_husband: 0,
    split_paid_by_husband: 0,
    fixed_or_scheduled_paid_by_husband: 0,
    credit_husband_paid_by_wife: 0,
  };
  return el('section', { class: 'overview-panel overview-settlement' }, [
    el('div', { class: 'overview-card-head' }, [
      el('h3', {}, [L('夫婦間の精算', 'Settlement')]),
      el('p', {}, [L('妻から夫へ振り込む額と計算根拠', 'Transfer amount and formula')]),
    ]),
    el('div', { class: 'settlement-total-block' }, [
      el('span', {}, [L('妻→夫', 'Wife to Husband')]),
      el('strong', {}, [formatYen(data.settlement.wife_due_to_husband)]),
    ]),
    amountRow(L('妻個人分を夫が立替', 'Wife personal paid by husband'), wb.wife_personal_paid_by_husband),
    amountRow(L('折半分を夫が立替', 'Split share paid by husband'), wb.split_paid_by_husband),
    amountRow(L('固定費・予定支払いを夫が立替', 'Fixed/scheduled paid by husband'), wb.fixed_or_scheduled_paid_by_husband),
    amountRow(L('控除: 夫のカード分を妻が支払済み', 'Deduct: husband credit paid by wife'), -wb.credit_husband_paid_by_wife),
  ]);
}

function personCard(title: string, income: number, outgo: number, balance: number, rows: MoneyRow[]): HTMLElement {
  return el('section', { class: 'overview-panel' }, [
    el('div', { class: 'overview-card-head' }, [
      el('h3', {}, [title]),
      el('p', {}, [L('収入・負担・残りの確認', 'Income, burden, and remaining balance')]),
    ]),
    amountRow(L('収入', 'Income'), income),
    amountRow(L('負担見込み', 'Expected burden'), outgo),
    amountRow(L('残り', 'Remaining'), balance, true),
    ...rows.map(([label, amount, note]) => amountRow(label, amount, false, note)),
  ]);
}

function panel(title: string, subtitle: string, rows: MoneyRow[], total: number): HTMLElement {
  return el('section', { class: 'overview-panel' }, [
    el('div', { class: 'overview-card-head' }, [
      el('h3', {}, [title]),
      el('p', {}, [subtitle]),
    ]),
    ...rows.map(([label, amount, note]) => amountRow(label, amount, false, note)),
    amountRow(L('合計', 'Total'), total, true),
  ]);
}

function amountRow(label: string, amount: number, strong = false, note?: string): HTMLElement {
  return el('div', { class: `overview-amount-row ${strong ? 'is-strong' : ''}` }, [
    el('span', {}, [label, note ? el('small', {}, [note]) : '']),
    el('b', {}, [amount < 0 ? `-${formatYen(Math.abs(amount))}` : formatYen(amount)]),
  ]);
}

function detailCard(title: string, rows: HTMLElement[], total: number): HTMLElement {
  const details = el('details', { class: 'overview-panel overview-details' }, [
    el('summary', {}, [
      el('span', {}, [title]),
      el('b', {}, [formatYen(total)]),
    ]),
  ]);
  if (!rows.length) {
    details.appendChild(el('div', { class: 'muted overview-empty' }, [L('対象明細はありません', 'No rows')]));
    return details;
  }
  details.appendChild(el('div', { class: 'overview-list' }, rows.slice(0, 80)));
  if (rows.length > 80) details.appendChild(el('div', { class: 'muted overview-empty' }, [L('先頭80件を表示しています', 'Showing first 80 rows')]));
  return details;
}

function transferRows(lines: any[]): HTMLElement[] {
  return lines.map((x) => el('div', { class: 'overview-list-row' }, [
    el('span', {}, [x.description || x.source || reasonLabel(x.reason) || '-']),
    el('b', {}, [formatYen(x.wife_due_amount || 0)]),
    el('small', {}, [x.date || reasonLabel(x.reason)]),
  ]));
}

function evidenceRows(rows: any[]): HTMLElement[] {
  return rows.map((x) => el('div', { class: 'overview-list-row' }, [
    el('span', {}, [x.description || x.category || '-']),
    el('b', {}, [formatYen(x.amount || 0)]),
    el('small', {}, [x.date || x.card_name || x.source || '']),
  ]));
}

function cashflowCard(data: DashboardData): HTMLElement {
  const f = data.cashflow.forecasts || {};
  return el('section', { class: 'overview-panel' }, [
    el('div', { class: 'overview-card-head' }, [
      el('h3', {}, [L('口座不足の見込み', 'Shortfall forecast')]),
      el('p', {}, [L('最低残高ベースの確認', 'Based on minimum balance')]),
    ]),
    shortfallRow(L('夫口座', 'Husband accounts'), f.toshi),
    shortfallRow(L('妻口座', 'Wife accounts'), f.lisa),
    shortfallRow(L('共有口座', 'Shared accounts'), f.shared),
  ]);
}

function shortfallRow(label: string, forecast: any): HTMLElement {
  const shortfall = Number(forecast?.shortfall || 0);
  return amountRow(
    label,
    shortfall,
    shortfall > 0,
    shortfall > 0 ? forecast?.lowest_date || '' : L('不足なし', 'No shortfall'),
  );
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    wife_personal_paid_by_husband: L('妻個人分', 'Wife personal'),
    split_paid_by_husband: L('折半分', 'Split share'),
    fixed_or_scheduled_paid_by_husband: L('固定費・予定支払い', 'Fixed/scheduled'),
    credit_husband_paid_by_wife: L('控除', 'Credit'),
    husband_personal_paid_by_wife: L('夫個人分を妻が立替', 'Husband cost paid by wife'),
    split_paid_by_wife: L('折半分を妻が立替', 'Split paid by wife'),
  };
  return map[reason] || reason || '';
}
