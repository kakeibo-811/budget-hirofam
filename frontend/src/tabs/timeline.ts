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
  if (owner === 'shared') {
    box.appendChild(el('p', { class: 'muted' }, [L('\u5171\u901a\u53e3\u5ea7\u306e\u6b8b\u9ad8\u306f\u3001\u8cc7\u7523\u30fb\u8ca0\u50b5\u30bf\u30d6\u306e\u4fee\u7e55\u7a4d\u7acb\u91d1\u3068\u540c\u3058\u5024\u3092\u4f7f\u3044\u307e\u3059\u3002', 'Shared account balance uses the same value as the repair reserve in Assets & Liabilities.')]));
  }
  if (!accounts.length) {
    box.appendChild(el('div', { class: 'muted' }, [L('\u53e3\u5ea7\u304c\u3042\u308a\u307e\u305b\u3093', 'No accounts')]));
    return box;
  }
  const list = el('div', { class: 'form-grid' });
  for (const account of accounts) {
    list.appendChild(accountBalanceEditor(account, owner, refresh));
  }
  box.appendChild(list);
  return box;
}

function accountBalanceEditor(account: any, owner: OwnerKey, refresh: () => void): HTMLElement {
  const current = Number(account.balance || 0);
  const date = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) }) as HTMLInputElement;
  const amount = el('input', { type: 'number', inputmode: 'numeric', value: String(current), class: 'wide-input' }) as HTMLInputElement;
  const note = el('input', { type: 'text', placeholder: L('\u4efb\u610f\u30e1\u30e2', 'Optional note') }) as HTMLInputElement;
  const status = el('div', { class: 'muted' });
  const save = el('button', {
    class: 'btn',
    type: 'button',
    onClick: async () => {
      try {
        if (amount.value.trim() === '') {
          status.textContent = L('\u6b8b\u9ad8\u3092\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044', 'Enter a balance');
          return;
        }
        const next = Number(amount.value);
        if (!Number.isFinite(next)) {
          status.textContent = L('\u6b8b\u9ad8\u306f\u6570\u5b57\u3067\u5165\u529b\u3057\u3066\u304f\u3060\u3055\u3044', 'Balance must be a number');
          return;
        }
        status.textContent = L('\u4fdd\u5b58\u4e2d...', 'Saving...');
        if (owner === 'shared' || account.shared_balance_source === 'repair_reserve_projection') {
          await api.post<any>('/api/assets/events', {
            target: 'repair_reserve',
            event_type: 'balance_adjustment',
            event_date: date.value,
            amount: next,
            paid_by: 'shared',
            burden_owner: 'shared',
            source_type: 'timeline_balance_set',
            note: note.value || L('\u30bf\u30a4\u30e0\u30e9\u30a4\u30f3\u304b\u3089\u4fee\u7e55\u7a4d\u7acb\u91d1\u6b8b\u9ad8\u3092\u4fee\u6b63', 'Repair reserve balance set from timeline'),
          });
        } else {
          await api.post<any>(`/api/accounts/${account.id}/adjust`, {
            as_of_date: date.value,
            balance: next,
            note: note.value || null,
          });
        }
        status.textContent = L('\u4fdd\u5b58\u3057\u307e\u3057\u305f', 'Saved');
        await refresh();
      } catch (e: any) {
        status.textContent = `${L('\u4fdd\u5b58\u5931\u6557', 'Save failed')}: ${e.message}`;
      }
    },
  }, [L('\u4fdd\u5b58', 'Save')]);
  return el('div', { class: 'timeline-balance-editor' }, [
    el('h4', {}, [account.name || (owner === 'shared' ? L('\u4fee\u7e55\u7a4d\u7acb\u91d1', 'Repair reserve') : `#${account.id}`)]),
    el('div', { class: 'metric-value' }, [formatYen(current)]),
    el('div', { class: 'muted' }, [`${L('\u57fa\u6e96\u65e5', 'As of')}: ${account.as_of_date || '-'}`]),
    el('label', {}, [L('\u4fee\u6b63\u65e5', 'Adjustment date'), date]),
    el('label', {}, [L('\u4fee\u6b63\u5f8c\u6b8b\u9ad8', 'New balance'), amount]),
    el('label', {}, [L('\u30e1\u30e2', 'Note'), note]),
    save,
    status,
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
  const wrap = el('div', { class: 'table-wrap timeline-table-wrap' });
  const table = el('table', { class: 'data compact-table timeline-table' });
  table.innerHTML = `<thead><tr><th>${L('\u65e5\u4ed8', 'Date')}</th><th>${L('\u5185\u5bb9', 'Label')}</th><th class="num">${L('\u5897\u6e1b', 'Delta')}</th><th class="num">${L('\u6b8b\u9ad8', 'Balance')}</th></tr></thead>`;
  const tb = el('tbody');
  if (!rows.length) tb.appendChild(el('tr', {}, [el('td', { colspan: '4', class: 'muted' }, [L('\u4e88\u5b9a\u304c\u3042\u308a\u307e\u305b\u3093', 'No events')])]));
  for (const r of rows) {
    tb.appendChild(el('tr', {}, [
      el('td', { class: 'mono', 'data-label': L('\u65e5\u4ed8', 'Date') }, [r.date || '']),
      el('td', { 'data-label': L('\u5185\u5bb9', 'Label') }, [r.label || r.source || '']),
      el('td', { class: 'num timeline-delta', 'data-label': L('\u5897\u6e1b', 'Delta') }, [formatYen(r.amount || 0)]),
      el('td', { class: 'num timeline-balance', 'data-label': L('\u6b8b\u9ad8', 'Balance') }, [formatYen(r.balance_after || 0)]),
    ]));
  }
  table.appendChild(tb);
  wrap.appendChild(table);
  card.appendChild(wrap);
  card.appendChild(timelineMobileList(rows));
  return card;
}

function timelineMobileList(rows: any[]): HTMLElement {
  const list = el('div', { class: 'timeline-mobile-list' });
  if (!rows.length) {
    list.appendChild(el('div', { class: 'timeline-mobile-row muted' }, [L('\u4e88\u5b9a\u304c\u3042\u308a\u307e\u305b\u3093', 'No events')]));
    return list;
  }
  for (const r of rows) {
    const amount = Number(r.amount || 0);
    const balance = Number(r.balance_after || 0);
    list.appendChild(el('article', { class: 'timeline-mobile-row' }, [
      el('div', { class: 'timeline-mobile-top' }, [
        el('span', { class: 'mono' }, [r.date || '']),
        el('b', { class: amount < 0 ? 'timeline-negative' : 'timeline-positive' }, [formatYen(amount)]),
      ]),
      el('div', { class: 'timeline-mobile-label' }, [r.label || r.source || '']),
      el('div', { class: 'timeline-mobile-balance' }, [
        el('span', {}, [L('\u5897\u6e1b\u5f8c\u6b8b\u9ad8', 'Balance after delta')]),
        el('strong', {}, [formatYen(balance)]),
      ]),
    ]));
  }
  return list;
}
