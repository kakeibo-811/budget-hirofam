import { el, clear, api, formatYen } from '../utils';
import { t } from '../i18n';
import { L, ownerText, burdenOptions, payerOptions, frequencyOptions, frequencyText } from '../i18n/ui';

function opt(value: string, label: string, selected?: boolean) { return el('option', { value, selected: selected ? 'selected' : null }, [label]); }
function input(label: string, type = 'text'): HTMLLabelElement {
  const i = el('input', { type, placeholder: label }) as HTMLInputElement;
  return el('label', { class: 'field' }, [el('span', {}, [label]), i]) as HTMLLabelElement;
}
function getInput(label: HTMLElement): HTMLInputElement { return label.querySelector('input') as HTMLInputElement; }
function selectField(label: string, options: [string, string][], value = ''): HTMLLabelElement {
  const s = el('select') as HTMLSelectElement;
  for (const [v, l] of options) s.appendChild(opt(v, l, v === value));
  return el('label', { class: 'field' }, [el('span', {}, [label]), s]) as HTMLLabelElement;
}
function getSelect(label: HTMLElement): HTMLSelectElement { return label.querySelector('select') as HTMLSelectElement; }

export function renderAccounts(root: HTMLElement) {
  clear(root);
  const content = el('div', {});
  root.appendChild(el('h2', {}, [t('tab.accounts')]));
  root.appendChild(el('div', { class: 'banner banner-info' }, [
    L('カード支払い以外の定期・不定期支払いを登録し、いつ口座残高がいくら必要かを分析タブ/概要で追跡します。', 'Register recurring and irregular non-card payments and track how much cash each account needs by date in Analytics and Dashboard.'),
  ]));
  root.appendChild(content);
  load(content);
}

async function load(content: HTMLElement) {
  clear(content);
  content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
  try {
    const [accounts, payments] = await Promise.all([
      api.get<{ items: any[] }>('/api/accounts'),
      api.get<{ items: any[] }>('/api/scheduled-payments'),
    ]);
    clear(content);

    const accCard = el('div', { class: 'card' }, [el('h3', {}, [L('口座残高', 'Account Balances')])]);
    const tbl = el('div', { class: 'table-wrap' });
    const tab = el('table', { class: 'data compact-table' });
    tab.innerHTML = `<thead><tr><th>${L('名前','Name')}</th><th>${t('common.owner')}</th><th>${L('種別','Type')}</th><th class="num">${L('最新残高','Latest balance')}</th><th>${t('common.note')}</th></tr></thead>`;
    const tbody = el('tbody', {});
    if (accounts.items.length === 0) tbody.appendChild(el('tr', {}, [el('td', { colspan: '5', class: 'muted' }, [t('common.no_data')])]));
    for (const a of accounts.items) {
      tbody.appendChild(el('tr', {}, [
        el('td', {}, [a.name]),
        el('td', {}, [ownerText(a.owner)]),
        el('td', {}, [a.kind || '—']),
        el('td', { class: 'num' }, [a.balance == null ? '—' : formatYen(a.balance)]),
        el('td', {}, [a.note ?? '']),
      ]));
    }
    tab.appendChild(tbody);
    tbl.appendChild(tab);
    accCard.appendChild(tbl);
    content.appendChild(accCard);

    const form = scheduledForm(accounts.items, () => load(content));
    const payCard = el('div', { class: 'card' }, [
      el('h3', {}, [L('カード以外の支払予定', 'Non-card Payment Schedule')]),
      el('div', { class: 'muted' }, [L('家賃、定期送金、PayPal、保険、税金、突発支払いなど。実際に払う人と最終負担者を分けて登録します。', 'Rent, transfers, PayPal, insurance, taxes, and one-off payments. Register both the actual payer and final burden owner.')]),
      form,
      scheduledTable(payments.items, () => load(content)),
    ]);
    content.appendChild(payCard);
  } catch (e: any) {
    clear(content);
    content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー', 'Error')}: ${e.message}`]));
  }
}

function accountOptions(accounts: any[]): [string, string][] {
  return [['', L('口座未指定', 'No account selected')], ...accounts.map((a) => [String(a.id), a.name] as [string, string])];
}

function scheduledForm(accounts: any[], refresh: () => void): HTMLElement {
  const box = el('details', { class: 'collapse' }, [el('summary', {}, [L('支払予定を追加', 'Add scheduled payment')])]);
  const name = input(L('名称', 'Name'));
  const amount = input(L('金額', 'Amount'), 'number');
  const frequency = selectField(L('頻度', 'Frequency'), frequencyOptions(), 'monthly');
  const dueDay = input(L('支払日/日', 'Payment day'), 'number');
  const dueDate = input(L('1回のみの日付', 'One-time date'), 'date');
  const paidBy = selectField(L('実際に払う人', 'Actual payer'), payerOptions(), 'toshi');
  const burden = selectField(L('最終負担', 'Final burden'), burdenOptions(), 'shared');
  const account = selectField(L('支払口座', 'Payment account'), accountOptions(accounts));
  const note = input(t('common.note'));
  const btn = el('button', { class: 'primary', onClick: async () => {
    if (!confirm(L('この支払予定を追加しますか？', 'Add this scheduled payment?'))) return;
    await api.post('/api/scheduled-payments', {
      name: getInput(name).value,
      amount: Number(getInput(amount).value || 0),
      frequency: getSelect(frequency).value,
      due_day: Number(getInput(dueDay).value || 0) || null,
      due_date: getInput(dueDate).value || null,
      paid_by: getSelect(paidBy).value,
      burden_owner: getSelect(burden).value,
      split: getSelect(burden).value === 'shared' ? 1 : 0,
      account_id: getSelect(account).value || null,
      note: getInput(note).value,
    });
    refresh();
  }}, [t('common.add')]);
  box.appendChild(el('div', { class: 'form-grid compact-form' }, [name, amount, frequency, dueDay, dueDate, paidBy, burden, account, note, btn]));
  return box;
}

function scheduledTable(items: any[], refresh: () => void): HTMLElement {
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr><th>${L('名称','Name')}</th><th class="num">${t('common.amount')}</th><th>${L('頻度','Frequency')}</th><th>${L('支払時点','Due timing')}</th><th>${L('実支払','Actual payer')}</th><th>${L('負担','Burden')}</th><th>${t('common.actions')}</th></tr></thead>`;
  const tbody = el('tbody');
  if (items.length === 0) tbody.appendChild(el('tr', {}, [el('td', { colspan: '7', class: 'muted' }, [t('common.no_data')])]));
  for (const p of items) {
    const due = p.frequency === 'monthly' ? L(`毎月${p.due_day || '?'}日`, `Monthly day ${p.due_day || '?'}`) : (p.due_date || L(`${p.due_month || '?'}月${p.due_day || '?'}日`, `${p.due_month || '?'}-${p.due_day || '?'}`));
    tbody.appendChild(el('tr', {}, [
      el('td', {}, [p.name]),
      el('td', { class: 'num' }, [formatYen(p.amount)]),
      el('td', {}, [frequencyText(p.frequency)]),
      el('td', {}, [due]),
      el('td', {}, [ownerText(p.paid_by)]),
      el('td', {}, [ownerText(p.burden_owner)]),
      el('td', {}, [el('button', { class: 'ghost danger', onClick: async () => { if (confirm(L('削除しますか？', 'Delete this item?'))) { await api.delete(`/api/scheduled-payments/${p.id}`); refresh(); } } }, [t('common.delete')])]),
    ]));
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  return wrap;
}
