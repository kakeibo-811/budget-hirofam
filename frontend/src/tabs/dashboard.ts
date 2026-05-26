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
    other?: number;
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
    wife_transfer_breakdown?: { wife_personal_paid_by_husband: number; split_paid_by_husband: number; fixed_or_scheduled_paid_by_husband: number; credit_husband_paid_by_wife: number };
    wife_transfer_positive_total?: number;
    wife_transfer_credit_total?: number;
  };
  card_billing: any[];
  account_balances?: any[];
  cashflow?: any;
  assets?: any;
  messages?: any[];
  settings?: Record<string, string>;
  aggregation_policy?: { actuals_override_plans?: boolean; card_fixed_split_explained?: boolean; note?: string };
  evidence: any[];
};

function L(ja: string, en: string): string { return getLocale() === 'en' ? en : ja; }
function signedYen(n: number): string { return `${n >= 0 ? '+' : ''}${formatYen(n).replace('¥', '')}円`; }
function yenNoSymbol(n: number): string { return formatYen(n).replace('¥', '') + '円'; }

export function renderDashboard(root: HTMLElement) {
  clear(root);
  const picker = new MonthPicker();
  const content = el('div', {});
  root.appendChild(picker.element());
  root.appendChild(content);

  async function load(month: string) {
    clear(content);
    content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
    try {
      const data = await api.get<DashboardData>(`/api/analytics/dashboard/${month}`);
      clear(content);

      const hero = el('section', { class: 'dashboard-hero' });
      hero.appendChild(el('div', { class: 'dashboard-title-row' }, [
        el('div', {}, [
          el('div', { class: 'eyebrow' }, ['OVERVIEW']),
          el('h2', {}, [L(`${data.month.replace('-', '年')}月 家計サマリー`, `Household Summary ${data.month}`)]),
          el('p', { class: 'muted' }, [L(
            `対象期間: ${data.period.start} 〜 ${data.period.end}（毎月25日〜翌月24日）`,
            `Period: ${data.period.start} - ${data.period.end} (25th to 24th salary cycle)`
          )]),
        ]),
        metricBox(L('家計総額', 'Household total'), yenNoSymbol(data.household.total), '', 'metric-accent'),
      ]));

      const metrics = el('div', { class: 'dashboard-metrics' }, [
        metricBox(L('妻→夫 振込予定', 'Wife → Husband'), yenNoSymbol(data.settlement.wife_due_to_husband), L('妻個人分＋折半分＋固定費/変動費−控除。クリックで内訳', 'Wife personal + split share + fixed/scheduled - credits. Click for details'), 'metric-transfer metric-primary clickable-metric', () => { document.getElementById('wife-transfer-breakdown')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); const d = document.querySelector('#wife-transfer-breakdown details') as HTMLDetailsElement | null; if (d) d.open = true; }),
        metricBox(L('妻個人分立替', 'Wife personal advanced'), yenNoSymbol(data.settlement.wife_transfer_breakdown?.wife_personal_paid_by_husband ?? data.household.wife_personal_advanced), L('夫カード/夫口座で払った妻負担', 'Wife-owned costs paid by Husband')),
        metricBox(L('折半分立替', 'Split advanced'), yenNoSymbol(data.settlement.wife_transfer_breakdown?.split_paid_by_husband ?? data.settlement.wife_split_share), L('折半対象の妻負担分', 'Wife half of shared costs')),
        metricBox(L('固定費・変動費分', 'Fixed/scheduled share'), yenNoSymbol(data.settlement.wife_transfer_breakdown?.fixed_or_scheduled_paid_by_husband ?? 0), L('夫が払う家計系支払の妻負担', 'Wife share of household recurring payments')),
        metricBox(L('折半対象総額', 'Split base total'), yenNoSymbol(data.household.split_total), L(`1人あたり ${yenNoSymbol(data.household.split_each)}`, `Each ${yenNoSymbol(data.household.split_each)}`)),
        metricBox(L('家計総額', 'Household total'), yenNoSymbol(data.household.total), L('対象外を除く集計', 'Excludes out-of-scope rows')),
      ]);
      hero.appendChild(metrics);

      const cash = el('div', { class: 'dashboard-cash-grid' }, [
        personCashCard('👨', L('夫', 'Husband'), data.income.toshi, data.settlement.husband_final_burden, data.settlement.husband_salary_balance, data.cashflow?.forecasts?.toshi?.shortfall || 0, data.cashflow?.forecasts?.toshi?.lowest_date),
        personCashCard('👩', L('妻', 'Wife'), data.income.lisa, data.settlement.wife_due_to_husband, data.settlement.wife_salary_balance, data.cashflow?.forecasts?.lisa?.shortfall || 0, data.cashflow?.forecasts?.lisa?.lowest_date),
      ]);
      hero.appendChild(cash);

      const wb = data.settlement.wife_transfer_breakdown || { wife_personal_paid_by_husband: 0, split_paid_by_husband: 0, fixed_or_scheduled_paid_by_husband: 0, credit_husband_paid_by_wife: 0 };
      const detailGrid = el('div', { class: 'dashboard-detail-grid' }, [
        detailCard('👩', L('妻→夫 支払予定の設計', 'Wife → Husband transfer design'), L('夫が立て替えた妻個人分・折半分・固定費/変動費の妻負担を、月末に妻が夫へ支払う考え方です。', 'Wife pays Husband for Wife personal costs, split costs, and fixed/scheduled household costs advanced by Husband.'), [
          [L('妻個人分を夫が立替', 'Wife personal paid by Husband'), wb.wife_personal_paid_by_husband],
          [L('折半分を夫が立替', 'Split share paid by Husband'), wb.split_paid_by_husband],
          [L('固定費・変動費の妻負担', 'Wife share of fixed/scheduled'), wb.fixed_or_scheduled_paid_by_husband],
          [L('妻が夫分を払った控除', 'Credit: Husband cost paid by Wife'), -wb.credit_husband_paid_by_wife],
          [L('振込予定', 'Transfer due'), data.settlement.wife_due_to_husband],
        ], true),
        detailCard('👨', L('夫側の支払い状況', 'Husband payment status'), L('夫自身の負担と、先に払った家計支払の確認です。', 'Shows Husband own burden and household payments advanced by Husband.'), [
          [L('夫負担分', 'Husband own share'), data.household.husband_only],
          [L('折半対象総額', 'Split total'), data.household.split_total],
          [L('固定費', 'Fixed costs'), data.household.fixed_total],
          [L('夫最終負担', 'Husband final burden'), data.settlement.husband_final_burden],
        ]),
      ]);
      hero.appendChild(detailGrid);
      hero.appendChild(aggregationExplanation(data));
      hero.appendChild(el('div', { id: 'wife-transfer-breakdown' }, [transferBreakdown(data.settlement.wife_transfer_lines || [])]));
      content.appendChild(hero);

      const transferJump = el('button', { class: 'primary wide-action', onClick: () => { localStorage.setItem('currentTab', 'settle'); location.reload(); } }, [L('妻→夫の振込予定の内訳を見る', 'Open transfer breakdown')]);
      content.appendChild(transferJump);
      content.appendChild(await inlineMessages(data.month));

      if (data.cashflow?.forecasts) {
        const cf = el('div', { class: 'card' }, [el('h3', {}, [L('口座ショート監視', 'Cashflow shortfall monitor')])]);
        if ((data.cashflow?.suppressed_planned || []).length) {
          cf.appendChild(el('div', { class: 'banner banner-info' }, [L(`同月の実績明細と一致した固定費・変動費 ${data.cashflow.suppressed_planned.length} 件は、概要では二重カウントしていません。`, `${data.cashflow.suppressed_planned.length} fixed/scheduled items matched actual expenses and were not double-counted.`)]));
        }
        cf.appendChild(el('div', { class: 'cashflow-grid' }, [
          shortfallBox(L('夫口座', 'Husband accounts'), data.cashflow.forecasts.toshi),
          shortfallBox(L('妻口座', 'Wife accounts'), data.cashflow.forecasts.lisa),
          shortfallBox(L('共同口座', 'Shared accounts'), data.cashflow.forecasts.shared),
        ]));
        content.appendChild(cf);
      }

      const policy = el('details', { class: 'collapse' }, [el('summary', {}, [L('このダッシュボードの計算ルール', 'Dashboard calculation rules')])]);
      policy.appendChild(el('div', { class: 'banner banner-info' }, [L(
        '夫が、夫カード・夫口座で妻個人分と折半対象を立て替える前提です。支払者/負担者は『最終的に誰が負担するか』、実支払者は『実際にカード・口座から払う人』として分けます。妻→夫の振込予定は、夫が払った妻個人分＋折半対象の妻半分＋固定費/変動費の妻負担−妻が夫分を払った控除で計算します。',
        'Payer/burden means who should ultimately bear the cost, while actual payer means whose card/account paid it. Wife→Husband transfer = Wife personal costs paid by Husband + Wife half of split costs paid by Husband + Wife share of fixed/scheduled payments - credits where Wife paid Husband costs.'
      )]));
      content.appendChild(policy);

      if ((data.evidence ?? []).length > 0) {
        const evidence = el('div', { class: 'card' }, [el('h3', {}, [L('根拠明細', 'Evidence rows')])]);
        const wrap = el('div', { class: 'table-wrap' });
        const table = el('table', { class: 'data compact-table' });
        table.innerHTML = `<thead><tr><th>${t('common.date')}</th><th class="num">${t('common.amount')}</th><th>${t('common.description')}</th><th>${t('common.payer')}</th><th>${t('common.category')}</th><th>${t('common.card')}</th></tr></thead>`;
        const tbody = el('tbody');
        for (const row of data.evidence.slice(0, 80)) {
          tbody.appendChild(el('tr', {}, [
            el('td', { class: 'mono' }, [row.date]),
            el('td', { class: 'num' }, [formatYen(row.amount)]),
            el('td', {}, [row.description || '']),
            el('td', {}, [t(`payer.${row.payer}` as any)]),
            el('td', {}, [row.category || '']),
            el('td', {}, [row.card_name || '—']),
          ]));
        }
        table.appendChild(tbody);
        wrap.appendChild(table);
        evidence.appendChild(wrap);
        content.appendChild(evidence);
      }
    } catch (e: any) {
      clear(content);
      content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー', 'Error')}: ${e.message}`]));
    }
  }

  picker.onChange(load);
  load(picker.get());
}

function aggregationExplanation(data: DashboardData): HTMLElement {
  const card = el('details', { class: 'card dashboard-aggregation-card', open: true }, [
    el('summary', {}, [L('集計データの内訳：実績と予定を分けて表示', 'Aggregation: actuals and plans separated')]),
  ]);
  card.appendChild(el('p', { class: 'muted' }, [L(
    '家計合計は「明細に入った実績」と「まだ明細化されていない固定費/予定支払い」を足しています。カード支払いと固定費が混ざって見えないよう、ここで分けて確認できます。',
    'Household total combines actual expense rows with fixed/scheduled plans that have not yet become actual rows.'
  )]));
  const rows: [string, number, string][] = [
    [L('カード支払いなどの実績明細', 'Actual card payments'), Number(data.household.card_expense_total || 0), L('明細タブに入っているカード払い。支払日/家計月で集計します。', 'Card expenses already entered in Expenses.')],
    [L('カード以外の実績明細', 'Actual non-card payments'), Number(data.household.non_card_actual_expense_total || 0), L('現金・振込・手入力など、カード以外で明細化済みの支出です。', 'Manual/cash/transfer expenses already entered.')],
    [L('固定費の予定分', 'Fixed-cost plans'), Number(data.household.fixed_total || 0), L('固定費タブの月次予定。実績明細と一致するものは二重計上しません。', 'Monthly fixed plans. Matching actual rows are not double-counted.')],
    [L('その他予定支払い', 'Other scheduled plans'), Number(data.household.scheduled_total || 0), L('保険・税金・PayPalなど、固定費以外の予定支払いです。', 'Insurance, tax, PayPal, and other scheduled payments.')],
  ];
  const list = el('div', { class: 'settlement-list' });
  for (const [label, amount, note] of rows) {
    list.appendChild(el('div', { class: 'settlement-row aggregation-row' }, [
      el('span', {}, [label, el('small', { class: 'muted' }, [note])]),
      el('strong', {}, [yenNoSymbol(amount)]),
    ]));
  }
  list.appendChild(el('div', { class: 'settlement-row settlement-total' }, [
    el('span', {}, [L('家計合計', 'Household total')]),
    el('strong', {}, [yenNoSymbol(data.household.total)]),
  ]));
  const suppressed = Number(data.household.suppressed_planned_total || 0);
  if (suppressed > 0) {
    card.appendChild(el('div', { class: 'banner banner-info' }, [L(
      `実績明細と一致した固定費/予定支払い ${yenNoSymbol(suppressed)} は二重計上から除外済みです。`,
      `${yenNoSymbol(suppressed)} of plans matched actual expenses and were excluded from double counting.`
    )]));
  }
  card.appendChild(list);
  return card;
}


function isSystemLocalAuthor(author: any): boolean {
  const raw = String(author || '').trim().toLowerCase();
  return !raw || raw === 'dev@local' || raw === 'unknown' || raw === '夫婦メモ';
}

async function inlineMessages(month: string): Promise<HTMLElement> {
  const card = el('div', { class: 'card message-inline-card' }, [el('h3', {}, [L('夫婦メモ', 'Couple notes')])]);
  const body = el('textarea', { rows: 3, autocomplete: 'off', autocapitalize: 'off', 'data-lpignore': 'true', 'data-form-type': 'other', placeholder: L('妻への連絡、精算メモなど', 'Notes for Wife, settlement memo, etc.') }) as HTMLTextAreaElement;
  body.value = '';
  body.addEventListener('focus', () => { if (body.value.trim() === 'dev@local') body.value = ''; });
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
    } catch { list.appendChild(el('div', { class: 'muted' }, [L('メモを読み込めません', 'Could not load notes')])); }
  }
  card.appendChild(el('p', { class: 'muted' }, [L('妻が夫へ払う立替金の確認欄の直下に表示します。新しいメモはハイライトされます。', 'Shown directly under the Wife→Husband transfer section. New notes are highlighted.')])) ;
  card.appendChild(body);
  card.appendChild(el('div', { class: 'row-flex' }, [el('button', { class: 'btn', onClick: async () => { if (!body.value.trim()) return; await api.post('/api/messages', { month, body: body.value.trim() }); body.value = ''; await load(); } }, [L('メモを追加', 'Add note')]) ]));
  card.appendChild(list);
  await load();
  return card;
}


function reasonLabel(reason: string): string {
  const map: Record<string, string> = {
    wife_personal_paid_by_husband: L('妻個人分を夫が立替', 'Wife personal paid by Husband'),
    split_paid_by_husband: L('折半分を夫が立替', 'Split item paid by Husband'),
    fixed_or_scheduled_paid_by_husband: L('固定費・変動費の妻負担', 'Wife share of fixed/scheduled'),
    credit_husband_paid_by_wife: L('妻が夫分を払った控除', 'Credit: Husband cost paid by Wife'),
    husband_personal_paid_by_wife: L('夫個人分を妻が立替（控除）', 'Husband personal paid by Wife (credit)'),
    split_paid_by_wife: L('折半分を妻が立替（控除）', 'Split item paid by Wife (credit)'),
  };
  return map[reason] || reason || '—';
}

function transferBreakdown(lines: any[]): HTMLElement {
  const box = el('details', { class: 'card transfer-breakdown-card', open: true }, [
    el('summary', {}, [L('妻→夫 振込予定の内訳', 'Breakdown of Wife → Husband transfer')]),
  ]);
  if (!lines.length) {
    box.appendChild(el('div', { class: 'muted' }, [L('対象明細がありません', 'No contributing rows')]));
    return box;
  }
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${L('日付','Date')}</th><th>${L('内容','Description')}</th><th>${L('理由','Reason')}</th><th class="num">${L('元金額','Original')}</th><th class="num">${L('妻負担','Wife due')}</th><th>${L('元タブ','Source')}</th></tr></thead>`;
  const tb = el('tbody');
  for (const x of lines.slice(0, 80)) tb.appendChild(el('tr', {}, [
    el('td', { class: 'mono' }, [x.date || '—']),
    el('td', {}, [x.description || '—']),
    el('td', {}, [reasonLabel(x.reason)]),
    el('td', { class: 'num' }, [formatYen(x.original_amount || 0)]),
    el('td', { class: 'num' }, [formatYen(x.wife_due_amount || 0)]),
    el('td', {}, [x.source || '—']),
  ]));
  table.appendChild(tb);
  wrap.appendChild(table);
  box.appendChild(wrap);
  return box;
}

function metricBox(label: string, value: string, sub = '', extraClass = '', onClick?: () => void): HTMLElement {
  const m = el('div', { class: `metric dashboard-metric ${extraClass}`, tabindex: onClick ? '0' : undefined, role: onClick ? 'button' : undefined, onClick: onClick ? () => onClick() : undefined, onKeydown: onClick ? (ev: KeyboardEvent) => { if (ev.key === 'Enter' || ev.key === ' ') onClick(); } : undefined });
  m.appendChild(el('div', { class: 'metric-label' }, [label]));
  m.appendChild(el('div', { class: 'metric-value' }, [value]));
  if (sub) m.appendChild(el('div', { class: 'muted' }, [sub]));
  return m;
}

function personCashCard(icon: string, name: string, income: number, required: number, balance: number, shortfall = 0, lowestDate?: string): HTMLElement {
  const ok = balance >= 0 && shortfall <= 0;
  return el('div', { class: `person-cash-card ${ok ? 'cash-ok' : 'cash-ng'}` }, [
    el('div', { class: 'person-head' }, [el('strong', {}, [`${icon} ${name}`]), el('span', { class: 'badge' }, [ok ? L('収入内', 'Covered') : L('要確認', 'Check')])]),
    el('div', { class: 'person-balance' }, [signedYen(balance)]),
    el('div', { class: 'muted' }, [`${L('収入', 'Income')} ${yenNoSymbol(income)} / ${L('支出', 'Outgo')} ${yenNoSymbol(required)}`]),
    shortfall > 0 ? el('div', { class: 'danger-text' }, [L(`${lowestDate || ''} 時点で ${yenNoSymbol(shortfall)} 不足見込み`, `${yenNoSymbol(shortfall)} shortfall by ${lowestDate || ''}`)]) : el('div', { class: 'muted' }, [L('ショート見込みなし', 'No expected shortfall')]),
  ]);
}

function shortfallBox(label: string, f: any): HTMLElement {
  if (!f) return el('div', { class: 'metric' }, [label]);
  return el('div', { class: `metric ${Number(f.shortfall || 0) > 0 ? 'metric-warning' : 'metric-ok'}` }, [
    el('div', { class: 'metric-label' }, [label]),
    el('div', { class: 'metric-value' }, [Number(f.shortfall || 0) > 0 ? yenNoSymbol(f.shortfall) : 'OK']),
    el('div', { class: 'muted' }, [Number(f.shortfall || 0) > 0 ? L(`${f.lowest_date || ''} までに必要`, `Needed by ${f.lowest_date || ''}`) : L(`最低残高 ${yenNoSymbol(f.minimum_balance || 0)}`, `Minimum balance ${yenNoSymbol(f.minimum_balance || 0)}`)]),
  ]);
}

function detailCard(icon: string, title: string, subtitle: string, rows: [string, number][], emphasizeLast = false): HTMLElement {
  const box = el('div', { class: 'settlement-card' }, [
    el('h3', {}, [`${icon} ${title}`]),
    el('div', { class: 'muted' }, [subtitle]),
  ]);
  const list = el('div', { class: 'settlement-list' });
  rows.forEach(([label, amount], index) => {
    const isLast = index === rows.length - 1;
    list.appendChild(el('div', { class: `settlement-row ${isLast ? 'settlement-total' : ''} ${emphasizeLast && isLast ? 'settlement-transfer' : ''}` }, [
      el('span', {}, [label]),
      el('strong', {}, [yenNoSymbol(amount)]),
    ]));
  });
  box.appendChild(list);
  return box;
}
