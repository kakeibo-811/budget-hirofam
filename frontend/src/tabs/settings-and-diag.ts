import { el, clear, api } from '../utils';
import { t, getLocale, setLocale, type Locale } from '../i18n';
import { L } from '../i18n/ui';

async function loadAppRules(section: HTMLElement, status: HTMLElement) {
  try {
    const res = await api.get<{ items: Record<string, string>; defaults: Record<string, string> }>('/api/analytics/settings');
    clear(status);
    const items = { ...(res.defaults || {}), ...(res.items || {}) };
    const cycle = el('input', { type: 'number', min: '1', max: '28', value: items.budget_cycle_start_day || '25' }) as HTMLInputElement;
    const actualsOverride = el('input', { type: 'checkbox', checked: items.dashboard_actuals_override_plans === 'true' ? 'checked' : null }) as HTMLInputElement;
    const showSplit = el('input', { type: 'checkbox', checked: items.dashboard_card_fixed_split_explained === 'true' ? 'checked' : null }) as HTMLInputElement;
    const grid = el('div', { class: 'form-grid compact-form app-rules-grid' }, [
      el('label', { class: 'field' }, [el('span', {}, [L('家計月の開始日', 'Budget cycle start day')]), cycle]),
      el('label', { class: 'field checkbox-field' }, [actualsOverride, el('span', {}, [L('実績明細と一致した予定支払いは二重計上しない', 'Actual rows override matching plans')])]),
      el('label', { class: 'field checkbox-field' }, [showSplit, el('span', {}, [L('ダッシュボードでカード実績と固定費予定を分けて説明する', 'Explain card actuals and fixed plans separately')])]),
    ]);
    const result = el('div');
    const save = el('button', { class: 'btn', onClick: async () => {
      const day = Math.min(28, Math.max(1, Number(cycle.value || 25)));
      const saved = await api.put<any>('/api/analytics/settings', { items: {
        budget_cycle_start_day: String(day),
        dashboard_actuals_override_plans: actualsOverride.checked ? 'true' : 'false',
        dashboard_card_fixed_split_explained: showSplit.checked ? 'true' : 'false',
      }});
      clear(result);
      result.appendChild(el('div', { class: 'banner banner-info' }, [L(
        `保存しました。家計月は毎月${saved.items.budget_cycle_start_day}日開始です。`,
        `Saved. Budget month starts on day ${saved.items.budget_cycle_start_day}.`
      )]));
    }}, [t('common.save')]);
    section.appendChild(grid);
    section.appendChild(el('div', { class: 'row-flex' }, [save]));
    section.appendChild(result);
  } catch (e: any) {
    clear(status);
    status.appendChild(el('div', { class: 'banner banner-error' }, [`${L('設定を読み込めませんでした', 'Could not load settings')}: ${e.message}`]));
  }
}

export function renderSettings(root: HTMLElement) {
  clear(root);
  root.appendChild(el('h2', {}, [t('tab.settings')]));

  const themeSec = el('div', { class: 'card' });
  themeSec.appendChild(el('h3', {}, [t('settings.theme')]));
  const themes = ['pink', 'blue', 'green', 'light', 'dark'];
  const cur = document.documentElement.dataset.theme || 'pink';
  const themeBtns = el('div', { class: 'row-flex' });
  for (const th of themes) {
    const b = el('button', {
      class: 'btn ' + (th === cur ? '' : 'btn-secondary'),
      onClick: () => {
        document.documentElement.dataset.theme = th;
        localStorage.setItem('theme', th);
        renderSettings(root); // re-render to update active state
      },
    }, [th]);
    themeBtns.appendChild(b);
  }
  themeSec.appendChild(themeBtns);
  root.appendChild(themeSec);

  const langSec = el('div', { class: 'card' });
  langSec.appendChild(el('h3', {}, [t('settings.language')]));
  const langs: Locale[] = ['ja', 'en'];
  const curLang = getLocale();
  const langBtns = el('div', { class: 'row-flex' });
  for (const l of langs) {
    const b = el('button', {
      class: 'btn ' + (l === curLang ? '' : 'btn-secondary'),
      onClick: () => {
        setLocale(l);
        location.reload();
      },
    }, [l === 'ja' ? '日本語' : 'English']);
    langBtns.appendChild(b);
  }
  langSec.appendChild(langBtns);
  root.appendChild(langSec);

  const appRulesSec = el('div', { class: 'card' });
  appRulesSec.appendChild(el('h3', {}, [L('アプリ仕様の設定', 'App behavior settings')]));
  appRulesSec.appendChild(el('p', { class: 'muted' }, [L(
    'iPhoneから変更しても安全な仕様だけを設定化しています。保存後、ダッシュボードの集計期間や表示説明に反映されます。',
    'Only safe behavior settings are editable here. Saved values affect dashboard periods and explanatory display.'
  )]));
  const appRulesStatus = el('div', { class: 'muted' }, [t('common.loading')]);
  appRulesSec.appendChild(appRulesStatus);
  root.appendChild(appRulesSec);
  loadAppRules(appRulesSec, appRulesStatus);

  const exportSec = el('div', { class: 'card' });
  exportSec.appendChild(el('h3', {}, [t('common.export')]));
  const links = el('div', { class: 'row-flex' });
  for (const [label, path] of [
    [L('明細CSV','Expenses CSV'), `/api/io/expenses.csv?lang=${getLocale()}`],
    [L('精算CSV','Settlements CSV'), `/api/io/settlements.csv?lang=${getLocale()}`],
    [L('資産CSV','Assets CSV'), `/api/assets/export.csv?lang=${getLocale()}`],
    [L('全件JSONダンプ','Full JSON dump'), '/api/io/dump.json'],
    [L('診断JSONバックアップ','Diagnostic JSON backup'), '/api/diag/export.json'],
  ]) {
    links.appendChild(el('a', { class: 'btn', href: path, download: '' }, [label as string]));
  }
  exportSec.appendChild(links);
  root.appendChild(exportSec);


  const bulkSec = el('div', { class: 'card' });
  bulkSec.appendChild(el('h3', {}, [L('全タブ一括操作', 'All-tab bulk operations')]));
  bulkSec.appendChild(el('div', { class: 'banner banner-warn' }, [
    L('選択した行をまとめて更新・削除できます。削除は原則アーカイブで、ダッシュボード/分析/精算の集計から除外されます。実行前に必ず確認します。',
      'Select rows and bulk update/delete them. Deletes are archived by default and excluded from Dashboard/Analytics/Settlement totals. Confirmation is required.')
  ]));
  const entitySelect = el('select') as HTMLSelectElement;
  const monthInput = el('input', { type: 'month' }) as HTMLInputElement;
  const sourceInput = el('input', { placeholder: 'kakeibo_all' }) as HTMLInputElement;
  const sortInput = el('select') as HTMLSelectElement;
  const orderInput = el('select') as HTMLSelectElement;
  const bulkResult = el('div');
  const bulkRows = el('div');
  const selectedBulkIds = new Set<number>();
  orderInput.appendChild(el('option', { value: 'asc' }, [L('昇順', 'Ascending')]));
  orderInput.appendChild(el('option', { value: 'desc' }, [L('降順', 'Descending')]));

  async function loadBulkEntities() {
    const res = await api.get<any>('/api/bulk/entities');
    entitySelect.innerHTML = '';
    for (const e of res.entities) entitySelect.appendChild(el('option', { value: e.key }, [e.label]));
    refreshSortOptions(res.entities[0]);
    entitySelect.addEventListener('change', () => {
      const ent = res.entities.find((x: any) => x.key === entitySelect.value);
      refreshSortOptions(ent);
    });
  }
  function refreshSortOptions(ent: any) {
    sortInput.innerHTML = '';
    for (const s of ent?.allowed_sort || ['id']) sortInput.appendChild(el('option', { value: s }, [s]));
  }
  function selectedBulkArray() { return Array.from(selectedBulkIds); }
  async function loadBulkRows() {
    selectedBulkIds.clear();
    clear(bulkRows); clear(bulkResult);
    const params = new URLSearchParams({ sort: sortInput.value || 'id', order: orderInput.value || 'asc', limit: '500' });
    if (monthInput.value) params.set('month', monthInput.value);
    if (sourceInput.value && entitySelect.value === 'expenses') params.set('source', sourceInput.value);
    const res = await api.get<any>(`/api/bulk/${entitySelect.value}?${params.toString()}`);
    const rows = res.items || [];
    bulkResult.appendChild(el('div', { class: 'banner banner-info' }, [L(`${rows.length}件を読み込みました。`, `Loaded ${rows.length} rows.`)]));
    const wrap = el('div', { class: 'table-wrap' });
    const table = el('table', { class: 'data compact-table' });
    table.innerHTML = `<thead><tr><th><input type="checkbox" id="bulk-all"></th><th>ID</th><th>${L('内容', 'Content')}</th><th class="num">${L('金額', 'Amount')}</th><th>${L('日付/月', 'Date/Month')}</th></tr></thead>`;
    const body = el('tbody');
    for (const r of rows) {
      const cb = el('input', { type: 'checkbox', value: String(r.id), onChange: (ev: Event) => { const x = ev.target as HTMLInputElement; if (x.checked) selectedBulkIds.add(Number(r.id)); else selectedBulkIds.delete(Number(r.id)); } });
      body.appendChild(el('tr', {}, [
        el('td', {}, [cb]),
        el('td', { class: 'num' }, [String(r.id)]),
        el('td', {}, [String(r.description || r.name || r.symbol || r.event_type || r.direction || '')]),
        el('td', { class: 'num' }, [String(r.amount ?? r.manual_price ?? '')]),
        el('td', {}, [String(r.date || r.event_date || r.month || r.billing_month || r.cycle_month || r.due_date || '')]),
      ]));
    }
    table.appendChild(body); wrap.appendChild(table); bulkRows.appendChild(wrap);
    const all = table.querySelector('#bulk-all') as HTMLInputElement | null;
    if (all) all.addEventListener('change', () => { selectedBulkIds.clear(); body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]').forEach((cb) => { cb.checked = all.checked; if (all.checked) selectedBulkIds.add(Number(cb.value)); }); });
  }
  const fieldInput = el('input', { placeholder: L('更新する項目名 例: category, note, payment_due_date', 'Field to update, e.g. category, note, payment_due_date') }) as HTMLInputElement;
  const valueInput = el('input', { placeholder: L('値', 'Value') }) as HTMLInputElement;
  bulkSec.appendChild(el('div', { class: 'form-grid compact-form' }, [
    el('label', { class: 'field' }, [el('span', {}, [L('対象タブ', 'Target tab')]), entitySelect]),
    el('label', { class: 'field' }, [el('span', {}, [L('対象月', 'Month')]), monthInput]),
    el('label', { class: 'field' }, [el('span', {}, [L('取込元（明細のみ）', 'Import source (expenses only)')]), sourceInput]),
    el('label', { class: 'field' }, [el('span', {}, [L('並び替え項目', 'Sort field')]), sortInput]),
    el('label', { class: 'field' }, [el('span', {}, [L('順序', 'Order')]), orderInput]),
    fieldInput,
    valueInput,
  ]));
  bulkSec.appendChild(el('div', { class: 'row-flex' }, [
    el('button', { class: 'btn', onClick: loadBulkRows }, [L('読み込み', 'Load')]),
    el('button', { class: 'btn', onClick: async () => {
      const ids = selectedBulkArray();
      if (!ids.length) return alert(L('行を選択してください。', 'Select rows first.'));
      if (!fieldInput.value) return alert(L('更新項目名を入力してください。', 'Enter field name.'));
      if (!confirm(L(`${ids.length}件を一括更新します。よろしいですか？`, `Bulk update ${ids.length} rows?`))) return;
      const res = await api.post<any>(`/api/bulk/${entitySelect.value}/bulk-update`, { ids, fields: { [fieldInput.value]: valueInput.value }, confirm: true });
      clear(bulkResult); bulkResult.appendChild(el('div', { class: 'banner banner-info' }, [JSON.stringify(res)]));
      await loadBulkRows();
    }}, [L('選択行を一括更新', 'Bulk update selected')]),
    el('button', { class: 'btn btn-danger', onClick: async () => {
      const ids = selectedBulkArray();
      if (!ids.length) return alert(L('行を選択してください。', 'Select rows first.'));
      if (!confirm(L(`${ids.length}件を一括削除します。よろしいですか？`, `Bulk delete/archive ${ids.length} rows?`))) return;
      const res = await api.post<any>(`/api/bulk/${entitySelect.value}/bulk-delete`, { ids, confirm: true });
      clear(bulkResult); bulkResult.appendChild(el('div', { class: 'banner banner-info' }, [JSON.stringify(res)]));
      await loadBulkRows();
    }}, [L('選択行を一括削除', 'Bulk delete selected')]),
    el('button', { class: 'btn btn-danger', onClick: async () => {
      if (!monthInput.value || !sourceInput.value) return alert(L('取込元と対象月を入力してください。', 'Enter source and month.'));
      if (!confirm(L(`${sourceInput.value} / ${monthInput.value} の取込済み明細を削除します。`, `Delete imported expenses for ${sourceInput.value} / ${monthInput.value}?`))) return;
      const res = await api.post<any>('/api/bulk/expenses/delete-imported-month', { source: sourceInput.value, month: monthInput.value, confirm: true });
      clear(bulkResult); bulkResult.appendChild(el('div', { class: 'banner banner-info' }, [JSON.stringify(res)]));
    }}, [L('月ごとの取込明細を削除', 'Delete imported month')]),
  ]));
  bulkSec.appendChild(bulkResult);
  bulkSec.appendChild(bulkRows);
  root.appendChild(bulkSec);
  loadBulkEntities().catch((e) => bulkResult.appendChild(el('div', { class: 'banner banner-error' }, [String(e.message || e)])));

  const commandSec = el('div', { class: 'card' });
  commandSec.appendChild(el('h3', {}, [L('運用コマンド（プレビュー式）','Operation Commands (preview first)')]));
  commandSec.appendChild(el('div', { class: 'muted' }, [L('例: 「JALCardの締め日を5日に変更」「毎月27日にPayPal支払い15000円を追加」。実行前に必ずプレビューします。','Examples: “Change JALCard closing day to 5” or “Add a PayPal payment of 15,000 every month on the 27th.” Always preview before committing.')]));
  const commandInput = el('textarea', { rows: '3', placeholder: L('ここにテキスト命令を入力','Enter an operation command here') }) as HTMLTextAreaElement;
  const commandResult = el('pre', { class: 'code-block' });
  const previewBtn = el('button', { class: 'primary', onClick: async () => {
    try {
      const res = await api.post<any>('/api/commands/preview', { command: commandInput.value });
      commandResult.textContent = JSON.stringify(res, null, 2);
      commandResult.dataset.commandId = String(res.id);
    } catch (e: any) { commandResult.textContent = `ERROR: ${e.message}`; }
  }}, [t('common.preview')]);
  const commitBtn = el('button', { class: 'ghost', onClick: async () => {
    const id = commandResult.dataset.commandId;
    if (!id) return alert(L('先にプレビューしてください','Preview first'));
    if (!confirm(L('プレビュー内容を確定しますか？','Commit the previewed operation?'))) return;
    try {
      const res = await api.post<any>(`/api/commands/${id}/commit`, { confirm: true });
      commandResult.textContent = JSON.stringify(res, null, 2);
    } catch (e: any) { commandResult.textContent = `ERROR: ${e.message}`; }
  }}, [L('確定実行','Commit')]);
  commandSec.appendChild(commandInput);
  commandSec.appendChild(el('div', { class: 'row-flex' }, [previewBtn, commitBtn]));
  commandSec.appendChild(commandResult);
  root.appendChild(commandSec);

}

export function renderDiag(root: HTMLElement) {
  clear(root);
  root.appendChild(el('h2', {}, [t('tab.diag')]));
  const content = el('div', {});
  root.appendChild(content);

  (async () => {
    content.appendChild(el('div', { class: 'muted' }, [t('common.loading')]));
    try {
      const [health, summary, tables, migrations, checklist] = await Promise.all([
        api.get<any>('/api/health'),
        api.get<any>('/api/diag/summary'),
        api.get<any>('/api/diag/tables'),
        api.get<any>('/api/diag/migrations'),
        api.get<any>('/api/diag/checklist'),
      ]);
      clear(content);

      // ヘルス
      const h = el('div', { class: 'card' }, [el('h3', {}, [t('diag.health')])]);
      const banner = el('div', { class: 'banner ' + (health.status === 'ok' ? 'banner-info' : 'banner-error') });
      banner.textContent = `status: ${health.status} / env: ${health.env} / version: ${health.version} / build: ${health.build} / write: ${health.write_enabled} / db: ${health.db.ok ? 'ok' : 'NG'}`;
      h.appendChild(banner);
      content.appendChild(h);

      // サマリ
      const s = el('div', { class: 'card' }, [el('h3', {}, [t('diag.summary')])]);
      const tbl = el('div', { class: 'table-wrap' });
      const tab = el('table', { class: 'data' });
      tab.innerHTML = `<thead><tr><th>${L('テーブル','Table')}</th><th class="num">${L('件数','Count')}</th></tr></thead>`;
      const tbody = el('tbody', {});
      for (const [k, v] of Object.entries(summary)) {
        tbody.appendChild(el('tr', {}, [el('td', {}, [k]), el('td', { class: 'num' }, [String(v)])]));
      }
      tab.appendChild(tbody);
      tbl.appendChild(tab);
      s.appendChild(tbl);
      content.appendChild(s);

      // テーブル一覧
      const t2 = el('div', { class: 'card' }, [el('h3', {}, [t('diag.tables')])]);
      const tbl2 = el('div', { class: 'table-wrap' });
      const tab2 = el('table', { class: 'data' });
      tab2.innerHTML = `<thead><tr><th>${L('テーブル名','Table name')}</th><th class="num">${L('件数','Count')}</th></tr></thead>`;
      const tb2 = el('tbody', {});
      for (const r of tables.tables) {
        tb2.appendChild(el('tr', {}, [el('td', {}, [r.name]), el('td', { class: 'num' }, [String(r.count)])]));
      }
      tab2.appendChild(tb2);
      tbl2.appendChild(tab2);
      t2.appendChild(tbl2);
      content.appendChild(t2);

      // マイグレーション状態
      const mig = el('div', { class: 'card' }, [el('h3', {}, [L('マイグレーション','Migrations')])]);
      const migWrap = el('div', { class: 'table-wrap' });
      const migTable = el('table', { class: 'data compact-table' });
      migTable.innerHTML = `<thead><tr><th>ID</th><th>Name</th><th>Applied At</th></tr></thead>`;
      const migBody = el('tbody', {});
      for (const r of (migrations.migrations || [])) {
        migBody.appendChild(el('tr', {}, [
          el('td', { class: 'num' }, [String(r.id ?? '')]),
          el('td', {}, [String(r.name ?? r.migration_name ?? '')]),
          el('td', {}, [String(r.applied_at ?? '')]),
        ]));
      }
      migTable.appendChild(migBody);
      migWrap.appendChild(migTable);
      mig.appendChild(migWrap);
      content.appendChild(mig);

      // Phase6 requirement checklist
      const chk = el('div', { class: 'card' }, [el('h3', {}, [L('要件チェック','Requirement Checklist')])]);
      chk.appendChild(el('div', { class: 'banner banner-info' }, [`billing: ${checklist.policies?.billing_month_policy || ''} / canonical: ${checklist.policies?.canonical_expense_source || ''} / mortgage: ${checklist.policies?.mortgage_schedule_source || ''}`]));
      const chkWrap = el('div', { class: 'table-wrap' });
      const chkTable = el('table', { class: 'data compact-table' });
      chkTable.innerHTML = `<thead><tr><th>${L('チェック','Check')}</th><th>OK</th><th>${L('メモ','Note')}</th></tr></thead>`;
      const chkBody = el('tbody', {});
      for (const r of (checklist.checks || [])) {
        chkBody.appendChild(el('tr', { class: r.ok ? '' : 'warn-row' }, [
          el('td', {}, [String(r.key)]),
          el('td', {}, [r.ok ? 'OK' : 'NG']),
          el('td', {}, [String(r.note || '')]),
        ]));
      }
      chkTable.appendChild(chkBody);
      chkWrap.appendChild(chkTable);
      chk.appendChild(chkWrap);
      content.appendChild(chk);

    } catch (e: any) {
      clear(content);
      content.appendChild(el('div', { class: 'banner banner-error' }, [`${L('エラー','Error')}: ${e.message}`]));
    }
  })();
}
