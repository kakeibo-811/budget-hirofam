import { el, clear, api, formatYen } from '../utils';
import { t } from '../i18n';
import { L, ownerText } from '../i18n/ui';

export function renderAccounts(root: HTMLElement) {
  clear(root);
  const content = el('div', {});
  root.appendChild(el('h2', {}, [t('tab.accounts')]));
  root.appendChild(el('div', { class: 'banner banner-info' }, [
    L(
      '口座タブは残高確認に絞りました。カード以外の支払い予定は固定費タブで管理し、概要・分析・精算へ連動します。',
      'Accounts are for balance review. Non-card payment schedules are managed in Fixed Costs and flow into Overview, Analytics, and Settlement.',
    ),
  ]));
  root.appendChild(content);
  load(content);
}

async function load(content: HTMLElement) {
  clear(content);
  content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
  try {
    const accounts = await api.get<{ items: any[] }>('/api/accounts');
    clear(content);
    const accCard = el('div', { class: 'card' }, [
      el('h3', {}, [L('口座残高', 'Account Balances')]),
      el('p', { class: 'muted' }, [
        L('ここでは口座そのものを確認します。今後の引き落とし予定は固定費タブに集約されています。', 'Review accounts here. Future debit schedules are centralized in Fixed Costs.'),
      ]),
    ]);
    const tbl = el('div', { class: 'table-wrap' });
    const tab = el('table', { class: 'data compact-table' });
    tab.innerHTML = `<thead><tr><th>${L('名前','Name')}</th><th>${t('common.owner')}</th><th>${L('種類','Type')}</th><th class="num">${L('最新残高','Latest balance')}</th><th>${t('common.note')}</th></tr></thead>`;
    const tbody = el('tbody', {});
    if (accounts.items.length === 0) tbody.appendChild(el('tr', {}, [el('td', { colspan: '5', class: 'muted' }, [t('common.no_data')])]));
    for (const a of accounts.items) {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, [a.name]),
        el('td', {}, [ownerText(a.owner)]),
        el('td', {}, [a.kind || '-']),
        el('td', { class: 'num' }, [a.balance == null ? '-' : formatYen(a.balance)]),
        el('td', {}, [a.note ?? '']),
      ]));
    }
    tab.appendChild(tbody);
    tbl.appendChild(tab);
    accCard.appendChild(tbl);
    content.appendChild(accCard);
  } catch (e: any) {
    clear(content);
    content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー', 'Error')}: ${e.message}`]));
  }
}
