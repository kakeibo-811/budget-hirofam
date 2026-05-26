import { el, clear, api } from '../utils';
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

function yen(value: number | null | undefined): string {
  const n = Math.round(Number(value || 0));
  return `¥${n.toLocaleString('ja-JP')}`;
}

function signedYen(value: number | null | undefined): string {
  const n = Math.round(Number(value || 0));
  return `${n >= 0 ? '+' : '-'}${yen(Math.abs(n))}`;
}

export function renderDashboard(root: HTMLElement) {
  clear(root);
  const picker = new MonthPicker();
  const content = el('div', { class: 'overview' });
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
  const wb = data.settlement.wife_transfer_breakdown || {
    wife_personal_paid_by_husband: 0,
    split_paid_by_husband: 0,
    fixed_or_scheduled_paid_by_husband: 0,
    credit_husband_paid_by_wife: 0,
  };

  root.appendChild(decisionCard(data));
  root.appendChild(quickBreakdown(wb, data.settlement.wife_due_to_husband));
  root.appendChild(sectionGrid([
    moneyPanel(L('家計', 'Household'), L('実績と予定を分けて確認', 'Actuals and plans'), [
      [L('家計合計', 'Household total'), data.household.total],
      [L('カード実績', 'Card actuals'), data.household.card_expense_total || 0],
      [L('カード以外の実績', 'Non-card actuals'), data.household.non_card_actual_expense_total || 0],
      [L('固定費予定', 'Fixed plans'), data.household.fixed_total || 0],
      [L('その他予定', 'Other plans'), data.household.scheduled_total || 0],
    ]),
    moneyPanel(L('夫の負担', 'Husband burden'), L('実支払ではなく最終負担', 'Final burden, not cash paid'), [
      [L('夫個人負担', 'Husband-only'), data.household.husband_only],
      [L('折半の夫負担', 'Husband split'), data.settlement.husband_split_share],
      [L('夫最終負担', 'Husband final'), data.settlement.husband_final_burden],
      [L('収入との差', 'Income minus burden'), data.settlement.husband_salary_balance],
    ]),
    moneyPanel(L('口座チェック', 'Cash check'), L('不足見込みを見る', 'Expected shortfall'), [
      [L('夫収入', 'Husband income'), data.income.toshi],
      [L('夫必要額', 'Husband required'), data.settlement.husband_final_burden],
      [L('妻収入', 'Wife income'), data.income.lisa],
      [L('妻振込予定', 'Wife transfer'), data.settlement.wife_due_to_husband],
    ]),
  ]));

  root.appendChild(compactDetails(L('振込の根拠明細', 'Transfer evidence'), transferRows(data.settlement.wife_transfer_lines || [])));
  root.appendChild(compactDetails(L('家計合計の根拠明細', 'Household evidence'), evidenceRows(data.evidence || [])));
  if (data.cashflow?.forecasts) root.appendChild(cashflowPanel(data));
}

function decisionCard(data: DashboardData): HTMLElement {
  return el('section', { class: 'overview-decision' }, [
    el('div', { class: 'overview-meta' }, [
      el('span', {}, [data.month]),
      el('span', {}, [`${data.period.start} - ${data.period.end}`]),
    ]),
    el('div', { class: 'overview-label' }, [L('妻から夫へ振込む額', 'Wife pays Husband')]),
    el('div', { class: 'overview-amount' }, [yen(data.settlement.wife_due_to_husband)]),
    el('div', { class: 'overview-sub' }, [
      data.settlement.wife_due_to_husband > 0
        ? L('まずこの金額だけ確認できればOKです。', 'This is the main amount to check.')
        : L('今月の妻→夫の振込は不要です。', 'No Wife to Husband transfer is needed.'),
    ]),
  ]);
}

function quickBreakdown(wb: NonNullable<DashboardData['settlement']['wife_transfer_breakdown']>, total: number): HTMLElement {
  return el('section', { class: 'overview-card overview-formula' }, [
    el('h3', {}, [L('振込額の作り方', 'How the transfer is calculated')]),
    overviewRow(L('妻個人分', 'Wife personal'), wb.wife_personal_paid_by_husband),
    overviewRow(L('折半分', 'Split share'), wb.split_paid_by_husband),
    overviewRow(L('固定費/予定支払い', 'Fixed/scheduled'), wb.fixed_or_scheduled_paid_by_husband),
    overviewRow(L('控除', 'Credit'), -wb.credit_husband_paid_by_wife),
    overviewRow(L('振込予定', 'Transfer due'), total, true),
  ]);
}

function sectionGrid(items: HTMLElement[]): HTMLElement {
  return el('div', { class: 'overview-grid' }, items);
}

function moneyPanel(title: string, subtitle: string, rows: MoneyRow[]): HTMLElement {
  return el('section', { class: 'overview-card' }, [
    el('div', { class: 'overview-card-head' }, [
      el('h3', {}, [title]),
      el('p', {}, [subtitle]),
    ]),
    ...rows.map(([label, amount, note], index) => overviewRow(label, amount, index === rows.length - 1, note)),
  ]);
}

function overviewRow(label: string, amount: number, strong = false, note?: string): HTMLElement {
  return el('div', { class: `overview-row ${strong ? 'overview-row-strong' : ''}` }, [
    el('span', {}, [label, note ? el('small', {}, [note]) : '']),
    el('b', {}, [amount < 0 ? `-${yen(Math.abs(amount))}` : yen(amount)]),
  ]);
}

function compactDetails(title: string, rows: HTMLElement[]): HTMLElement {
  const details = el('details', { class: 'overview-card overview-details' }, [
    el('summary', {}, [
      el('span', {}, [title]),
      el('b', {}, [String(rows.length)]),
    ]),
  ]);
  if (!rows.length) {
    details.appendChild(el('div', { class: 'muted' }, [L('対象明細はありません', 'No rows')]));
    return details;
  }
  details.appendChild(el('div', { class: 'overview-list' }, rows.slice(0, 80)));
  if (rows.length > 80) details.appendChild(el('div', { class: 'muted' }, [L('先頭80件を表示しています', 'Showing first 80 rows')]));
  return details;
}

function transferRows(lines: any[]): HTMLElement[] {
  return lines.map((x) => el('div', { class: 'overview-list-row' }, [
    el('span', {}, [x.description || x.source || '-']),
    el('b', {}, [yen(x.wife_due_amount || 0)]),
    el('small', {}, [x.date || reasonLabel(x.reason)]),
  ]));
}

function evidenceRows(rows: any[]): HTMLElement[] {
  return rows.map((x) => el('div', { class: 'overview-list-row' }, [
    el('span', {}, [x.description || x.category || '-']),
    el('b', {}, [yen(x.amount || 0)]),
    el('small', {}, [x.date || x.card_name || '']),
  ]));
}

function cashflowPanel(data: DashboardData): HTMLElement {
  const f = data.cashflow.forecasts || {};
  return el('section', { class: 'overview-card' }, [
    el('div', { class: 'overview-card-head' }, [
      el('h3', {}, [L('口座不足の見込み', 'Shortfall forecast')]),
      el('p', {}, [L('最低残高ベース', 'Based on minimum balance')]),
    ]),
    shortfallRow(L('夫口座', 'Husband accounts'), f.toshi),
    shortfallRow(L('妻口座', 'Wife accounts'), f.lisa),
    shortfallRow(L('共同口座', 'Shared accounts'), f.shared),
  ]);
}

function shortfallRow(label: string, forecast: any): HTMLElement {
  const shortfall = Number(forecast?.shortfall || 0);
  return overviewRow(
    label,
    shortfall,
    shortfall > 0,
    shortfall > 0 ? forecast?.lowest_date || '' : L('不足なし', 'No shortfall'),
  );
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    wife_personal_paid_by_husband: L('妻個人分', 'Wife personal'),
    split_paid_by_husband: L('折半分', 'Split'),
    fixed_or_scheduled_paid_by_husband: L('固定費/予定支払い', 'Fixed/scheduled'),
    credit_husband_paid_by_wife: L('控除', 'Credit'),
    husband_personal_paid_by_wife: L('夫分を妻が立替', 'Husband cost paid by Wife'),
    split_paid_by_wife: L('折半分を妻が立替', 'Split paid by Wife'),
  };
  return map[reason] || reason || '';
}
