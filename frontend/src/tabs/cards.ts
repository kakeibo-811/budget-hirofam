import { el, clear, api } from '../utils';
import { t } from '../i18n';
import { L, ownerText } from '../i18n/ui';

function ownerLabel(v: string) { return ownerText(v); }

export function renderCards(root: HTMLElement) {
  clear(root);
  const content = el('div', {});
  root.appendChild(el('h2', {}, [t('tab.cards')]));
  root.appendChild(el('div', { class: 'banner banner-info' }, [
    L('カードごとの種類・締め日・支払日・既定の実支払者/負担者を管理します。CSVの請求月や家計月の判定に使います。', 'Manage each card type, closing day, payment day, default actual payer, and default burden owner. These rules are used for CSV billing-month and budget-cycle decisions.'),
  ]));
  root.appendChild(content);
  load(content);
}

async function load(content: HTMLElement) {
  clear(content);
  content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
  try {
    const data = await api.get<{ items: any[] }>('/api/cards');
    clear(content);
    const add = cardForm(null, () => load(content));
    content.appendChild(add);
    const grid = el('div', { class: 'card-list-grid' });
    for (const c of data.items) grid.appendChild(cardBox(c, () => load(content)));
    content.appendChild(grid);
  } catch (e: any) {
    clear(content);
    content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー', 'Error')}: ${e.message}`]));
  }
}

function cardBox(c: any, refresh: () => void): HTMLElement {
  const details = el('details', { class: 'credit-card-box' }, [
    el('summary', {}, [
      el('div', { class: 'card-logo' }, ['💳']),
      el('div', { class: 'card-title' }, [el('strong', {}, [c.name]), el('span', { class: 'muted' }, [`${kindLabel(c.card_kind)} ・ ${closeLabel(c.close_day)} ・ ${payLabel(c.pay_day)} ・ ${ownerLabel(c.owner)}`])]),
      el('span', { class: 'chevron' }, ['›']),
    ]),
  ]);
  details.appendChild(cardForm(c, refresh));
  return details;
}

function cardForm(c: any | null, refresh: () => void): HTMLElement {
  const box = el('div', { class: 'card-edit-form' });
  if (!c) box.appendChild(el('h3', {}, [L('カードを追加', 'Add card')]));
  const name = input(t('common.card'), 'text', c?.name || '');
  const kind = select([['credit', L('クレジット', 'Credit')], ['debit', L('デビット', 'Debit')], ['paypal', 'PayPal'], ['manual', L('その他', 'Other')]], c?.card_kind || 'credit');
  const owner = select([['toshi', L('夫', 'Husband')], ['lisa', L('妻', 'Wife')], ['shared', L('両方/共同', 'Both / Shared')]], c?.owner || 'toshi');
  const close = input(t('common.close_day'), 'number', c?.close_day || 31);
  const pay = input(t('common.pay_day'), 'number', c?.pay_day || 27);
  const paidBy = select([['toshi', L('実支払: 夫', 'Actual payer: Husband')], ['lisa', L('実支払: 妻', 'Actual payer: Wife')], ['shared', L('実支払: 共同', 'Actual payer: Shared')]], c?.default_paid_by || 'toshi');
  const burden = select([['shared', L('既定負担: 折半', 'Default burden: Split')], ['lisa', L('既定負担: 妻', 'Default burden: Wife')], ['toshi', L('既定負担: 夫', 'Default burden: Husband')], ['other', L('対象外', 'Excluded')]], c?.default_burden_owner || 'shared');
  const note = input(t('common.note'), 'text', c?.note || '');
  const save = el('button', { class: 'primary', onClick: async () => {
    const payload = {
      name: (name.querySelector('input') as HTMLInputElement).value,
      card_kind: (kind as HTMLSelectElement).value,
      owner: (owner as HTMLSelectElement).value,
      close_day: Number((close.querySelector('input') as HTMLInputElement).value || 31),
      pay_day: Number((pay.querySelector('input') as HTMLInputElement).value || 27),
      default_paid_by: (paidBy as HTMLSelectElement).value,
      default_burden_owner: (burden as HTMLSelectElement).value,
      note: (note.querySelector('input') as HTMLInputElement).value,
    };
    if (c) await api.patch(`/api/cards/${c.id}`, payload); else await api.post('/api/cards', payload);
    refresh();
  }}, [c ? t('common.save') : t('common.add')]);
  const children = [name, kind, owner, close, pay, paidBy, burden, note, save];
  if (c) children.push(el('button', { class: 'ghost danger', onClick: async () => { if (confirm(L('このカードをアーカイブしますか？', 'Archive this card?'))) { await api.delete(`/api/cards/${c.id}`); refresh(); } } }, [t('common.delete')]));
  box.appendChild(el('div', { class: 'form-grid compact-form' }, children));
  return box;
}

function input(label: string, type = 'text', value: any = ''): HTMLElement {
  const i = el('input', { type, placeholder: label, value: String(value ?? '') });
  return el('label', { class: 'field' }, [el('span', {}, [label]), i]);
}
function select(options: string[][], value = ''): HTMLElement {
  const s = el('select');
  for (const [v, label] of options) s.appendChild(el('option', { value: v, selected: v === value ? 'selected' : null }, [label]));
  return s;
}
function closeLabel(day: number) { return Number(day) >= 28 ? L('月末締め', 'End-of-month closing') : L(`${day}日締め`, `Closes on day ${day}`); }
function payLabel(day: number) { return L(`${day}日支払`, `Pays on day ${day}`); }
function kindLabel(kind: string) { return ({ credit: L('カード', 'Card'), debit: L('デビット', 'Debit'), paypal: 'PayPal', manual: L('その他', 'Other') } as any)[kind] || L('カード', 'Card'); }
