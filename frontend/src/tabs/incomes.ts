import { el, clear, api, formatYen } from '../utils';
import { t } from '../i18n';
import { L } from '../i18n/ui';
import { MonthPicker } from '../components/month-picker';

function selectOwner(value = 'toshi'): HTMLSelectElement {
  const s = el('select') as HTMLSelectElement;
  s.appendChild(el('option', { value: 'toshi' }, [L('夫', 'Husband')]));
  s.appendChild(el('option', { value: 'lisa' }, [L('妻', 'Wife')]));
  s.value = value;
  return s;
}

function selectKind(value = 'salary'): HTMLSelectElement {
  const s = el('select') as HTMLSelectElement;
  [
    ['salary', L('給与', 'Salary')],
    ['side', L('副業', 'Side income')],
    ['bonus', L('賞与', 'Bonus')],
    ['temporary', L('臨時収入', 'Temporary')],
    ['other', L('その他収入', 'Other income')],
  ].forEach(([v, label]) => s.appendChild(el('option', { value: v }, [label])));
  s.value = value;
  return s;
}

function field(label: string, node: HTMLElement) {
  return el('label', { class: 'field' }, [el('span', {}, [label]), node]);
}

function metric(label: string, amount: number): HTMLElement {
  return el('div', { class: 'metric soft-metric' }, [
    el('div', { class: 'metric-label' }, [label]),
    el('div', { class: 'metric-value' }, [formatYen(amount)]),
  ]);
}

function cleanDesc(v: any): string {
  return String(v || '').replace(/^(side|temporary):\s*/i, '');
}

function inferKind(row: any): string {
  const d = String(row.description || '').toLowerCase();
  if (d.startsWith('side:')) return 'side';
  if (d.startsWith('temporary:')) return 'temporary';
  return row.kind || 'salary';
}

function collect(row: HTMLElement): any {
  const payload: any = {};
  const inputs = row.querySelectorAll('input,select') as NodeListOf<HTMLInputElement | HTMLSelectElement>;
  inputs.forEach((x) => payload[x.name] = x.type === 'number' ? Number(x.value || 0) : x.value);
  return payload;
}

export function renderIncomes(root: HTMLElement) {
  clear(root);
  const picker = new MonthPicker();
  const content = el('div', {});
  root.appendChild(picker.element());
  root.appendChild(content);

  async function load(month: string) {
    clear(content);
    content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
    try {
      const [list, recurring] = await Promise.all([
        api.get<{ items: any[] }>(`/api/incomes?month=${month}`),
        api.get<{ items: any[] }>('/api/incomes/recurring'),
      ]);
      clear(content);

      const feedback = el('div', { class: 'banner banner-error', style: 'display:none' });
      const showError = (e: any) => {
        feedback.textContent = `${L('保存できませんでした', 'Could not save')}: ${e?.message || e}`;
        feedback.style.display = 'block';
      };
      const clearError = () => { feedback.textContent = ''; feedback.style.display = 'none'; };

      content.appendChild(el('div', { class: 'banner banner-info' }, [
        L('💰 収入は保存すると概要・分析・口座不足見込みへ連動します。毎月入る8万円などは「🔁 継続収入」で夫・その他収入として登録できます。', 'Saved income flows into Overview, Analytics, and cashflow forecasts. Use recurring income for monthly other income.'),
      ]));
      content.appendChild(feedback);

      content.appendChild(addIncomeCard(month, clearError, showError, () => load(picker.get())));
      content.appendChild(addRecurringCard(clearError, showError, () => load(picker.get())));

      const recurringTotal = recurring.items.reduce((a, x) => a + Number(x.amount || 0), 0);
      const oneTimeTotal = list.items.reduce((a, x) => a + Number(x.amount || 0), 0);
      const recurringToshi = recurring.items.filter((x) => x.owner === 'toshi').reduce((a, x) => a + Number(x.amount || 0), 0);
      const recurringLisa = recurring.items.filter((x) => x.owner === 'lisa').reduce((a, x) => a + Number(x.amount || 0), 0);
      const total = oneTimeTotal + recurringTotal;
      const toshi = list.items.filter((x) => x.owner === 'toshi').reduce((a, x) => a + Number(x.amount || 0), 0) + recurringToshi;
      const lisa = list.items.filter((x) => x.owner === 'lisa').reduce((a, x) => a + Number(x.amount || 0), 0) + recurringLisa;
      content.appendChild(el('div', { class: 'card-grid' }, [
        metric(L('📊 当月収入合計', '📊 Monthly income'), total),
        metric(L('👤 夫収入', '👤 Husband income'), toshi),
        metric(L('👤 妻収入', '👤 Wife income'), lisa),
        metric(L('🔁 継続収入/月', '🔁 Recurring / month'), recurringTotal),
      ]));

      content.appendChild(incomeTable(month, list.items, clearError, showError, () => load(month)));
      content.appendChild(recurringTable(recurring.items, clearError, showError, () => load(month)));
    } catch (e: any) {
      clear(content);
      content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー', 'Error')}: ${e.message}`]));
    }
  }

  picker.onChange(load);
  load(picker.get());
}

function addIncomeCard(month: string, clearError: () => void, showError: (e: any) => void, refresh: () => void): HTMLElement {
  const card = el('details', { class: 'card soft-card', open: true }, [el('summary', {}, [L('💰 収入を追加', '💰 Add income')])]);
  const date = el('input', { type: 'date', name: 'date', autocomplete: 'off', value: `${month}-25` }) as HTMLInputElement;
  const amount = el('input', { type: 'number', name: 'amount', inputmode: 'numeric', autocomplete: 'off', placeholder: '500000' }) as HTMLInputElement;
  const owner = selectOwner('lisa');
  const kind = selectKind('salary');
  const desc = el('input', { name: 'description', autocomplete: 'off', placeholder: L('給与、副業、臨時収入など', 'Salary, side income, temporary income') }) as HTMLInputElement;
  const note = el('input', { name: 'note', autocomplete: 'off', placeholder: L('メモ', 'Note') }) as HTMLInputElement;
  card.appendChild(el('div', { class: 'form-grid' }, [
    field(t('common.date'), date),
    field(t('common.amount'), amount),
    field(t('common.owner'), owner),
    field(L('種別', 'Type'), kind),
    field(t('common.description'), desc),
    field(t('common.note'), note),
  ]));
  card.appendChild(el('button', { class: 'btn', type: 'button', onClick: async () => {
    try {
      clearError();
      await api.post('/api/incomes', { date: date.value, amount: Number(amount.value || 0), owner: owner.value, kind: kind.value, description: desc.value, note: note.value });
      await refresh();
    } catch (e) { showError(e); }
  } }, [L('保存', 'Save')]));
  return card;
}

function addRecurringCard(clearError: () => void, showError: (e: any) => void, refresh: () => void): HTMLElement {
  const card = el('details', { class: 'card soft-card', open: false }, [el('summary', {}, [L('🔁 継続収入を追加', '🔁 Add recurring income')])]);
  const name = el('input', { name: 'name', autocomplete: 'off', placeholder: L('例: その他収入 80,000円', 'e.g. Other income 80,000') }) as HTMLInputElement;
  const owner = selectOwner('toshi');
  const amount = el('input', { type: 'number', name: 'amount', autocomplete: 'off', placeholder: '80000' }) as HTMLInputElement;
  const payDay = el('input', { type: 'number', name: 'pay_day', autocomplete: 'off', min: '1', max: '31', value: '25' }) as HTMLInputElement;
  const kind = selectKind('other');
  const note = el('input', { name: 'note', autocomplete: 'off', placeholder: L('メモ', 'Note') }) as HTMLInputElement;
  card.appendChild(el('div', { class: 'row-flex', style: 'margin:8px 0' }, [
    el('button', { class: 'ghost', type: 'button', onClick: () => {
      name.value = L('その他収入 80,000円', 'Other income 80,000');
      owner.value = 'toshi';
      amount.value = '80000';
      kind.value = 'other';
    } }, [L('⚡ 夫のその他収入 80,000円を入力', '⚡ Fill Husband other income 80,000')]),
  ]));
  card.appendChild(el('div', { class: 'form-grid' }, [
    field(L('名前', 'Name'), name),
    field(t('common.owner'), owner),
    field(t('common.amount'), amount),
    field(L('入金日', 'Pay day'), payDay),
    field(L('種別', 'Type'), kind),
    field(t('common.note'), note),
  ]));
  card.appendChild(el('button', { class: 'btn', type: 'button', onClick: async () => {
    try {
      clearError();
      await api.post('/api/incomes/recurring', { name: name.value, owner: owner.value, amount: Number(amount.value || 0), pay_day: Number(payDay.value || 1), kind: kind.value, note: note.value });
      await refresh();
    } catch (e) { showError(e); }
  } }, [L('保存', 'Save')]));
  return card;
}

function incomeTable(month: string, rows: any[], clearError: () => void, showError: (e: any) => void, refresh: () => void): HTMLElement {
  const card = el('div', { class: 'card soft-card' }, [el('h3', {}, [`💰 ${month} ${t('tab.incomes')}`])]);
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table soft-table' });
  table.innerHTML = `<thead><tr><th>${t('common.date')}</th><th class="num">${t('common.amount')}</th><th>${t('common.owner')}</th><th>${L('種別','Type')}</th><th>${t('common.description')}</th><th>${t('common.note')}</th><th>${t('common.actions')}</th></tr></thead>`;
  const tbody = el('tbody', {});
  if (!rows.length) tbody.appendChild(el('tr', {}, [el('td', { colspan: '7', class: 'muted' }, [t('common.no_data')])]));
  for (const i of rows) {
    const tr = el('tr', { class: 'editable-row' });
    const date = el('input', { type: 'date', name: 'date', value: i.date }) as HTMLInputElement;
    const amount = el('input', { type: 'number', name: 'amount', value: String(i.amount || 0) }) as HTMLInputElement;
    const owner = selectOwner(i.owner); owner.name = 'owner';
    const kind = selectKind(inferKind(i)); kind.name = 'kind';
    const desc = el('input', { name: 'description', value: cleanDesc(i.description) }) as HTMLInputElement;
    const note = el('input', { name: 'note', value: i.note || '' }) as HTMLInputElement;
    tr.appendChild(el('td', {}, [date]));
    tr.appendChild(el('td', { class: 'num' }, [amount]));
    tr.appendChild(el('td', {}, [owner]));
    tr.appendChild(el('td', {}, [kind]));
    tr.appendChild(el('td', {}, [desc]));
    tr.appendChild(el('td', {}, [note]));
    tr.appendChild(el('td', { class: 'table-actions' }, [
      el('button', { class: 'btn btn-small', type: 'button', onClick: async () => { try { clearError(); await api.patch(`/api/incomes/${i.id}`, collect(tr)); await refresh(); } catch (e) { showError(e); } } }, [L('保存','Save')]),
      el('button', { class: 'btn btn-danger btn-small', type: 'button', onClick: async () => { try { clearError(); if (!confirm(L('この収入を削除しますか？集計から除外されます。', 'Delete this income? It will be excluded from totals.'))) return; await api.delete(`/api/incomes/${i.id}`); await refresh(); } catch (e) { showError(e); } } }, [t('common.delete')]),
    ]));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  card.appendChild(wrap);
  return card;
}

function recurringTable(rows: any[], clearError: () => void, showError: (e: any) => void, refresh: () => void): HTMLElement {
  const card = el('div', { class: 'card soft-card' }, [el('h3', {}, [L('🔁 継続収入', '🔁 Recurring income')])]);
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table soft-table' });
  table.innerHTML = `<thead><tr><th>${L('名前','Name')}</th><th>${t('common.owner')}</th><th class="num">${t('common.amount')}</th><th class="num">${L('入金日','Pay day')}</th><th>${L('種別','Type')}</th><th>${t('common.note')}</th><th>${t('common.actions')}</th></tr></thead>`;
  const tbody = el('tbody', {});
  if (!rows.length) tbody.appendChild(el('tr', {}, [el('td', { colspan: '7', class: 'muted' }, [t('common.no_data')])]));
  for (const r of rows) {
    const tr = el('tr', { class: 'editable-row' });
    const name = el('input', { name: 'name', value: r.name }) as HTMLInputElement;
    const owner = selectOwner(r.owner); owner.name = 'owner';
    const amount = el('input', { type: 'number', name: 'amount', value: String(r.amount || 0) }) as HTMLInputElement;
    const pay = el('input', { type: 'number', name: 'pay_day', min: '1', max: '31', value: String(r.pay_day || 25) }) as HTMLInputElement;
    const kind = selectKind(r.kind || 'salary'); kind.name = 'kind';
    const note = el('input', { name: 'note', value: r.note || '' }) as HTMLInputElement;
    tr.appendChild(el('td', {}, [name]));
    tr.appendChild(el('td', {}, [owner]));
    tr.appendChild(el('td', { class: 'num' }, [amount]));
    tr.appendChild(el('td', { class: 'num' }, [pay]));
    tr.appendChild(el('td', {}, [kind]));
    tr.appendChild(el('td', {}, [note]));
    tr.appendChild(el('td', { class: 'table-actions' }, [
      el('button', { class: 'btn btn-small', type: 'button', onClick: async () => { try { clearError(); await api.patch(`/api/incomes/recurring/${r.id}`, collect(tr)); await refresh(); } catch (e) { showError(e); } } }, [L('保存','Save')]),
      el('button', { class: 'btn btn-danger btn-small', type: 'button', onClick: async () => { try { clearError(); if (!confirm(L('この継続収入を削除しますか？', 'Delete this recurring income?'))) return; await api.delete(`/api/incomes/recurring/${r.id}`); await refresh(); } catch (e) { showError(e); } } }, [t('common.delete')]),
    ]));
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
  card.appendChild(wrap);
  return card;
}
