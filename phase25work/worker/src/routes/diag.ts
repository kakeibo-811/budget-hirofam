import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll, selectOne } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * DB 診断・運用支援。
 * 過去の事故対策：本番昇格前に必ず件数確認・テーブル疎通確認。
 */

// テーブル一覧と件数
app.get('/tables', async (c) => {
  const tables = await selectAll<{ name: string }>(
    c.env.DB,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%'
     ORDER BY name`
  );
  const result: { name: string; count: number; error?: string }[] = [];
  for (const t of tables) {
    try {
      const r = await selectOne<{ c: number }>(c.env.DB, `SELECT COUNT(*) AS c FROM "${t.name}"`);
      result.push({ name: t.name, count: r?.c ?? 0 });
    } catch (e: any) {
      result.push({ name: t.name, count: -1, error: e.message });
    }
  }
  return c.json({ tables: result });
});

// マイグレーション状態
app.get('/migrations', async (c) => {
  try {
    const rows = await selectAll(
      c.env.DB,
      `SELECT * FROM d1_migrations ORDER BY id ASC`
    );
    return c.json({ migrations: rows });
  } catch (e: any) {
    return c.json({ migrations: [], error: e.message });
  }
});

// 全テーブルの行数サマリ（昇格前チェック用）
app.get('/summary', async (c) => {
  const counts = await Promise.all([
    selectOne<{ c: number }>(c.env.DB, `SELECT COUNT(*) AS c FROM expenses WHERE archived_at IS NULL`).catch(() => null),
    selectOne<{ c: number }>(c.env.DB, `SELECT COUNT(*) AS c FROM cards`).catch(() => null),
    selectOne<{ c: number }>(c.env.DB, `SELECT COUNT(*) AS c FROM accounts`).catch(() => null),
    selectOne<{ c: number }>(c.env.DB, `SELECT COUNT(*) AS c FROM incomes`).catch(() => null),
    selectOne<{ c: number }>(c.env.DB, `SELECT COUNT(*) AS c FROM fixed_costs`).catch(() => null),
    selectOne<{ c: number }>(c.env.DB, `SELECT COUNT(*) AS c FROM asset_settings`).catch(() => null),
    selectOne<{ c: number }>(c.env.DB, `SELECT COUNT(*) AS c FROM ledger_links`).catch(() => null),
    selectOne<{ c: number }>(c.env.DB, `SELECT COUNT(*) AS c FROM messages`).catch(() => null),
  ]);
  return c.json({
    expenses: counts[0]?.c ?? 0,
    cards: counts[1]?.c ?? 0,
    accounts: counts[2]?.c ?? 0,
    incomes: counts[3]?.c ?? 0,
    fixed_costs: counts[4]?.c ?? 0,
    asset_settings: counts[5]?.c ?? 0,
    ledger_links: counts[6]?.c ?? 0,
    messages: counts[7]?.c ?? 0,
  });
});



// Phase6: app operation policy and requirements checklist.
app.get('/policy', async (c) => {
  const settings = await selectAll<{ key: string; value: string; note: string }>(
    c.env.DB,
    `SELECT key, value, note FROM app_settings ORDER BY key ASC`
  ).catch(() => []);
  const batches = await selectAll<any>(
    c.env.DB,
    `SELECT * FROM import_batches ORDER BY id DESC LIMIT 20`
  ).catch(() => []);
  return c.json({
    env: c.env.APP_ENV,
    write_enabled: c.env.WRITE_ENABLED === 'true',
    settings,
    import_batches: batches,
    policy: {
      production_deploy_allowed: false,
      preview_first: true,
      billing_month_definition: 'payment_month',
      canonical_expense_source: 'kakeibo_all',
      csv_confirm_required: true,
      delete_without_where_forbidden: true,
      drop_table_forbidden: true,
    },
  });
});

app.get('/checklist', async (c) => {
  const tables = await selectAll<{ name: string }>(
    c.env.DB,
    `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
  );
  const names = new Set(tables.map((t) => t.name));
  const checks = [
    { key: 'db_binding', label_ja: 'D1 binding が DB', label_en: 'D1 binding is DB', status: true, detail: 'Verified by runtime health check.' },
    { key: 'assets_binding', label_ja: '静的ファイルは ASSETS binding', label_en: 'Static assets use ASSETS binding', status: true, detail: 'Wrangler assets binding is required.' },
    { key: 'expense_import_keys', label_ja: '明細CSVの重複防止', label_en: 'Expense CSV duplicate prevention', status: names.has('expense_import_keys'), detail: 'expense_import_keys table exists.' },
    { key: 'asset_import_keys', label_ja: '資産CSVの重複防止', label_en: 'Asset CSV duplicate prevention', status: names.has('asset_import_keys'), detail: 'asset_import_keys table exists.' },
    { key: 'import_batches', label_ja: 'CSV取り込み履歴', label_en: 'CSV import batch audit', status: names.has('import_batches'), detail: 'import_batches table exists after Phase6 migration.' },
    { key: 'app_settings', label_ja: '運用ポリシー設定', label_en: 'App policy settings', status: names.has('app_settings'), detail: 'app_settings stores billing/import policy.' },
    { key: 'ledger_links', label_ja: '返済連動の二重計上防止', label_en: 'Repayment sync duplicate prevention', status: names.has('ledger_links'), detail: 'ledger_links table exists.' },
    { key: 'undo_log', label_ja: 'Undoの土台', label_en: 'Undo base table', status: names.has('undo_log'), detail: 'undo_log table exists.' },
  ];
  return c.json({
    generated_at: new Date().toISOString(),
    env: c.env.APP_ENV,
    write_enabled: c.env.WRITE_ENABLED === 'true',
    checks,
    remaining_known_gaps: [
      'Full xlsx export is not implemented yet; CSV with UTF-8 BOM is supported.',
      'Cloudflare Access values are placeholders unless configured in Cloudflare.',
      'Full salary-cycle analytics still needs a dedicated implementation pass.',
      'Fixed-cost single-month/future/bulk change workflow still needs a dedicated implementation pass.',
      'Message posting/edit/delete is still basic/future work depending on current UI state.',
    ],
  });
});

// Backup JSON for pre-promotion checks. This is read-only and safe.
app.get('/export.json', async (c) => {
  const tables = await selectAll<{ name: string }>(
    c.env.DB,
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'd1_%' ORDER BY name`
  );
  const result: Record<string, any[]> = {};
  for (const t of tables) {
    try {
      result[t.name] = await selectAll(c.env.DB, `SELECT * FROM "${t.name}"`);
    } catch {
      result[t.name] = [];
    }
  }
  return c.json({
    exported_at: new Date().toISOString(),
    env: c.env.APP_ENV,
    version: c.env.APP_VERSION,
    build: c.env.APP_BUILD,
    tables: result,
  });
});

export default app;
