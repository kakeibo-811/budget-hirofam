import { el, clear, api, formatYen } from '../utils';
import { t, getLocale } from '../i18n';
import { MonthPicker } from '../components/month-picker';

type Owner = 'toshi' | 'lisa' | 'shared' | 'other';

type Card = {
  id: number;
  name: string;
  owner?: string;
  close_day?: number;
  pay_day?: number;
  default_paid_by?: Owner;
  default_burden_owner?: Owner;
};

type Expense = {
  id: number;
  date: string;
  amount: number;
  description: string;
  payer: Owner;
  paid_by?: Owner | null;
  burden_owner?: Owner | null;
  billing_month: string;
  payment_due_date?: string | null;
  cycle_month?: string | null;
  payment_method?: string | null;
  card_id?: number | null;
  card_name?: string | null;
  category?: string | null;
  note?: string | null;
};

type ExpenseImportRow = {
  line: number;
  date: string;
  amount: number | null;
  description: string;
  payer: string;
  paid_by?: string;
  burden_owner?: string;
  billing_month: string;
  payment_due_date: string | null;
  cycle_month: string;
  card_id: number | null;
  card_name: string;
  category: string;
  note: string;
  import_key: string;
  warnings: string[];
};

function L(ja: string, en: string): string { return getLocale() === 'en' ? en : ja; }
function labelPayer(v?: string | null): string { return t(`payer.${v || 'other'}` as any); }
function button(label: string, onClick: () => void | Promise<void>, cls = 'btn btn-secondary'): HTMLElement {
  return el('button', { class: cls, onClick: () => void onClick() }, [label]);
}
async function readCsvFile(file: File, encoding: string): Promise<string> {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder(encoding).decode(buf); }
  catch { return new TextDecoder('utf-8').decode(buf); }
}
function download(path: string) {
  const a = document.createElement('a');
  a.href = path;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function ownerSelect(value?: string | null): HTMLSelectElement {
  const s = el('select') as HTMLSelectElement;
  const options: [Owner, string][] = [
    ['toshi', L('夫', 'Husband')],
    ['lisa', L('妻', 'Wife')],
    ['shared', L('共同/折半', 'Shared/Split')],
    ['other', L('対象外/その他', 'Other/Excluded')],
  ];
  for (const [v, label] of options) s.appendChild(el('option', { value: v }, [label]));
  s.value = (value as Owner) || 'other';
  return s;
}
function monthFromDate(date: string): string { return /^\d{4}-\d{2}/.test(date || '') ? date.slice(0, 7) : ''; }
function valueOrEmpty(v: unknown): string { return v === null || v === undefined ? '' : String(v); }
function paymentMethodText(v?: string | null): string {
  const map: Record<string, string> = { card: L('カード', 'Card'), bank_transfer: L('口座振替・銀行振込', 'Bank transfer/debit'), cash_debit: L('現金・デビット', 'Cash / Debit'), other: L('その他', 'Other') };
  return map[String(v || '')] || '-';
}
function paymentMethodSelect(value?: string | null): HTMLSelectElement {
  const s = el('select') as HTMLSelectElement;
  [['card', paymentMethodText('card')], ['bank_transfer', paymentMethodText('bank_transfer')], ['cash_debit', paymentMethodText('cash_debit')], ['other', paymentMethodText('other')]].forEach(([v, label]) => s.appendChild(el('option', { value: v }, [label])));
  s.value = value || 'card';
  return s;
}

function renderPreview(rows: ExpenseImportRow[], warnings: string[], onRowsChange?: () => void): HTMLElement {
  const box = el('div', { class: 'card' }, [el('h3', {}, [L('取り込みプレビュー', 'Import Preview')])]);
  if (warnings.length) box.appendChild(el('div', { class: 'banner banner-warn' }, [warnings.join(' / ')]));
  const fatal = rows.filter((r) => (r.warnings || []).some((w) => !String(w).startsWith('WARN:'))).length;
  const warnOnly = rows.filter((r) => (r.warnings || []).some((w) => String(w).startsWith('WARN:')) && !(r.warnings || []).some((w) => !String(w).startsWith('WARN:'))).length;
  box.appendChild(el('div', { class: fatal ? 'banner banner-warn' : 'banner banner-info' }, [
    L(`登録可能 ${rows.length - fatal}件 / 致命エラー ${fatal}件 / 注意 ${warnOnly}件`, `Importable ${rows.length - fatal} / fatal ${fatal} / warnings ${warnOnly}`)
  ]));
  const wrap = el('div', { class: 'table-wrap' });
  const table = el('table', { class: 'data compact-table' });
  table.innerHTML = `<thead><tr>
    <th>${L('行', 'Line')}</th><th>${t('common.date')}</th><th class="num">${t('common.amount')}</th><th>${t('common.description')}</th>
    <th>${L('負担者', 'Burden')}</th><th>${L('実支払者', 'Paid by')}</th><th>${L('家計月', 'Budget month')}</th><th>${t('common.billing_month')}</th><th>${L('支払予定日', 'Payment date')}</th><th>${t('common.card')}</th><th>${L('警告', 'Warnings')}</th>
  </tr></thead>`;
  const tbody = el('tbody');
  for (const r of rows) {
    const billingInput = el('input', { type: 'month', value: r.billing_month || '', class: 'compact-input' }) as HTMLInputElement;
    billingInput.addEventListener('change', () => { r.billing_month = billingInput.value; if (!r.cycle_month) r.cycle_month = billingInput.value; onRowsChange?.(); });
    const cycleInput = el('input', { type: 'month', value: r.cycle_month || r.billing_month || '', class: 'compact-input' }) as HTMLInputElement;
    cycleInput.addEventListener('change', () => { r.cycle_month = cycleInput.value; onRowsChange?.(); });
    const payInput = el('input', { type: 'date', value: r.payment_due_date || '', class: 'compact-input' }) as HTMLInputElement;
    payInput.addEventListener('change', () => { r.payment_due_date = payInput.value || null; onRowsChange?.(); });
    tbody.appendChild(el('tr', { class: r.warnings.length ? 'warn-row' : '' }, [
      el('td', {}, [String(r.line)]),
      el('td', { class: 'mono' }, [r.date]),
      el('td', { class: 'num' }, [r.amount === null ? '—' : formatYen(r.amount)]),
      el('td', {}, [r.description]),
      el('td', {}, [labelPayer((r as any).burden_owner || r.payer)]),
      el('td', {}, [labelPayer((r as any).paid_by || 'toshi')]),
      el('td', {}, [cycleInput]),
      el('td', {}, [billingInput]),
      el('td', {}, [payInput]),
      el('td', {}, [r.card_name || '—']),
      el('td', {}, [r.warnings.join(' / ')]),
    ]));
  }
  if (!rows.length) tbody.appendChild(el('tr', {}, [el('td', { colspan: '11', class: 'muted' }, [t('common.no_data')])]));
  table.appendChild(tbody);
  wrap.appendChild(table);
  box.appendChild(wrap);
  return box;
}

function expenseForm(args: {
  cards: Card[];
  initial?: Partial<Expense>;
  onSubmit: (payload: any) => Promise<void>;
  onCancel?: () => void;
}): HTMLElement {
  const e = args.initial || {};
  const form = el('div', { class: 'form-grid expense-edit-grid' });
  const date = el('input', { type: 'date', value: valueOrEmpty(e.date) }) as HTMLInputElement;
  const amount = el('input', { type: 'number', inputmode: 'numeric', value: valueOrEmpty(e.amount) }) as HTMLInputElement;
  const description = el('input', { value: valueOrEmpty(e.description), placeholder: L('店名・内容', 'Merchant / Description') }) as HTMLInputElement;
  const burden = ownerSelect(e.burden_owner || e.payer || 'other');
  const paidBy = ownerSelect(e.paid_by || 'toshi');
  const paymentMethod = paymentMethodSelect(e.payment_method || (e.card_id ? 'card' : 'bank_transfer'));
  const billingMonth = el('input', { type: 'month', value: valueOrEmpty(e.billing_month || monthFromDate(e.date || '')) }) as HTMLInputElement;
  const paymentDueDate = el('input', { type: 'date', value: valueOrEmpty(e.payment_due_date) }) as HTMLInputElement;
  const cycleMonth = el('input', { type: 'month', value: valueOrEmpty(e.cycle_month || e.billing_month || monthFromDate(e.payment_due_date || e.date || '')) }) as HTMLInputElement;
  const card = el('select') as HTMLSelectElement;
  card.appendChild(el('option', { value: '' }, [L('カードなし/手入力', 'No card / Manual')]))
  for (const c of args.cards) card.appendChild(el('option', { value: String(c.id) }, [`${c.name}${c.pay_day ? ` (${L('支払日', 'Pay')} ${c.pay_day})` : ''}`]));
  card.value = e.card_id ? String(e.card_id) : '';
  const category = el('input', { value: valueOrEmpty(e.category), placeholder: L('カテゴリ', 'Category') }) as HTMLInputElement;
  const note = el('input', { value: valueOrEmpty(e.note), placeholder: L('メモ', 'Note') }) as HTMLInputElement;

  const field = (label: string, node: HTMLElement) => el('label', { class: 'field' }, [el('span', {}, [label]), node]);
  form.appendChild(field(t('common.date'), date));
  form.appendChild(field(t('common.amount'), amount));
  form.appendChild(field(t('common.description'), description));
  form.appendChild(field(L('負担者', 'Burden owner'), burden));
  form.appendChild(field(L('実支払者', 'Paid by'), paidBy));
  form.appendChild(field(L('支払い手段', 'Payment method'), paymentMethod));
  form.appendChild(field(t('common.billing_month'), billingMonth));
  form.appendChild(field(L('支払予定日', 'Payment date'), paymentDueDate));
  form.appendChild(field(L('家計月', 'Budget month'), cycleMonth));
  form.appendChild(field(t('common.card'), card));
  form.appendChild(field(t('common.category'), category));
  form.appendChild(field(t('common.note'), note));
  form.appendChild(el('div', { class: 'row-flex' }, [
    button(t('common.save'), async () => {
      await args.onSubmit({
        date: date.value,
        amount: Number(amount.value),
        description: description.value,
        payer: burden.value,
        burden_owner: burden.value,
        paid_by: paidBy.value,
        payment_method: paymentMethod.value,
        billing_month: billingMonth.value,
        payment_due_date: paymentDueDate.value,
        cycle_month: cycleMonth.value,
        card_id: card.value ? Number(card.value) : null,
        category: category.value,
        note: note.value,
      });
    }, 'btn'),
    args.onCancel ? button(t('common.cancel'), args.onCancel) : el('span'),
  ]));
  return form;
}

export function renderExpenses(root: HTMLElement) {
  clear(root);
  const picker = new MonthPicker();
  const content = el('div');
  const status = el('div');
  root.appendChild(picker.element());
  root.appendChild(el('div', { class: 'banner banner-info' }, [
    L('表示月は「家計月」です。毎月25日〜翌月24日を当月として扱います。支払予定日を手動変更すると、ダッシュボード・精算・分析はその日付に基づいて再集計されます。',
      'The selected month is the budget month: day 25 through day 24. If you edit payment date manually, dashboard, settlement and analytics recalculate from that date.')
  ]));
  root.appendChild(status);
  root.appendChild(content);

  let lastPreview: ExpenseImportRow[] = [];
  let cards: Card[] = [];
  let selectedIds = new Set<number>();
  let sortBy = 'date';
  let sortOrder: 'asc' | 'desc' = 'desc';

  function showStatus(message: string, kind: 'info' | 'warn' | 'error' = 'info') {
    clear(status);
    status.appendChild(el('div', { class: `banner banner-${kind}` }, [message]));
  }

  async function reloadCards() {
    try { cards = (await api.get<{ items: Card[] }>('/api/cards')).items || []; }
    catch { cards = []; }
  }

  async function load(month: string) {
    clear(content);
    content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
    await reloadCards();
    try {
      const [data, rules] = await Promise.all([
        api.get<{ items: Expense[] }>(`/api/expenses?month=${month}&sort=${sortBy}&order=${sortOrder}`),
        api.get<{ items: any[]; definition: string }>('/api/expenses/billing-rules'),
      ]);
      clear(content);

      const ruleCard = el('details', { class: 'collapse' }, [el('summary', {}, [L('請求月・支払日・家計月の考え方', 'Billing, payment and budget-month rules')])]);
      ruleCard.appendChild(el('p', { class: 'muted' }, [
        L('通常カードCSVはカード締め日/支払日から推定しますが、取り込み後の支払予定日は手動で上書きできます。kakeibo_allは日付を実支払/引落日、支払者を最終負担者として扱います。',
          'Ordinary card CSV uses card close/pay days by default, but imported payment dates can be manually overridden. kakeibo_all treats date as actual payment/debit date and payer as final burden owner.')
      ]));
      const ruleWrap = el('div', { class: 'table-wrap' });
      const ruleTable = el('table', { class: 'data compact-table' });
      ruleTable.innerHTML = `<thead><tr><th>${t('common.card')}</th><th class="num">${L('締め日', 'Close day')}</th><th class="num">${L('支払日', 'Pay day')}</th><th>${L('例: 2026-04-15', 'Example: 2026-04-15')}</th></tr></thead>`;
      const ruleBody = el('tbody');
      for (const c of rules.items || []) ruleBody.appendChild(el('tr', {}, [el('td', {}, [c.name]), el('td', { class: 'num' }, [String(c.close_day)]), el('td', { class: 'num' }, [String(c.pay_day)]), el('td', {}, [`${c.example.billing_month} / ${c.example.payment_due_date || '—'}`])]));
      ruleTable.appendChild(ruleBody); ruleWrap.appendChild(ruleTable); ruleCard.appendChild(ruleWrap); content.appendChild(ruleCard);

      const addDetails = el('details', { class: 'collapse card' }, [el('summary', {}, [L('明細を手入力で追加', 'Add expense manually')])]);
      addDetails.appendChild(expenseForm({
        cards,
        initial: { date: new Date().toISOString().slice(0, 10), billing_month: month, cycle_month: month, paid_by: 'toshi', burden_owner: 'shared' },
        onSubmit: async (payload) => {
          await api.post<any>('/api/expenses', payload);
          showStatus(L('明細を追加しました。他タブにも反映されます。', 'Expense added. Other tabs will reflect it.'), 'info');
          await load(picker.get());
        },
      }));
      content.appendChild(addDetails);

      const actions = el('div', { class: 'card' }, [el('h3', {}, [L('CSV一括取り込み', 'Bulk CSV import')])]);
      const encodingSelect = el('select') as HTMLSelectElement;
      encodingSelect.appendChild(el('option', { value: 'utf-8' }, ['UTF-8 / UTF-8 BOM']));
      encodingSelect.appendChild(el('option', { value: 'shift-jis' }, ['Shift-JIS']));
      const fileInput = el('input', { type: 'file', accept: '.csv,text/csv' }) as HTMLInputElement;
      const textarea = el('textarea', { rows: 7, placeholder: L('日付,金額,内容,支払者,カード名,カテゴリ,メモ\n2026-04-03,1200,スーパー,妻,Amazon Card,食費,妻負担', 'date,amount,description,payer,card_name,category,note\n2026-04-03,1200,Supermarket,lisa,Amazon Card,Food,Wife burden') }) as HTMLTextAreaElement;
      const sourceSelect = el('select') as HTMLSelectElement;
      sourceSelect.appendChild(el('option', { value: 'kakeibo_all' }, ['kakeibo_all']));
      sourceSelect.appendChild(el('option', { value: 'card_csv' }, ['card_csv']));
      sourceSelect.appendChild(el('option', { value: 'manual_csv' }, ['manual_csv']));
      const importCardSelect = el('select') as HTMLSelectElement;
      importCardSelect.appendChild(el('option', { value: '' }, [L('CSV内のカード名を使う', 'Use card name in CSV')]));
      for (const c of cards) importCardSelect.appendChild(el('option', { value: String(c.id) }, [c.name]));
      const targetBillingMonthInput = el('input', { type: 'month', value: '' }) as HTMLInputElement;
      const replaceImported = el('input', { type: 'checkbox' }) as HTMLInputElement;
      const previewArea = el('div');
      const commitArea = el('div');
      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;
        textarea.value = await readCsvFile(file, encodingSelect.value);
        clear(previewArea); clear(commitArea); lastPreview = [];
      });
      actions.appendChild(el('div', { class: 'row-flex import-controls' }, [
        el('label', { class: 'field-inline' }, [L('文字コード ', 'Encoding '), encodingSelect]),
        fileInput,
        el('label', { class: 'field-inline' }, [L('取込元 ', 'Source '), sourceSelect]),
        el('label', { class: 'field-inline' }, [L('カード別取込 ', 'Import for card '), importCardSelect]),
        el('label', { class: 'field-inline' }, [L('請求月を一括指定 ', 'Override billing month '), targetBillingMonthInput]),
        el('label', { class: 'field-inline' }, [replaceImported, L(' 同じ取込元の既存取込分を置き換える', ' Replace prior imports from same source')]),
      ]));
      actions.appendChild(el('div', { class: 'banner banner-warn' }, [
        L('CSV確定前に請求月・家計月・支払予定日を手動変更できます。確定後も各明細の支払予定日は編集可能で、ダッシュボード、月別精算、分析、口座見込みに反映されます。',
          'Before commit, you can manually edit billing month, budget month and payment date. After commit, payment dates remain editable and changes are reflected in dashboard, settlement, analytics and cashflow forecasts.')
      ]));
      actions.appendChild(textarea);
      actions.appendChild(el('div', { class: 'row-flex', style: 'margin-top:8px' }, [
        button(L('プレビュー', 'Preview'), async () => {
          try {
            const res = await api.post<{ rows: ExpenseImportRow[]; warnings: string[]; count: number }>('/api/expenses/import/preview', {
              csv: textarea.value,
              source: sourceSelect.value,
              month_policy: sourceSelect.value === 'kakeibo_all' ? 'cycle' : 'explicit_or_card',
              force_card_id: importCardSelect.value ? Number(importCardSelect.value) : null,
              target_billing_month: targetBillingMonthInput.value || null,
            });
            lastPreview = res.rows; clear(previewArea); clear(commitArea);
            previewArea.appendChild(renderPreview(res.rows, res.warnings, () => { clear(commitArea); }));
          } catch (e: any) { clear(previewArea); previewArea.appendChild(el('div', { class: 'banner banner-error' }, [`${L('プレビュー失敗', 'Preview failed')}: ${e.message}`])); }
        }, 'btn'),
        button(L('確定登録', 'Commit'), async () => {
          if (!lastPreview.length) { alert(L('先にプレビューを実行してください。', 'Run preview first.')); return; }
          const fatal = lastPreview.filter((r) => (r.warnings || []).some((w) => !String(w).startsWith('WARN:'))).length;
          if (!confirm(L(`CSVをDBに登録します。致命エラー ${fatal}件。同じ明細は二重登録されません。実行しますか？`, `Commit CSV to DB? Fatal errors ${fatal}. Duplicates are skipped.`))) return;
          try {
            const res = await api.post<any>('/api/expenses/import/commit', {
              rows: lastPreview,
              confirm: true,
              source: sourceSelect.value,
              month_policy: sourceSelect.value === 'kakeibo_all' ? 'cycle' : 'explicit_or_card',
              force_card_id: importCardSelect.value ? Number(importCardSelect.value) : null,
              target_billing_month: targetBillingMonthInput.value || null,
              source_file: fileInput.files?.[0]?.name || 'pasted.csv',
              mode: replaceImported.checked ? 'replace_imported' : 'append',
            });
            clear(commitArea);
            commitArea.appendChild(el('div', { class: 'banner banner-info' }, [L(`登録完了: 置換 ${res.replaced || 0}件 / 追加 ${res.inserted}件 / 重複 ${res.skipped_duplicate}件 / 不正 ${res.skipped_invalid}件`, `Committed: replaced ${res.replaced || 0} / inserted ${res.inserted} / duplicate ${res.skipped_duplicate} / invalid ${res.skipped_invalid}`)]));
            await load(picker.get());
          } catch (e: any) { clear(commitArea); commitArea.appendChild(el('div', { class: 'banner banner-error' }, [`${L('確定登録失敗', 'Commit failed')}: ${e.message}`])); }
        }),
        button(L('当月CSV出力', 'Export month CSV'), () => download(`/api/expenses/export.csv?month=${month}&lang=${getLocale()}`)),
        button(L('この月の取込分を削除', 'Delete imported rows for this month'), async () => {
          const source = sourceSelect.value || 'kakeibo_all';
          if (!confirm(L(`${source} / ${month} の取込済み明細を一括削除します。実行しますか？`, `Archive imported expense rows for ${source} / ${month}?`))) return;
          try {
            const res = await api.post<any>('/api/bulk/expenses/delete-imported-month', { source, month, confirm: true });
            clear(commitArea);
            commitArea.appendChild(el('div', { class: 'banner banner-info' }, [L(`削除済み: ${res.deleted}件`, `Archived: ${res.deleted} rows`)]));
            await load(picker.get());
          } catch (e: any) {
            clear(commitArea);
            commitArea.appendChild(el('div', { class: 'banner banner-error' }, [`${L('一括削除失敗', 'Bulk archive failed')}: ${e.message}`]));
          }
        }, 'btn btn-danger'),
      ]));
      actions.appendChild(previewArea); actions.appendChild(commitArea); content.appendChild(actions);

      const sec = el('div', { class: 'card' }, [el('h3', {}, [`${month} ${L('明細', 'Expenses')}`])]);
      selectedIds = new Set<number>();
      const sortSelect = el('select') as HTMLSelectElement;
      [['date', L('日付', 'Date')], ['amount', L('金額', 'Amount')], ['billing_month', L('請求月', 'Billing month')], ['cycle_month', L('家計月', 'Budget month')], ['payment_due_date', L('支払予定日', 'Payment date')], ['description', L('内容', 'Description')]].forEach(([v, label]) => sortSelect.appendChild(el('option', { value: v, selected: v === sortBy ? 'selected' : null }, [label])));
      const orderSelect = el('select') as HTMLSelectElement;
      orderSelect.appendChild(el('option', { value: 'asc', selected: sortOrder === 'asc' ? 'selected' : null }, [L('昇順', 'Ascending')]));
      orderSelect.appendChild(el('option', { value: 'desc', selected: sortOrder === 'desc' ? 'selected' : null }, [L('降順', 'Descending')]));
      const bulkField = el('select') as HTMLSelectElement;
      [['billing_month', L('請求月', 'Billing month')], ['cycle_month', L('家計月', 'Budget month')], ['payment_due_date', L('支払予定日', 'Payment date')], ['paid_by', L('実支払者', 'Paid by')], ['burden_owner', L('負担者', 'Burden owner')], ['category', L('カテゴリ', 'Category')], ['note', L('メモ', 'Note')]].forEach(([v, label]) => bulkField.appendChild(el('option', { value: v }, [label])));
      const bulkValue = el('input', { placeholder: L('一括反映する値', 'Value to apply') }) as HTMLInputElement;
      const selectedLabel = el('span', { class: 'muted' }, [L('選択 0件', 'Selected 0')]);
      const refreshSelectedLabel = () => { selectedLabel.textContent = L(`選択 ${selectedIds.size}件`, `Selected ${selectedIds.size}`); };
      const undoBox = el('div', { class: 'row-flex bulk-toolbar' }, [
        el('label', { class: 'field-inline' }, [L('並び替え ', 'Sort '), sortSelect]),
        el('label', { class: 'field-inline' }, [L('順序 ', 'Order '), orderSelect]),
        button(L('並び替え反映', 'Apply sort'), async () => { sortBy = sortSelect.value; sortOrder = orderSelect.value as any; await load(picker.get()); }, 'btn'),
        selectedLabel,
        el('label', { class: 'field-inline' }, [L('一括項目 ', 'Bulk field '), bulkField]),
        bulkValue,
        button(L('選択行へ一括反映', 'Apply to selected'), async () => {
          if (!selectedIds.size) return alert(L('対象行を選択してください。', 'Select rows first.'));
          if (!confirm(L(`${selectedIds.size}件の明細を一括更新します。他タブにも反映されます。`, `Bulk update ${selectedIds.size} expenses? Other tabs will reflect it.`))) return;
          await api.post<any>('/api/bulk/expenses/bulk-update', { ids: Array.from(selectedIds), fields: { [bulkField.value]: bulkValue.value }, confirm: true });
          showStatus(L('一括更新しました。', 'Bulk updated.'), 'info');
          await load(picker.get());
        }, 'btn'),
        button(L('選択行を一括削除', 'Delete selected'), async () => {
          if (!selectedIds.size) return alert(L('対象行を選択してください。', 'Select rows first.'));
          if (!confirm(L(`${selectedIds.size}件の明細を削除します。他タブの集計から除外されます。`, `Archive ${selectedIds.size} expenses? They will be excluded from other tabs.`))) return;
          await api.post<any>('/api/bulk/expenses/bulk-delete', { ids: Array.from(selectedIds), confirm: true });
          showStatus(L('一括削除しました。', 'Bulk archived.'), 'info');
          await load(picker.get());
        }, 'btn btn-danger'),
        button(L('直前の明細操作をUndo', 'Undo last expense operation'), async () => {
          if (!confirm(L('直前の明細追加・編集・削除を1件戻します。実行しますか？', 'Undo the latest expense add/edit/delete?'))) return;
          try { await api.post<any>('/api/expenses/undo-latest', { confirm: true }); showStatus(L('Undoしました。', 'Undone.'), 'info'); await load(picker.get()); }
          catch (e: any) { showStatus(`${L('Undo失敗', 'Undo failed')}: ${e.message}`, 'error'); }
        }),
      ]);
      sec.appendChild(undoBox);
      const editBox = el('div');
      sec.appendChild(editBox);
      const tbl = el('div', { class: 'table-wrap' });
      const tab = el('table', { class: 'data compact-table' });
      tab.innerHTML = `<thead><tr>
        <th><input type="checkbox" id="expense-select-all"></th><th>${t('common.date')}</th><th class="num">${t('common.amount')}</th><th>${t('common.description')}</th>
        <th>${L('負担者', 'Burden')}</th><th>${L('実支払者', 'Paid by')}</th><th>${L('家計月', 'Budget month')}</th><th>${t('common.billing_month')}</th><th>${L('支払予定日', 'Payment date')}</th><th>${t('common.card')}</th><th>${t('common.category')}</th><th>${t('common.note')}</th><th>${t('common.actions')}</th>
      </tr></thead>`;
      const tbody = el('tbody');
      const selectAllBox = tab.querySelector('#expense-select-all') as HTMLInputElement | null;
      if (selectAllBox) selectAllBox.addEventListener('change', () => {
        selectedIds = selectAllBox.checked ? new Set(data.items.map((x) => x.id)) : new Set<number>();
        tbody.querySelectorAll<HTMLInputElement>('input[data-expense-select]').forEach((cb) => { cb.checked = selectedIds.has(Number(cb.value)); });
        refreshSelectedLabel();
      });
      if (!data.items.length) tbody.appendChild(el('tr', {}, [el('td', { colspan: '13', class: 'muted' }, [t('common.no_data')])]));
      for (const ex of data.items) {
        const actionsCell = el('td', { class: 'table-actions sticky-actions' });
        actionsCell.appendChild(button(t('common.edit'), () => {
          clear(editBox);
          const card = el('div', { class: 'card inline-editor' }, [el('h3', {}, [L('明細を編集', 'Edit expense')])]);
          card.appendChild(expenseForm({
            cards,
            initial: ex,
            onSubmit: async (payload) => {
              await api.patch<any>(`/api/expenses/${ex.id}`, payload);
              showStatus(L('明細を更新しました。他タブにも反映されます。', 'Expense updated. Other tabs will reflect it.'), 'info');
              clear(editBox); await load(picker.get());
            },
            onCancel: () => clear(editBox),
          }));
          editBox.appendChild(card);
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }));
        actionsCell.appendChild(button(t('common.delete'), async () => {
          if (!confirm(L(`明細「${ex.description}」を削除します。他タブの集計からも除外されます。`, `Delete expense "${ex.description}"? Other tab totals will exclude it.`))) return;
          await api.delete<any>(`/api/expenses/${ex.id}`);
          showStatus(L('明細を削除しました。', 'Expense deleted.'), 'info');
          await load(picker.get());
        }, 'btn btn-danger'));
        const cb = el('input', { type: 'checkbox', value: String(ex.id), 'data-expense-select': '1', onChange: (ev: Event) => { const target = ev.target as HTMLInputElement; if (target.checked) selectedIds.add(ex.id); else selectedIds.delete(ex.id); refreshSelectedLabel(); } }) as HTMLInputElement;
        tbody.appendChild(el('tr', {}, [
          el('td', {}, [cb]),
          el('td', { class: 'mono' }, [ex.date]),
          el('td', { class: 'num' }, [formatYen(ex.amount)]),
          el('td', {}, [ex.description ?? '']),
          el('td', {}, [labelPayer(ex.burden_owner || ex.payer)]),
          el('td', {}, [labelPayer(ex.paid_by)]),
          el('td', {}, [paymentMethodText(ex.payment_method || (ex.card_id ? 'card' : ''))]),
          el('td', { class: 'mono' }, [ex.cycle_month ?? ex.billing_month ?? '']),
          el('td', { class: 'mono' }, [ex.billing_month ?? '']),
          el('td', { class: 'mono' }, [ex.payment_due_date ?? '—']),
          el('td', {}, [ex.card_name ?? '—']),
          el('td', {}, [ex.category ?? '']),
          el('td', {}, [ex.note ?? '']),
          actionsCell,
        ]));
      }
      tab.appendChild(tbody); tbl.appendChild(tab); sec.appendChild(tbl); content.appendChild(sec);
    } catch (e: any) {
      clear(content);
      content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー', 'Error')}: ${e.message}`]));
    }
  }

  picker.onChange(load);
  load(picker.get());
}
