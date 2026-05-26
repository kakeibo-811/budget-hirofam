import { el, clear, api, formatYen } from '../utils';
import { t } from '../i18n';
import { L, ownerText } from '../i18n/ui';
import { MonthPicker } from '../components/month-picker';

function selectOwner(value='toshi'): HTMLSelectElement {
  const s = el('select') as HTMLSelectElement;
  s.appendChild(el('option', { value: 'toshi' }, [L('夫','Husband')]));
  s.appendChild(el('option', { value: 'lisa' }, [L('妻','Wife')]));
  s.value = value;
  return s;
}
function selectKind(value='salary'): HTMLSelectElement {
  const s = el('select') as HTMLSelectElement;
  [['salary', L('本業/給与','Main job / Salary')], ['side', L('副業','Side income')], ['bonus', L('賞与','Bonus')], ['temporary', L('突発収入','Temporary')], ['other', L('その他','Other')]].forEach(([v,l]) => s.appendChild(el('option', { value: v }, [l])));
  s.value = value;
  return s;
}
function field(label: string, node: HTMLElement) { return el('label', { class: 'field' }, [el('span', {}, [label]), node]); }
function cleanDesc(v: any): string {
  return String(v || '').replace(/^(side|temporary):\s*/i, '');
}
function inferKind(row: any): string {
  const d = String(row.description || '').toLowerCase();
  if (d.startsWith('side:')) return 'side';
  if (d.startsWith('temporary:')) return 'temporary';
  return row.kind || 'salary';
}

export function renderIncomes(root: HTMLElement) {
  clear(root);
  const picker = new MonthPicker();
  const content = el('div', {});
  root.appendChild(picker.element());
  root.appendChild(content);

  async function saveIncome(id: number, row: HTMLElement, month: string) {
    const data = collect(row);
    await api.patch(`/api/incomes/${id}`, data);
    await load(month);
  }
  async function deleteIncome(id: number, month: string) {
    if (!confirm(L('この収入を削除しますか？集計から除外されます。', 'Delete this income? It will be excluded from totals.'))) return;
    await api.delete(`/api/incomes/${id}`);
    await load(month);
  }
  async function saveRecurring(id: number, row: HTMLElement, month: string) {
    const inputs = row.querySelectorAll('input,select') as NodeListOf<HTMLInputElement | HTMLSelectElement>;
    const payload: any = {};
    inputs.forEach((x) => payload[x.name] = x.type === 'number' ? Number(x.value || 0) : x.value);
    await api.patch(`/api/incomes/recurring/${id}`, payload);
    await load(month);
  }
  async function deleteRecurring(id: number, month: string) {
    if (!confirm(L('この定期収入を削除しますか？', 'Delete this recurring income?'))) return;
    await api.delete(`/api/incomes/recurring/${id}`);
    await load(month);
  }

  function collect(row: HTMLElement): any {
    const payload: any = {};
    const inputs = row.querySelectorAll('input,select') as NodeListOf<HTMLInputElement | HTMLSelectElement>;
    inputs.forEach((x) => payload[x.name] = x.type === 'number' ? Number(x.value || 0) : x.value);
    return payload;
  }

  async function load(month: string) {
    clear(content);
    content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
    try {
      const [list, recurring] = await Promise.all([
        api.get<{ items: any[] }>(`/api/incomes?month=${month}`),
        api.get<{ items: any[] }>('/api/incomes/recurring'),
      ]);
      clear(content);

      const guide = el('div', { class: 'banner banner-info' }, [L('このタブで本業・副業・突発収入を追加、編集、削除できます。変更は概要・分析・口座ショート判定へ反映されます。', 'Add, edit, and delete salary, side, and temporary income here. Changes flow into Dashboard, Analytics, and cashflow forecasts.')]);
      content.appendChild(guide);

      const feedback = el('div', { class: 'banner banner-error', style: 'display:none' });
      const showError = (e: any) => { feedback.textContent = `${L('保存できませんでした', 'Could not save')}: ${e?.message || e}`; feedback.style.display = 'block'; };
      const clearError = () => { feedback.textContent = ''; feedback.style.display = 'none'; };
      content.appendChild(feedback);

      const addCard = el('details', { class: 'card soft-card', open: true }, [el('summary', {}, [L('収入を追加', 'Add income')])]);
      const date = el('input', { type: 'date', name: 'date', autocomplete: 'off', value: `${month}-25` }) as HTMLInputElement;
      const amount = el('input', { type: 'number', name: 'amount', inputmode: 'numeric', autocomplete: 'off', placeholder: '500000' }) as HTMLInputElement;
      const owner = selectOwner('lisa');
      const kind = selectKind('salary');
      const desc = el('input', { name: 'description', autocomplete: 'off', placeholder: L('本業給与、副業、臨時収入など', 'Salary, side income, temporary income') }) as HTMLInputElement;
      const note = el('input', { name: 'note', autocomplete: 'off', placeholder: L('メモ', 'Note') }) as HTMLInputElement;
      addCard.appendChild(el('div', { class: 'form-grid' }, [field(t('common.date'), date), field(t('common.amount'), amount), field(t('common.owner'), owner), field(L('種別','Type'), kind), field(t('common.description'), desc), field(t('common.note'), note)]));
      addCard.appendChild(el('button', { class: 'btn', type: 'button', onClick: async () => { try { clearError(); await api.post('/api/incomes', { date: date.value, amount: Number(amount.value || 0), owner: owner.value, kind: kind.value, description: desc.value, note: note.value }); await load(picker.get()); } catch (e) { showError(e); } } }, [L('保存', 'Save')]));
      content.appendChild(addCard);

      const recurringAdd = el('details', { class: 'card soft-card', open: false }, [el('summary', {}, [L('定期収入を追加', 'Add recurring income')])]);
      const rName = el('input', { name: 'name', autocomplete: 'off', placeholder: L('給与・副業定期収入', 'Salary / recurring side income') }) as HTMLInputElement;
      const rOwner = selectOwner('toshi');
      const rAmount = el('input', { type: 'number', name: 'amount', autocomplete: 'off', placeholder: '500000' }) as HTMLInputElement;
      const rDay = el('input', { type: 'number', name: 'pay_day', autocomplete: 'off', min: '1', max: '31', value: '25' }) as HTMLInputElement;
      const rKind = selectKind('salary');
      const rNote = el('input', { name: 'note', autocomplete: 'off', placeholder: L('メモ', 'Note') }) as HTMLInputElement;
      recurringAdd.appendChild(el('div', { class: 'form-grid' }, [field(L('名前','Name'), rName), field(t('common.owner'), rOwner), field(t('common.amount'), rAmount), field(L('入金日','Pay day'), rDay), field(L('種別','Type'), rKind), field(t('common.note'), rNote)]));
      recurringAdd.appendChild(el('button', { class: 'btn', type: 'button', onClick: async () => { try { clearError(); await api.post('/api/incomes/recurring', { name: rName.value, owner: rOwner.value, amount: Number(rAmount.value || 0), pay_day: Number(rDay.value || 1), kind: rKind.value, note: rNote.value }); await load(picker.get()); } catch (e) { showError(e); } } }, [L('保存', 'Save')]));
      content.appendChild(recurringAdd);

      const total = list.items.reduce((a, x) => a + Number(x.amount || 0), 0);
      const toshi = list.items.filter((x) => x.owner === 'toshi').reduce((a, x) => a + Number(x.amount || 0), 0);
      const lisa = list.items.filter((x) => x.owner === 'lisa').reduce((a, x) => a + Number(x.amount || 0), 0);
      const metrics = el('div', { class: 'card-grid' }, [
        metric(L('当月収入合計','Monthly income'), total),
        metric(L('夫収入','Husband income'), toshi),
        metric(L('妻収入','Wife income'), lisa),
      ]);
      content.appendChild(metrics);

      const sec1 = el('div', { class: 'card soft-card' }, [el('h3', {}, [`${month} ${t('tab.incomes')}`])]);
      const tbl = el('div', { class: 'table-wrap' });
      const tab = el('table', { class: 'data compact-table soft-table' });
      tab.innerHTML = `<thead><tr><th>${t('common.date')}</th><th class="num">${t('common.amount')}</th><th>${t('common.owner')}</th><th>${L('種別','Type')}</th><th>${t('common.description')}</th><th>${t('common.note')}</th><th>${t('common.actions')}</th></tr></thead>`;
      const tbody = el('tbody', {});
      if (list.items.length === 0) tbody.appendChild(el('tr', {}, [el('td', { colspan: '7', class: 'muted' }, [t('common.no_data')])]));
      for (const i of list.items) {
        const tr = el('tr', { class: 'editable-row' });
        const dateInput = el('input', { type: 'date', name: 'date', value: i.date }) as HTMLInputElement;
        const amountInput = el('input', { type: 'number', name: 'amount', value: String(i.amount || 0) }) as HTMLInputElement;
        const ownerInput = selectOwner(i.owner); ownerInput.name = 'owner';
        const kindInput = selectKind(inferKind(i)); kindInput.name = 'kind';
        const descInput = el('input', { name: 'description', value: cleanDesc(i.description) }) as HTMLInputElement;
        const noteInput = el('input', { name: 'note', value: i.note || '' }) as HTMLInputElement;
        tr.appendChild(el('td', {}, [dateInput]));
        tr.appendChild(el('td', { class: 'num' }, [amountInput]));
        tr.appendChild(el('td', {}, [ownerInput]));
        tr.appendChild(el('td', {}, [kindInput]));
        tr.appendChild(el('td', {}, [descInput]));
        tr.appendChild(el('td', {}, [noteInput]));
        tr.appendChild(el('td', { class: 'table-actions' }, [
          el('button', { class: 'btn btn-small', type: 'button', onClick: async () => { try { clearError(); await saveIncome(i.id, tr, month); } catch (e) { showError(e); } } }, [L('保存','Save')]),
          el('button', { class: 'btn btn-danger btn-small', type: 'button', onClick: async () => { try { clearError(); await deleteIncome(i.id, month); } catch (e) { showError(e); } } }, [t('common.delete')]),
        ]));
        tbody.appendChild(tr);
      }
      tab.appendChild(tbody); tbl.appendChild(tab); sec1.appendChild(tbl); content.appendChild(sec1);

      const sec2 = el('div', { class: 'card soft-card' }, [el('h3', {}, [L('定期収入','Recurring income')])]);
      const tbl2 = el('div', { class: 'table-wrap' });
      const tab2 = el('table', { class: 'data compact-table soft-table' });
      tab2.innerHTML = `<thead><tr><th>${L('名前','Name')}</th><th>${t('common.owner')}</th><th class="num">${t('common.amount')}</th><th class="num">${L('給与日','Pay day')}</th><th>${L('種別','Type')}</th><th>${t('common.note')}</th><th>${t('common.actions')}</th></tr></thead>`;
      const tb2 = el('tbody', {});
      if (recurring.items.length === 0) tb2.appendChild(el('tr', {}, [el('td', { colspan: '7', class: 'muted' }, [t('common.no_data')])]));
      for (const r of recurring.items) {
        const tr = el('tr', { class: 'editable-row' });
        const nameInput = el('input', { name: 'name', value: r.name }) as HTMLInputElement;
        const ownerInput = selectOwner(r.owner); ownerInput.name = 'owner';
        const amountInput = el('input', { type: 'number', name: 'amount', value: String(r.amount || 0) }) as HTMLInputElement;
        const payInput = el('input', { type: 'number', name: 'pay_day', min: '1', max: '31', value: String(r.pay_day || 25) }) as HTMLInputElement;
        const kindInput = selectKind(r.kind || 'salary'); kindInput.name = 'kind';
        const noteInput = el('input', { name: 'note', value: r.note || '' }) as HTMLInputElement;
        tr.appendChild(el('td', {}, [nameInput]));
        tr.appendChild(el('td', {}, [ownerInput]));
        tr.appendChild(el('td', { class: 'num' }, [amountInput]));
        tr.appendChild(el('td', { class: 'num' }, [payInput]));
        tr.appendChild(el('td', {}, [kindInput]));
        tr.appendChild(el('td', {}, [noteInput]));
        tr.appendChild(el('td', { class: 'table-actions' }, [
          el('button', { class: 'btn btn-small', type: 'button', onClick: async () => { try { clearError(); await saveRecurring(r.id, tr, month); } catch (e) { showError(e); } } }, [L('保存','Save')]),
          el('button', { class: 'btn btn-danger btn-small', type: 'button', onClick: async () => { try { clearError(); await deleteRecurring(r.id, month); } catch (e) { showError(e); } } }, [t('common.delete')]),
        ]));
        tb2.appendChild(tr);
      }
      tab2.appendChild(tb2); tbl2.appendChild(tab2); sec2.appendChild(tbl2); content.appendChild(sec2);
    } catch (e: any) {
      clear(content);
      content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー','Error')}: ${e.message}`]));
    }
  }

  picker.onChange(load);
  load(picker.get());
}
function metric(label: string, amount: number): HTMLElement {
  return el('div', { class: 'metric soft-metric' }, [el('div', { class: 'metric-label' }, [label]), el('div', { class: 'metric-value' }, [formatYen(amount)])]);
}
