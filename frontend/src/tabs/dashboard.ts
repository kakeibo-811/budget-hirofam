import { el, clear, api, formatYen } from '../utils';
import { t, getLocale } from '../i18n';
import { MonthPicker } from '../components/month-picker';

type DashboardData = {
  month: string;
  period: { start: string; end: string; cycle_start_day: number; basis: string };
  income: { total: number; toshi: number; lisa: number };
  household: {
    total: number;
    husband_only: number;
    wife_personal_advanced: number;
    split_total: number;
    split_each: number;
    fixed_total: number;
    scheduled_total?: number;
    actual_expense_total?: number;
    card_expense_total?: number;
    non_card_actual_expense_total?: number;
    planned_total?: number;
    suppressed_planned_total?: number;
  };
  settlement: {
    wife_due_to_husband: number;
    husband_due_to_wife?: number;
    net_wife_to_husband?: number;
    husband_final_burden: number;
    husband_split_share: number;
    wife_split_share: number;
    husband_salary_balance: number;
    wife_salary_balance: number;
    direction: string;
    wife_transfer_lines?: any[];
    wife_transfer_breakdown?: {
      wife_personal_paid_by_husband: number;
      split_paid_by_husband: number;
      fixed_or_scheduled_paid_by_husband: number;
      credit_husband_paid_by_wife: number;
    };
  };
  card_billing: any[];
  cashflow?: any;
  evidence: any[];
};

type AmountRow = [string, number, string?];

function L(ja: string, en: string): string { return getLocale() === 'en' ? en : ja; }
function yen(n: number | null | undefined): string {
  const value = Math.round(Number(n || 0));
  return `¥${value.toLocaleString('ja-JP')}`;
}
function signedYen(n: number | null | undefined): string {
  const value = Math.round(Number(n || 0));
  return `${value >= 0 ? '+' : '-'}${yen(Math.abs(value))}`;
}

export function renderDashboard(root: HTMLElement) {
  clear(root);
  const picker = new MonthPicker();
  const content = el('div', { class: 'dashboard-page' });
  root.appendChild(picker.element());
  root.appendChild(content);

  async function load(month: string) {
    clear(content);
    content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
    try {
      const data = await api.get<DashboardData>(`/api/analytics/dashboard/${month}`);
      clear(content);

      const wb = data.settlement.wife_transfer_breakdown || {
        wife_personal_paid_by_husband: 0,
        split_paid_by_husband: 0,
        fixed_or_scheduled_paid_by_husband: 0,
        credit_husband_paid_by_wife: 0,
      };

      content.appendChild(summaryHero(data));
      content.appendChild(formulaSection(data, wb));
      content.appendChild(primaryGrids(data, wb));
      content.appendChild(aggregationSection(data));
      content.appendChild(el('div', { id: 'wife-transfer-breakdown' }, [transferBreakdown(data.settlement.wife_transfer_lines || [])]));
      content.appendChild(await inlineMessages(data.month));
      if (data.cashflow?.forecasts) content.appendChild(cashflowSection(data));
      content.appendChild(policySection());
      content.appendChild(evidenceSection(data));
    } catch (e: any) {
      clear(content);
      content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー', 'Error')}: ${e.message}`]));
    }
  }

  picker.onChange(load);
  load(picker.get());
}

function summaryHero(data: DashboardData): HTMLElement {
  const transfer = data.settlement.wife_due_to_husband;
  return el('section', { class: 'dashboard-hero redesigned-dashboard-hero' }, [
    el('div', { class: 'dashboard-hero-copy' }, [
      el('div', { class: 'eyebrow' }, [L('今月の結論', 'This month')]),
      el('h2', {}, [L(`${data.month.replace('-', '年')}月 家計ダッシュボード`, `Household dashboard ${data.month}`)]),
      el('p', { class: 'muted' }, [
        L(`対象期間: ${data.period.start} - ${data.period.end}（25日から翌24日）`, `Period: ${data.period.start} - ${data.period.end} (25th to 24th)`),
      ]),
    ]),
    el('div', { class: 'transfer-decision-panel' }, [
      el('div', { class: 'decision-label' }, [L('妻から夫へ振込む額', 'Wife pays Husband')]),
      el('div', { class: 'decision-amount' }, [yen(transfer)]),
      el('div', { class: 'decision-sub' }, [
        transfer > 0
          ? L('この金額を月末精算の目安にします。', 'Use this as the month-end settlement amount.')
          : L('今月の妻→夫の振込は不要です。', 'No Wife to Husband transfer is needed this month.'),
      ]),
      el('div', { class: 'dashboard-actions' }, [
        el('button', { class: 'primary', onClick: () => scrollToDashboardSection('wife-transfer-breakdown') }, [L('振込内訳', 'Transfer rows')]),
        el('button', { class: 'ghost', onClick: () => scrollToDashboardSection('dashboard-evidence-rows') }, [L('根拠明細', 'Evidence')]),
      ]),
    ]),
  ]);
}

function formulaSection(data: DashboardData, wb: DashboardData['settlement']['wife_transfer_breakdown']): HTMLElement {
  const credit = wb?.credit_husband_paid_by_wife || 0;
  return el('section', { class: 'dashboard-formula-strip' }, [
    formulaTerm(L('妻個人分を夫が立替', 'Wife personal paid by Husband'), wb?.wife_personal_paid_by_husband || 0),
    formulaOperator('+'),
    formulaTerm(L('折半の妻負担', 'Wife split share'), wb?.split_paid_by_husband || 0),
    formulaOperator('+'),
    formulaTerm(L('固定費/予定支払いの妻負担', 'Wife fixed/scheduled share'), wb?.fixed_or_scheduled_paid_by_husband || 0),
    formulaOperator('-'),
    formulaTerm(L('妻が払った夫分', 'Credit paid by Wife'), credit),
    formulaOperator('='),
    formulaTerm(L('振込予定', 'Transfer due'), data.settlement.wife_due_to_husband, true),
  ]);
}

function formulaTerm(label: string, amount: number, total = false): HTMLElement {
  return el('div', { class: `formula-term ${total ? 'formula-total' : ''}` }, [
    el('span', {}, [label]),
    el('strong', {}, [yen(amount)]),
  ]);
}

function formulaOperator(op: string): HTMLElement {
  return el('div', { class: 'formula-operator' }, [op]);
}

function primaryGrids(data: DashboardData, wb: DashboardData['settlement']['wife_transfer_breakdown']): HTMLElement {
  return el('section', { class: 'dashboard-primary-grid' }, [
    amountCard(L('家計サマリー', 'Household summary'), L('集計対象と予定分を分けて表示します。', 'Actuals and plans are separated.'), [
      [L('家計合計', 'Household total'), data.household.total, L('対象外を除く全体額', 'Total excluding out-of-scope rows')],
      [L('カード実績', 'Card actuals'), data.household.card_expense_total || 0],
      [L('カード以外の実績', 'Non-card actuals'), data.household.non_card_actual_expense_total || 0],
      [L('固定費予定', 'Fixed-cost plans'), data.household.fixed_total || 0],
      [L('その他予定支払い', 'Other scheduled plans'), data.household.scheduled_total || 0],
    ], [
      buttonLink(L('根拠を見る', 'View evidence'), 'dashboard-evidence-rows'),
    ]),
    amountCard(L('夫の最終負担', 'Husband final burden'), L('実際に払った額ではなく、最終的に夫が負担する額です。', 'Final burden, not cash actually paid.'), [
      [L('夫個人負担', 'Husband-only burden'), data.household.husband_only],
      [L('折半の夫負担', 'Husband split share'), data.settlement.husband_split_share],
      [L('夫最終負担', 'Husband final burden'), data.settlement.husband_final_burden],
      [L('夫収入との差', 'Income minus burden'), data.settlement.husband_salary_balance],
    ]),
    amountCard(L('妻の精算構成', 'Wife settlement'), L('妻が夫へ払う金額の中身です。', 'What makes up the Wife to Husband amount.'), [
      [L('妻個人分', 'Wife personal'), wb?.wife_personal_paid_by_husband || 0],
      [L('折半分', 'Split share'), wb?.split_paid_by_husband || 0],
      [L('固定費/予定支払い', 'Fixed/scheduled'), wb?.fixed_or_scheduled_paid_by_husband || 0],
      [L('控除', 'Credit'), -(wb?.credit_husband_paid_by_wife || 0)],
      [L('振込予定', 'Transfer due'), data.settlement.wife_due_to_husband],
    ], [
      buttonLink(L('振込内訳を見る', 'View transfer rows'), 'wife-transfer-breakdown'),
    ]),
    el('div', { class: 'dashboard-person-stack' }, [
      personCashCard(L('夫口座', 'Husband accounts'), data.income.toshi, data.settlement.husband_final_burden, data.settlement.husband_salary_balance, data.cashflow?.forecasts?.toshi?.shortfall || 0, data.cashflow?.forecasts?.toshi?.lowest_date),
      personCashCard(L('妻口座', 'Wife accounts'), data.income.lisa, data.settlement.wife_due_to_husband, data.settlement.wife_salary_balance, data.cashflow?.forecasts?.lisa?.shortfall || 0, data.cashflow?.forecasts?.lisa?.lowest_date),
    ]),
  ]);
}

function amountCard(title: string, subtitle: string, rows: AmountRow[], actions: HTMLElement[] = []): HTMLElement {
  const card = el('section', { class: 'dashboard-card' }, [
    el('div', { class: 'section-head' }, [
      el('div', {}, [el('h3', {}, [title]), el('p', { class: 'muted' }, [subtitle])]),
      actions.length ? el('div', { class: 'dashboard-card-actions' }, actions) : el('span', {}),
    ]),
  ]);
  const list = el('div', { class: 'dashboard-amount-list' });
  rows.forEach(([label, amount, note], index) => {
    const isLast = index === rows.length - 1;
    list.appendChild(el('div', { class: `amount-row ${isLast ? 'amount-row-total' : ''}` }, [
      el('span', {}, [label, note ? el('small', { class: 'muted' }, [note]) : '']),
      el('strong', {}, [amount < 0 ? `-${yen(Math.abs(amount))}` : yen(amount)]),
    ]));
  });
  card.appendChild(list);
  return card;
}

function personCashCard(name: string, income: number, outgo: number, balance: number, shortfall = 0, lowestDate?: string): HTMLElement {
  const ok = balance >= 0 && shortfall <= 0;
  return el('section', { class: `person-cash-card ${ok ? 'cash-ok' : 'cash-ng'}` }, [
    el('div', { class: 'person-head' }, [
      el('strong', {}, [name]),
      el('span', { class: 'badge' }, [ok ? L('不足なし', 'Covered') : L('要確認', 'Check')]),
    ]),
    el('div', { class: 'person-balance' }, [signedYen(balance)]),
    el('div', { class: 'muted' }, [`${L('収入', 'Income')} ${yen(income)} / ${L('必要額', 'Required')} ${yen(outgo)}`]),
    shortfall > 0
      ? el('div', { class: 'danger-text' }, [L(`${lowestDate || ''} までに ${yen(shortfall)} 不足見込み`, `${yen(shortfall)} shortfall by ${lowestDate || ''}`)])
      : el('div', { class: 'muted' }, [L('口座不足の見込みはありません', 'No expected shortfall')]),
  ]);
}

function aggregationSection(data: DashboardData): HTMLElement {
  const rows: [string, number, string, string][] = [
    [L('カード支払いなどの実績明細', 'Actual card payments'), Number(data.household.card_expense_total || 0), L('明細タブに入っているカード払いです。', 'Card expenses already entered in Expenses.'), 'dashboard-evidence-rows'],
    [L('カード以外の実績明細', 'Actual non-card payments'), Number(data.household.non_card_actual_expense_total || 0), L('現金・振込・手入力などの支出です。', 'Manual/cash/transfer expenses already entered.'), 'dashboard-evidence-rows'],
    [L('固定費の予定分', 'Fixed-cost plans'), Number(data.household.fixed_total || 0), L('固定費タブの月次予定です。', 'Monthly fixed plans.'), 'dashboard-fixed-plan-rows'],
    [L('その他予定支払い', 'Other scheduled plans'), Number(data.household.scheduled_total || 0), L('保険・税金・PayPalなどの予定支払いです。', 'Insurance, tax, PayPal, and other scheduled payments.'), 'dashboard-scheduled-plan-rows'],
  ];
  const section = el('section', { class: 'dashboard-card dashboard-aggregation-card' }, [
    el('div', { class: 'section-head' }, [
      el('div', {}, [
        el('h3', {}, [L('家計合計の根拠', 'Household total evidence')]),
        el('p', { class: 'muted' }, [L('実績と予定を分け、二重計上を避けて合計しています。', 'Actuals and plans are separated to avoid double counting.')]),
      ]),
    ]),
  ]);
  const list = el('div', { class: 'settlement-list' });
  for (const [label, amount, note, targetId] of rows) {
    list.appendChild(el('div', { class: 'settlement-row aggregation-row' }, [
      el('span', {}, [label, el('small', { class: 'muted' }, [note])]),
      el('div', { class: 'aggregation-row-actions' }, [
        buttonLink(L('根拠を見る', 'View rows'), targetId),
        el('strong', {}, [yen(amount)]),
      ]),
    ]));
  }
  list.appendChild(el('div', { class: 'settlement-row settlement-total' }, [
    el('span', {}, [L('家計合計', 'Household total')]),
    el('strong', {}, [yen(data.household.total)]),
  ]));
  const suppressed = Number(data.household.suppressed_planned_total || 0);
  if (suppressed > 0) {
    section.appendChild(el('div', { class: 'banner banner-info' }, [
      L(`${yen(suppressed)} の固定費/予定支払いは、実績明細と一致したため二重計上から除外済みです。`, `${yen(suppressed)} of plans matched actual expenses and were excluded from double counting.`),
    ]));
  }
  section.appendChild(list);
  section.appendChild(plannedRowsDetails(data));
  return section;
}

function plannedRowsDetails(data: DashboardData): HTMLElement {
  return el('div', { class: 'dashboard-plan-details' }, [
    planRowsTable('dashboard-fixed-plan-rows', L('固定費予定の根拠', 'Fixed-cost plan rows'), data.cashflow?.fixed_plans || []),
    planRowsTable('dashboard-scheduled-plan-rows', L('その他予定支払いの根拠', 'Other scheduled plan rows'), data.cashflow?.scheduled_payments || []),
  ]);
}

function planRowsTable(id: string, title: string, rows: any[]): HTMLElement {
  const total = rows.reduce((a, row) => a + Number(row.amount || 0), 0);
  const details = el('details', { class: 'collapse', id }, [
    el('summary', {}, [`${title} / ${rows.length}${L('件', ' rows')} / ${yen(total)}`]),
  ]);
  if (!rows.length) {
    details.appendChild(el('div', { class: 'muted' }, [L('対象明細はありません', 'No rows')]));
    return details;
  }
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${t('common.payment_date')}</th><th class="num">${t('common.amount')}</th><th>${t('common.description')}</th><th>${t('common.payer')}</th><th>${L('負担', 'Burden')}</th></tr></thead>`;
  const tbody = el('tbody');
  for (const row of rows) {
    tbody.appendChild(el('tr', {}, [
      el('td', { class: 'mono' }, [row.due || row.due_date || row.payment_due_date || '']),
      el('td', { class: 'num' }, [formatYen(row.amount)]),
      el('td', {}, [row.name || row.description || '']),
      el('td', {}, [t(`payer.${row.paid_by || 'toshi'}` as any)]),
      el('td', {}, [t(`owner.${row.burden_owner || row.owner || 'shared'}` as any)]),
    ]));
  }
  table.appendChild(tbody);
  table.appendChild(el('tfoot', {}, [
    el('tr', {}, [
      el('th', {}, [L('合計', 'Total')]),
      el('th', { class: 'num' }, [formatYen(total)]),
      el('th', { colspan: '3' }, [L('この予定明細の合計', 'Total of these planned rows')]),
    ]),
  ]));
  wrap.appendChild(table);
  details.appendChild(wrap);
  return details;
}

function transferBreakdown(lines: any[]): HTMLElement {
  const box = el('details', { class: 'dashboard-card transfer-breakdown-card', open: true }, [
    el('summary', {}, [L('妻→夫 振込予定の根拠明細', 'Wife to Husband transfer evidence')]),
  ]);
  if (!lines.length) {
    box.appendChild(el('div', { class: 'muted' }, [L('対象明細がありません', 'No contributing rows')]));
    return box;
  }
  const total = lines.reduce((a, x) => a + Number(x.wife_due_amount || 0), 0);
  box.appendChild(el('div', { class: 'dashboard-evidence-summary' }, [
    el('span', {}, [L(`明細 ${lines.length} 件 / 合計 ${yen(total)}`, `${lines.length} rows / total ${yen(total)}`)]),
  ]));
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${L('日付','Date')}</th><th>${L('内容','Description')}</th><th>${L('理由','Reason')}</th><th class="num">${L('元金額','Original')}</th><th class="num">${L('妻負担','Wife due')}</th><th>${L('元データ','Source')}</th></tr></thead>`;
  const tb = el('tbody');
  for (const x of lines.slice(0, 120)) {
    tb.appendChild(el('tr', {}, [
      el('td', { class: 'mono' }, [x.date || '-']),
      el('td', {}, [x.description || '-']),
      el('td', {}, [reasonLabel(x.reason)]),
      el('td', { class: 'num' }, [formatYen(x.original_amount || 0)]),
      el('td', { class: 'num' }, [formatYen(x.wife_due_amount || 0)]),
      el('td', {}, [x.source || '-']),
    ]));
  }
  table.appendChild(tb);
  table.appendChild(el('tfoot', {}, [
    el('tr', {}, [
      el('th', {}, [L('合計', 'Total')]),
      el('th', { class: 'num' }, [formatYen(total)]),
      el('th', { colspan: '4' }, [L('妻→夫の振込計算に使う合計', 'Total used for Wife to Husband transfer')]),
    ]),
  ]));
  wrap.appendChild(table);
  box.appendChild(wrap);
  return box;
}

function evidenceSection(data: DashboardData): HTMLElement {
  const rows = data.evidence || [];
  if (!rows.length) return el('div', {});
  const visibleRows = rows.slice(0, 120);
  const total = rows.reduce((a, row) => a + Number(row.amount || 0), 0);
  const visibleTotal = visibleRows.reduce((a, row) => a + Number(row.amount || 0), 0);
  const evidence = el('section', { class: 'dashboard-card', id: 'dashboard-evidence-rows' }, [
    el('div', { class: 'section-head' }, [
      el('div', {}, [
        el('h3', {}, [L('家計合計の根拠明細', 'Household total evidence rows')]),
        el('p', { class: 'muted' }, [L('明細タブから集計された実績行です。', 'Actual rows aggregated from Expenses.')]),
      ]),
    ]),
    el('div', { class: 'dashboard-evidence-summary' }, [
      el('span', {}, [L(`明細 ${rows.length} 件 / 合計 ${yen(total)}`, `${rows.length} rows / total ${yen(total)}`)]),
      rows.length > visibleRows.length
        ? el('small', { class: 'muted' }, [L(`先頭 ${visibleRows.length} 件を表示中。表示分合計 ${yen(visibleTotal)}`, `Showing first ${visibleRows.length}. Visible total ${yen(visibleTotal)}`)])
        : el('small', { class: 'muted' }, [L('全明細を表示中', 'Showing all rows')]),
    ]),
  ]);
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${t('common.date')}</th><th class="num">${t('common.amount')}</th><th>${t('common.description')}</th><th>${t('common.payer')}</th><th>${t('common.category')}</th><th>${t('common.card')}</th></tr></thead>`;
  const tbody = el('tbody');
  for (const row of visibleRows) {
    tbody.appendChild(el('tr', {}, [
      el('td', { class: 'mono' }, [row.date]),
      el('td', { class: 'num' }, [formatYen(row.amount)]),
      el('td', {}, [row.description || '']),
      el('td', {}, [t(`payer.${row.payer}` as any)]),
      el('td', {}, [row.category || '']),
      el('td', {}, [row.card_name || '-']),
    ]));
  }
  table.appendChild(tbody);
  table.appendChild(el('tfoot', {}, [
    el('tr', {}, [
      el('th', {}, [L('合計', 'Total')]),
      el('th', { class: 'num' }, [formatYen(visibleTotal)]),
      el('th', { colspan: '4' }, [rows.length > visibleRows.length ? L('表示分のみ', 'Visible rows only') : L('全明細', 'All rows')]),
    ]),
  ]));
  wrap.appendChild(table);
  evidence.appendChild(wrap);
  return evidence;
}

function cashflowSection(data: DashboardData): HTMLElement {
  const cf = el('section', { class: 'dashboard-card' }, [
    el('div', { class: 'section-head' }, [
      el('div', {}, [
        el('h3', {}, [L('口座不足チェック', 'Cashflow shortfall monitor')]),
        el('p', { class: 'muted' }, [L('予定支払い後の最低残高を確認します。', 'Checks minimum balance after scheduled payments.')]),
      ]),
    ]),
  ]);
  if ((data.cashflow?.suppressed_planned || []).length) {
    cf.appendChild(el('div', { class: 'banner banner-info' }, [
      L(`${data.cashflow.suppressed_planned.length} 件の固定費/予定支払いは実績明細と一致したため二重カウントしていません。`, `${data.cashflow.suppressed_planned.length} fixed/scheduled items matched actual expenses and were not double-counted.`),
    ]));
  }
  cf.appendChild(el('div', { class: 'cashflow-grid' }, [
    shortfallBox(L('夫口座', 'Husband accounts'), data.cashflow.forecasts.toshi),
    shortfallBox(L('妻口座', 'Wife accounts'), data.cashflow.forecasts.lisa),
    shortfallBox(L('共同口座', 'Shared accounts'), data.cashflow.forecasts.shared),
  ]));
  return cf;
}

function shortfallBox(label: string, f: any): HTMLElement {
  if (!f) return el('div', { class: 'metric' }, [label]);
  return el('div', { class: `metric ${Number(f.shortfall || 0) > 0 ? 'metric-warning' : 'metric-ok'}` }, [
    el('div', { class: 'metric-label' }, [label]),
    el('div', { class: 'metric-value' }, [Number(f.shortfall || 0) > 0 ? yen(f.shortfall) : 'OK']),
    el('div', { class: 'muted' }, [Number(f.shortfall || 0) > 0 ? L(`${f.lowest_date || ''} までに必要`, `Needed by ${f.lowest_date || ''}`) : L(`最低残高 ${yen(f.minimum_balance || 0)}`, `Minimum balance ${yen(f.minimum_balance || 0)}`)]),
  ]);
}

function policySection(): HTMLElement {
  const policy = el('details', { class: 'collapse dashboard-policy' }, [
    el('summary', {}, [L('計算ルール', 'Calculation rules')]),
  ]);
  policy.appendChild(el('div', { class: 'banner banner-info' }, [
    L(
      '負担者は「最終的に誰が負担するか」、実支払者は「どのカード/口座から払ったか」です。妻→夫の振込予定は、夫が立て替えた妻個人分、折半の妻負担、固定費/予定支払いの妻負担から、妻が払った夫分を差し引いて計算します。',
      'Burden owner means who ultimately bears the cost. Actual payer means whose card/account paid it. Wife to Husband transfer equals Wife personal costs paid by Husband plus Wife split share plus Wife fixed/scheduled share minus credits paid by Wife.'
    ),
  ]));
  return policy;
}

function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    wife_personal_paid_by_husband: L('妻個人分を夫が立替', 'Wife personal paid by Husband'),
    split_paid_by_husband: L('折半分を夫が立替', 'Split item paid by Husband'),
    fixed_or_scheduled_paid_by_husband: L('固定費/予定支払いの妻負担', 'Wife share of fixed/scheduled'),
    credit_husband_paid_by_wife: L('妻が夫分を払った控除', 'Credit: Husband cost paid by Wife'),
    husband_personal_paid_by_wife: L('夫個人分を妻が立替（控除）', 'Husband personal paid by Wife (credit)'),
    split_paid_by_wife: L('折半分を妻が立替（控除）', 'Split item paid by Wife (credit)'),
  };
  return map[reason] || reason || '-';
}

function buttonLink(label: string, targetId: string): HTMLElement {
  return el('button', { class: 'ghost btn-small', onClick: () => scrollToDashboardSection(targetId) }, [label]);
}

function scrollToDashboardSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  if (target instanceof HTMLDetailsElement) target.open = true;
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function isSystemLocalAuthor(author: any): boolean {
  const raw = String(author || '').trim().toLowerCase();
  return !raw || raw === 'dev@local' || raw === 'unknown' || raw === '夫婦メモ';
}

async function inlineMessages(month: string): Promise<HTMLElement> {
  const card = el('section', { class: 'dashboard-card message-inline-card' }, [
    el('div', { class: 'section-head' }, [
      el('div', {}, [
        el('h3', {}, [L('夫婦メモ', 'Couple notes')]),
        el('p', { class: 'muted' }, [L('精算メモや確認事項を残します。', 'Leave settlement notes and checks.')]),
      ]),
    ]),
  ]);
  const body = el('textarea', { rows: 3, autocomplete: 'off', autocapitalize: 'off', 'data-lpignore': 'true', 'data-form-type': 'other', placeholder: L('妻への連絡、精算メモなど', 'Notes for Wife, settlement memo, etc.') }) as HTMLTextAreaElement;
  const list = el('div', { class: 'message-list' });
  async function load() {
    clear(list);
    try {
      const data = await api.get<{ items: any[] }>(`/api/messages?month=${month}`);
      for (const m of (data.items || []).slice(0, 5)) {
        const children: HTMLElement[] = [];
        if (!isSystemLocalAuthor(m.author)) children.push(el('strong', {}, [String(m.author)]));
        children.push(el('span', {}, [m.body || '']));
        children.push(el('small', {}, [m.created_at || '']));
        list.appendChild(el('div', { class: `message-chip ${m.read_at ? '' : 'message-unread'}` }, children));
      }
      if (!(data.items || []).length) list.appendChild(el('div', { class: 'muted' }, [L('メモはまだありません', 'No notes yet')]));
    } catch {
      list.appendChild(el('div', { class: 'muted' }, [L('メモを読み込めません', 'Could not load notes')]));
    }
  }
  card.appendChild(body);
  card.appendChild(el('div', { class: 'row-flex' }, [
    el('button', { class: 'btn', onClick: async () => {
      if (!body.value.trim()) return;
      await api.post('/api/messages', { month, body: body.value.trim() });
      body.value = '';
      await load();
    } }, [L('メモを追加', 'Add note')]),
  ]));
  card.appendChild(list);
  await load();
  return card;
}
