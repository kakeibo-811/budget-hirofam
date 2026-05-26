import { el, clear, api, formatYen, shiftMonth, thisMonth } from '../utils';
import { t, getLocale } from '../i18n';
import { MonthPicker } from '../components/month-picker';

type Dash = any;
function L(ja: string, en: string): string { return getLocale() === 'en' ? en : ja; }
function signedYen(n: number): string { return `${n >= 0 ? '+' : ''}${formatYen(n)}`; }

export function renderAnalytics(root: HTMLElement) {
  clear(root);
  const picker = new MonthPicker();
  let range = Number(localStorage.getItem('analysisRange') || 6);
  const content = el('div');
  root.appendChild(picker.element());
  root.appendChild(content);

  async function load(month: string) {
    clear(content);
    content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
    try {
      const months = Array.from({ length: range }, (_, i) => shiftMonth(month, i - range + 1));
      const dashboards = await Promise.all(months.map((m) => api.get<Dash>(`/api/analytics/dashboard/${m}`)));
      const dash = dashboards[dashboards.length - 1];
      clear(content);
      content.appendChild(header(month, range, async (r) => { range = r; localStorage.setItem('analysisRange', String(r)); await load(month); }));
      content.appendChild(el('div', { class: 'analytics-metrics' }, [
        metric(L('世帯収支', 'Household balance'), (dash.income?.total || 0) - (dash.household?.total || 0), `${dash.period.start} - ${dash.period.end}`),
        metric(L('夫', 'Husband'), dash.settlement?.husband_salary_balance || 0, `${L('収入', 'Income')} ${formatYen(dash.income?.toshi || 0)} / ${L('支出', 'Outgo')} ${formatYen(dash.settlement?.husband_final_burden || 0)}`),
        metric(L('妻', 'Wife'), dash.settlement?.wife_salary_balance || 0, `${L('収入', 'Income')} ${formatYen(dash.income?.lisa || 0)} / ${L('夫へ振込', 'Transfer')} ${formatYen(dash.settlement?.wife_due_to_husband || 0)}`),
        metric(L('妻→夫', 'Wife → Husband'), dash.settlement?.wife_due_to_husband || 0, L('月末までの振込予定', 'Transfer due by month end'), true),
      ]));
      content.appendChild(visualGraphCard(dashboards));
      content.appendChild(trendCard(dashboards));
      content.appendChild(judgementCard(dashboards));
      content.appendChild(cashflowCard(dash));
      content.appendChild(topExpensesCard(dash));
    } catch (e: any) {
      clear(content);
      content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー', 'Error')}: ${e.message}`]));
    }
  }
  picker.onChange(load);
  load(picker.get() || thisMonth());
}

function header(month: string, range: number, setRange: (r: number) => void): HTMLElement {
  const buttons = [1, 3, 6, 12].map((r) => el('button', { class: r === range ? 'pill active' : 'pill', onClick: () => setRange(r) }, [`${r}M`]));
  return el('section', { class: 'analytics-hero' }, [
    el('div', {}, [
      el('div', { class: 'eyebrow' }, ['ANALYSIS']),
      el('h2', {}, [L('収入 vs 支出', 'Income vs Outgo')]),
      el('p', { class: 'muted' }, [L('25日〜翌24日の家計月で、夫婦別に収入内か、いつ口座がショートしそうかを追跡します。', 'Tracks income coverage and cash shortfall by the 25-to-24 budget cycle.')]),
    ]),
    el('div', { class: 'range-card' }, [el('strong', {}, [L('推移範囲', 'Range')]), el('div', { class: 'pill-row' }, buttons), el('div', { class: 'muted' }, [month])]),
  ]);
}

function metric(label: string, amount: number, sub: string, neutral = false): HTMLElement {
  const ok = neutral || amount >= 0;
  return el('div', { class: `metric ${ok ? 'metric-ok' : 'metric-warning'}` }, [
    el('div', { class: 'metric-label' }, [label]),
    el('div', { class: 'metric-value' }, [neutral ? formatYen(amount) : signedYen(amount)]),
    el('div', { class: 'muted' }, [sub]),
  ]);
}


function visualGraphCard(items: Dash[]): HTMLElement {
  const card = el('div', { class: 'card analytics-visual-card soft-card' }, [
    el('div', { class: 'section-head' }, [
      el('div', {}, [el('h3', {}, [L('収支グラフ', 'Visual cashflow graph')]), el('p', { class: 'muted' }, [L('夫婦別の収入・支出・妻→夫振込予定を月次で比較します。', 'Compares income, outgo, and Wife→Husband transfer by month.')])]),
    ])
  ]);
  card.appendChild(stackedSvg(items));
  card.appendChild(lineSvg(items));
  return card;
}
function svgEl(tag: string, attrs: Record<string, any> = {}): SVGElement {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
}
function stackedSvg(items: Dash[]): HTMLElement {
  const wrap = el('div', { class: 'chart-wrap' });
  const width = 760, height = 260, pad = 34;
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': L('月次収入支出棒グラフ', 'Monthly income and outgo bar chart') }) as SVGSVGElement;
  const max = Math.max(1, ...items.flatMap((d) => [d.income?.toshi || 0, d.income?.lisa || 0, d.settlement?.husband_final_burden || 0, d.settlement?.wife_due_to_husband || 0]));
  const groupW = (width - pad * 2) / Math.max(1, items.length);
  svg.appendChild(svgEl('line', { x1: pad, y1: height - pad, x2: width - pad / 2, y2: height - pad, class: 'chart-axis' }));
  items.forEach((d, i) => {
    const x = pad + i * groupW + 8;
    const barW = Math.max(7, Math.min(18, groupW / 5));
    const vals = [
      { v: d.income?.toshi || 0, cls: 'chart-income-h', label: L('夫収入', 'H income') },
      { v: d.settlement?.husband_final_burden || 0, cls: 'chart-out-h', label: L('夫支出', 'H outgo') },
      { v: d.income?.lisa || 0, cls: 'chart-income-w', label: L('妻収入', 'W income') },
      { v: d.settlement?.wife_due_to_husband || 0, cls: 'chart-out-w', label: L('妻支出', 'W outgo') },
    ];
    vals.forEach((r, j) => {
      const h = Math.max(1, (r.v / max) * (height - pad * 2));
      const rect = svgEl('rect', { x: x + j * (barW + 3), y: height - pad - h, width: barW, height: h, rx: 5, class: `chart-bar ${r.cls}` });
      rect.appendChild(svgEl('title'));
      rect.querySelector('title')!.textContent = `${d.month} ${r.label} ${formatYen(r.v)}`;
      svg.appendChild(rect);
    });
    const text = svgEl('text', { x: x, y: height - 10, class: 'chart-label' });
    text.textContent = d.month.slice(5);
    svg.appendChild(text);
  });
  wrap.appendChild(svg);
  wrap.appendChild(legend([
    [L('夫収入','H income'), 'chart-income-h'], [L('夫支出','H outgo'), 'chart-out-h'], [L('妻収入','W income'), 'chart-income-w'], [L('妻支出/振込','W outgo'), 'chart-out-w']
  ]));
  return wrap;
}
function lineSvg(items: Dash[]): HTMLElement {
  const wrap = el('div', { class: 'chart-wrap chart-wrap-compact' });
  const width = 760, height = 180, pad = 30;
  const values = items.map((d) => Number(d.settlement?.wife_due_to_husband || 0));
  const max = Math.max(1, ...values);
  const svg = svgEl('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': L('妻から夫への振込予定推移', 'Wife to Husband transfer trend') }) as SVGSVGElement;
  svg.appendChild(svgEl('line', { x1: pad, y1: height - pad, x2: width - pad / 2, y2: height - pad, class: 'chart-axis' }));
  if (items.length > 1) {
    const pts = values.map((v, i) => {
      const x = pad + (i / (items.length - 1)) * (width - pad * 2);
      const y = height - pad - (v / max) * (height - pad * 2);
      return [x, y, v] as const;
    });
    const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
    svg.appendChild(svgEl('path', { d: path, class: 'chart-line', fill: 'none' }));
    pts.forEach((p, i) => {
      const c = svgEl('circle', { cx: p[0], cy: p[1], r: 5, class: 'chart-dot' });
      c.appendChild(svgEl('title'));
      c.querySelector('title')!.textContent = `${items[i].month} ${formatYen(p[2])}`;
      svg.appendChild(c);
      const label = svgEl('text', { x: p[0] - 14, y: height - 8, class: 'chart-label' });
      label.textContent = items[i].month.slice(5);
      svg.appendChild(label);
    });
  }
  wrap.appendChild(el('h4', {}, [L('妻→夫 振込予定の推移', 'Wife→Husband transfer trend')]));
  wrap.appendChild(svg);
  return wrap;
}
function legend(items: [string, string][]): HTMLElement {
  return el('div', { class: 'chart-legend' }, items.map(([label, cls]) => el('span', {}, [el('i', { class: cls }, []), label])));
}

function trendCard(items: Dash[]): HTMLElement {
  const card = el('div', { class: 'card' }, [el('h3', {}, [L('月次収支トレンド', 'Monthly trend')])]);
  const max = Math.max(1, ...items.map((d) => Math.max(d.income?.toshi || 0, d.income?.lisa || 0, d.household?.total || 0)));
  const bars = el('div', { class: 'trend-bars' });
  for (const d of items) {
    const toshiOut = d.settlement?.husband_final_burden || 0;
    const lisaOut = d.settlement?.wife_due_to_husband || 0;
    bars.appendChild(el('div', { class: 'trend-row' }, [
      el('div', { class: 'trend-month' }, [d.month]),
      bar(L('夫収入', 'H inc'), d.income?.toshi || 0, max),
      bar(L('夫支出', 'H out'), toshiOut, max),
      bar(L('妻収入', 'W inc'), d.income?.lisa || 0, max),
      bar(L('妻支出', 'W out'), lisaOut, max),
    ]));
  }
  card.appendChild(bars);
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${L('月','Month')}</th><th class="num">${L('夫収入','H income')}</th><th class="num">${L('夫支出','H outgo')}</th><th class="num">${L('妻収入','W income')}</th><th class="num">${L('妻支出','W outgo')}</th><th class="num">${L('妻→夫','W→H')}</th></tr></thead>`;
  const tb = el('tbody');
  for (const d of items) tb.appendChild(el('tr', {}, [
    el('td', {}, [d.month]),
    el('td', { class: 'num' }, [formatYen(d.income?.toshi || 0)]),
    el('td', { class: 'num' }, [formatYen(d.settlement?.husband_final_burden || 0)]),
    el('td', { class: 'num' }, [formatYen(d.income?.lisa || 0)]),
    el('td', { class: 'num' }, [formatYen(d.settlement?.wife_due_to_husband || 0)]),
    el('td', { class: 'num' }, [formatYen(d.settlement?.wife_due_to_husband || 0)]),
  ]));
  table.appendChild(tb); wrap.appendChild(table); card.appendChild(wrap); return card;
}
function bar(label: string, amount: number, max: number): HTMLElement {
  const pct = Math.max(3, Math.round((amount / max) * 100));
  const b = el('div', { class: 'mini-bar' }, [el('span', { style: `width:${pct}%` }, []), el('em', {}, [`${label} ${formatYen(amount)}`])]);
  return b;
}

function judgementCard(items: Dash[]): HTMLElement {
  const card = el('div', { class: 'card' }, [el('h3', {}, [L('収支判定', 'Coverage judgement')])]);
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${L('月','Month')}</th><th>${L('夫','Husband')}</th><th>${L('妻','Wife')}</th><th>${L('口座ショート','Cash shortfall')}</th></tr></thead>`;
  const tb = el('tbody');
  for (const d of items.slice().reverse()) {
    const hOk = (d.settlement?.husband_salary_balance || 0) >= 0;
    const wOk = (d.settlement?.wife_salary_balance || 0) >= 0;
    const short = (d.cashflow?.forecasts?.toshi?.shortfall || 0) + (d.cashflow?.forecasts?.lisa?.shortfall || 0) + (d.cashflow?.forecasts?.shared?.shortfall || 0);
    tb.appendChild(el('tr', {}, [
      el('td', {}, [d.month]),
      el('td', {}, [hOk ? L('収入内', 'Covered') : L('超過', 'Over')]),
      el('td', {}, [wOk ? L('収入内', 'Covered') : L('超過', 'Over')]),
      el('td', {}, [short > 0 ? formatYen(short) : 'OK']),
    ]));
  }
  table.appendChild(tb); card.appendChild(table); return card;
}

function cashflowCard(dash: Dash): HTMLElement {
  const f = dash.cashflow?.forecasts || {};
  const card = el('div', { class: 'card' }, [el('h3', {}, [L('口座ショート監視', 'Cashflow shortfall monitor')])]);
  card.appendChild(el('div', { class: 'dashboard-metrics' }, [
    metric(L('夫口座不足', 'Husband shortfall'), -(f.toshi?.shortfall || 0), f.toshi?.shortfall ? `${f.toshi.lowest_date} ${L('までに必要', 'needed by')}` : L('ショート見込みなし', 'No shortfall')),
    metric(L('妻口座不足', 'Wife shortfall'), -(f.lisa?.shortfall || 0), f.lisa?.shortfall ? `${f.lisa.lowest_date} ${L('までに必要', 'needed by')}` : L('ショート見込みなし', 'No shortfall')),
    metric(L('共同口座不足', 'Shared shortfall'), -(f.shared?.shortfall || 0), f.shared?.shortfall ? `${f.shared.lowest_date} ${L('までに必要', 'needed by')}` : L('ショート見込みなし', 'No shortfall')),
  ]));
  const timeline = f.toshi?.timeline || [];
  if (timeline.length > 0) {
    card.appendChild(el('h4', {}, [L('夫口座タイムライン', 'Husband timeline')]));
    card.appendChild(timelineTable(timeline.slice(0, 20)));
  }
  return card;
}
function timelineTable(rows: any[]): HTMLElement {
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${L('日付','Date')}</th><th>${L('内容','Label')}</th><th class="num">${L('増減','Delta')}</th><th class="num">${L('残高見込','Balance')}</th></tr></thead>`;
  const tb = el('tbody');
  for (const r of rows) tb.appendChild(el('tr', {}, [el('td', {}, [r.date]), el('td', {}, [r.label]), el('td', { class: 'num' }, [formatYen(r.amount)]), el('td', { class: 'num' }, [formatYen(r.balance_after)])]));
  table.appendChild(tb); wrap.appendChild(table); return wrap;
}

function topExpensesCard(dash: Dash): HTMLElement {
  const rows = [...(dash.evidence || [])].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 12);
  const card = el('div', { class: 'card' }, [el('h3', {}, [L('支出上位', 'Top expenses')])]);
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${t('common.date')}</th><th>${t('common.description')}</th><th>${t('common.payer')}</th><th class="num">${t('common.amount')}</th></tr></thead>`;
  const tb = el('tbody');
  for (const r of rows) tb.appendChild(el('tr', {}, [el('td', {}, [r.date]), el('td', {}, [r.description || '']), el('td', {}, [t(`payer.${r.burden_owner || r.payer}` as any)]), el('td', { class: 'num' }, [formatYen(r.amount)])]));
  table.appendChild(tb); wrap.appendChild(table); card.appendChild(wrap); return card;
}
