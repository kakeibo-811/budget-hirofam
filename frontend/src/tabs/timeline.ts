import { el, clear, api, formatYen, shiftMonth, thisMonth } from '../utils';
import { getLocale } from '../i18n';

type OwnerKey = 'toshi' | 'lisa' | 'shared';

function L(ja: string, en: string): string {
  return getLocale() === 'en' ? en : ja;
}

function ownerLabel(owner: OwnerKey): string {
  if (owner === 'toshi') return L('\u592b\u53e3\u5ea7', 'Husband accounts');
  if (owner === 'lisa') return L('\u59bb\u53e3\u5ea7', 'Wife accounts');
  return L('\u5171\u901a\u53e3\u5ea7', 'Shared accounts');
}

function ownerHelp(owner: OwnerKey): string {
  if (owner === 'toshi') return L('\u7d66\u4e0e\u5165\u91d1\u3084\u300c\u652f\u6255\u8005:\u592b\u300d\u306e\u4e88\u5b9a\u3092\u53cd\u6620\u3057\u307e\u3059\u3002', 'Includes salary deposits and payments marked as paid by the husband.');
  if (owner === 'lisa') return L('\u7d66\u4e0e\u5165\u91d1\u3084\u300c\u652f\u6255\u8005:\u59bb\u300d\u306e\u4e88\u5b9a\u3092\u53cd\u6620\u3057\u307e\u3059\u3002', 'Includes salary deposits and payments marked as paid by the wife.');
  return L('\u4f4f\u5b85\u30ed\u30fc\u30f3\u3001\u4fee\u7e55\u7a4d\u7acb\u91d1\u3001\u4fdd\u967a\u3001\u56fa\u5b9a\u8cc7\u7523\u7a0e\u306a\u3069\u3001\u592b\u5a66\u3067\u5171\u540c\u7ba1\u7406\u3059\u308b\u652f\u6255\u3044\u3092\u78ba\u8a8d\u3057\u307e\u3059\u3002', 'Tracks shared payments such as mortgage, repair reserve, insurance, and property tax.');
}

export function renderTimeline(root: HTMLElement) {
  clear(root);
  const now = thisMonth();
  const from = el('input', { type: 'month', value: now }) as HTMLInputElement;
  const to = el('input', { type: 'month', value: shiftMonth(now, 5) }) as HTMLInputElement;
  const content = el('div');
  const load = async () => {
    clear(content);
    content.appendChild(el('div', { class: 'muted' }, [L('\u8aad\u307f\u8fbc\u307f\u4e2d...', 'Loading...')]));
    try {
      const data = await api.get<any>(`/api/analytics/cashflow-range?from=${from.value}&to=${to.value}`);
      clear(content);
      content.appendChild(accountBalances(data, load));
      content.appendChild(summary(data));
      content.appendChild(timelineGrid(data));
    } catch (e: any) {
      clear(content);
      content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('\u30a8\u30e9\u30fc', 'Error')}: ${e.message}`]));
    }
  };
  root.appendChild(el('section', { class: 'card soft-card' }, [
    el('h3', {}, [L('\u53e3\u5ea7\u6b8b\u9ad8\u30bf\u30a4\u30e0\u30e9\u30a4\u30f3', 'Account balance timeline')]),
    el('p', { class: 'muted' }, [L('\u4efb\u610f\u671f\u9593\u306e\u5165\u51fa\u91d1\u4e88\u5b9a\u3092\u3064\u306a\u3052\u3066\u3001\u592b\u30fb\u59bb\u30fb\u5171\u901a\u53e3\u5ea7\u5225\u306e\u6b8b\u9ad8\u63a8\u79fb\u3068\u4e0d\u8db3\u65e5\u3092\u78ba\u8a8d\u3057\u307e\u3059\u3002', 'Track projected balances and shortfall dates by husband, wife, and shared accounts for any period.')]),
    el('div', { class: 'row-flex' }, [
      el('label', { class: 'field-inline' }, [L('\u958b\u59cb ', 'From '), from]),
      el('label', { class: 'field-inline' }, [L('\u7d42\u4e86 ', 'To '), to]),
      el('button', { class: 'btn', type: 'button', onClick: load }, [L('\u8868\u793a', 'Show')]),
    ]),
  ]));
  root.appendChild(content);
  load();
}

function summary(data: any): HTMLElement {
  const f = data.forecasts || {};
  return el('div', { class: 'analytics-metrics' }, (['toshi', 'lisa', 'shared'] as OwnerKey[]).map((owner) => {
    const row = f[owner] || {};
    const shortfall = Number(row.shortfall || 0);
    return el('div', { class: `metric ${shortfall ? 'metric-warning' : 'metric-ok'}` }, [
      el('div', { class: 'metric-label' }, [ownerLabel(owner)]),
      el('div', { class: 'metric-value' }, [formatYen(row.ending_balance || 0)]),
      el('div', { class: 'muted' }, [shortfall ? `${L('\u4e0d\u8db3', 'Shortfall')} ${formatYen(shortfall)} / ${row.lowest_date || ''}` : L('\u4e0d\u8db3\u898b\u8fbc\u307f\u306a\u3057', 'No projected shortfall')]),
    ]);
  }));
}

function accountBalances(data: any, refresh: () => void): HTMLElement {
  const rows = data.account_balances || [];
  const card = el('section', { class: 'card soft-card' }, [
    el('h3', {}, [L('\u73fe\u5728\u306e\u53e3\u5ea7\u6b8b\u9ad8', 'Current account balances')]),
    el('p', { class: 'muted' }, [L('\u3053\u3053\u306e\u6b8b\u9ad8\u3092\u8d77\u70b9\u306b\u3001\u4e0b\u306e\u30bf\u30a4\u30e0\u30e9\u30a4\u30f3\u3067\u5c06\u6765\u306e\u6b8b\u9ad8\u3092\u8a08\u7b97\u3057\u307e\u3059\u3002\u5b9f\u969b\u306e\u53e3\u5ea7\u6b8b\u9ad8\u306b\u5408\u308f\u305b\u3066\u624b\u52d5\u4fee\u6b63\u3067\u304d\u307e\u3059\u3002', 'These balances are the starting point for the timeline below. Adjust them manually to match actual account balances.')]),
  ]);
  const groups = el('div', { class: 'overview-main-grid' });
  for (const owner of ['toshi', 'lisa', 'shared'] as OwnerKey[]) {
    groups.appendChild(ownerBalanceCard(owner, rows.filter((row: any) => row.owner === owner), refresh));
  }
  card.appendChild(groups);
  return card;
}

function ownerBalanceCard(owner: OwnerKey, accounts: any[], refresh: () => void): HTMLElement {
  const total = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const box = el('details', { class: 'card soft-card', open: 'open' }, [
    el('summary', {}, [`${ownerLabel(owner)} ${formatYen(total)}`]),
    el('p', { class: 'muted' }, [ownerHelp(owner)]),
  ]);
  if (!accounts.length) {
    box.appendChild(el('div', { class: 'muted' }, [L('\u53e3\u5ea7\u304c\u3042\u308a\u307e\u305b\u3093', 'No accounts')]));
    return box;
  }
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${L('\u53e3\u5ea7', 'Account')}</th><th class="num">${L('\u73fe\u5728\u6b8b\u9ad8', 'Current balance')}</th><th>${L('\u57fa\u6e96\u65e5', 'As of')}</th><th>${L('\u6b8b\u9ad8\u4fee\u6b63', 'Adjust balance')}</th></tr></thead>`;
  const tb = el('tbody');
  for (const account of accounts) {
    tb.appendChild(accountBalanceRow(account, refresh));
  }
  table.appendChild(tb);
  wrap.appendChild(table);
  box.appendChild(wrap);
  return box;
}

function accountBalanceRow(account: any, refresh: () => void): HTMLElement {
  const date = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) }) as HTMLInputElement;
  const amount = el('input', { type: 'number', inputmode: 'numeric', value: String(account.balance ?? 0), class: 'num' }) as HTMLInputElement;
  const note = el('input', { type: 'text', placeholder: L('\u4efb\u610f\u30e1\u30e2', 'Optional note') }) as HTMLInputElement;
  const status = el('div', { class: 'muted' });
  const save = el('button', {
    class: 'btn btn-small',
    type: 'button',
    onClick: async () => {
      status.textContent = L('\u4fdd\u5b58\u4e2d...', 'Saving...');
      await api.post<any>(`/api/accounts/${account.id}/adjust`, {
        as_of_date: date.value,
        balance: Number(amount.value || 0),
        note: note.value || null,
      });
      status.textContent = L('\u4fdd\u5b58\u3057\u307e\u3057\u305f', 'Saved');
      await refresh();
    },
  }, [L('\u4fdd\u5b58', 'Save')]);
  return el('tr', {}, [
    el('td', {}, [account.name || `#${account.id}`]),
    el('td', { class: 'num' }, [account.balance == null ? '-' : formatYen(account.balance)]),
    el('td', {}, [account.as_of_date || '-']),
    el('td', {}, [el('div', { class: 'row-flex' }, [date, amount, note, save]), status]),
  ]);
}

function timelineGrid(data: any): HTMLElement {
  const f = data.forecasts || {};
  return el('div', { class: 'overview-main-grid' }, (['toshi', 'lisa', 'shared'] as OwnerKey[]).map((owner) => timelineCard(owner, f[owner]?.timeline || [])));
}

function timelineCard(owner: OwnerKey, rows: any[]): HTMLElement {
  const card = el('details', { class: 'card soft-card', open: owner === 'toshi' ? 'open' : null }, [
    el('summary', {}, [ownerLabel(owner)]),
  ]);
  card.appendChild(el('p', { class: 'muted' }, [ownerHelp(owner)]));
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${L('\u65e5\u4ed8', 'Date')}</th><th>${L('\u5185\u5bb9', 'Label')}</th><th class="num">${L('\u5897\u6e1b', 'Delta')}</th><th class="num">${L('\u6b8b\u9ad8', 'Balance')}</th></tr></thead>`;
  const tb = el('tbody');
  if (!rows.length) tb.appendChild(el('tr', {}, [el('td', { colspan: '4', class: 'muted' }, [L('\u4e88\u5b9a\u304c\u3042\u308a\u307e\u305b\u3093', 'No events')])]));
  for (const r of rows) {
    tb.appendChild(el('tr', {}, [
      el('td', { class: 'mono' }, [r.date || '']),
      el('td', {}, [r.label || r.source || '']),
      el('td', { class: 'num' }, [formatYen(r.amount || 0)]),
      el('td', { class: 'num' }, [formatYen(r.balance_after || 0)]),
    ]));
  }
  table.appendChild(tb);
  wrap.appendChild(table);
  card.appendChild(wrap);
  return card;
}
