import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

/**
 * CSVエクスポート - UTF-8 BOM 付きで文字化け防止。
 * 取り込み（インポート）はセッション3で実装。
 */

const BOM = '\uFEFF';

function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(headers: string[], rows: any[][]): string {
  const head = headers.map(csvEscape).join(',');
  const body = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  return BOM + head + '\n' + body + '\n';
}

app.get('/expenses.csv', async (c) => {
  const lang = c.req.query('lang') || 'ja';
  const rows = await selectAll<any>(
    c.env.DB,
    `SELECT e.id, e.date, e.amount, e.description, e.payer, e.billing_month,
            c.name AS card_name, e.category, e.note
     FROM expenses e LEFT JOIN cards c ON e.card_id = c.id
     ORDER BY e.date DESC`
  );
  const headers = lang === 'en'
    ? ['ID', 'Date', 'Amount', 'Description', 'Payer', 'Billing Month', 'Card', 'Category', 'Note']
    : ['ID', '日付', '金額', '内容', '支払者', '請求月', 'カード', 'カテゴリ', 'メモ'];
  const csv = rowsToCsv(
    headers,
    rows.map((r) => [r.id, r.date, r.amount, r.description, r.payer, r.billing_month, r.card_name, r.category, r.note])
  );
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="expenses.csv"`,
    },
  });
});

app.get('/settlements.csv', async (c) => {
  const lang = c.req.query('lang') || 'ja';
  const rows = await selectAll<any>(
    c.env.DB,
    `SELECT billing_month AS month,
       SUM(CASE WHEN payer = 'toshi' THEN amount ELSE 0 END) AS toshi,
       SUM(CASE WHEN payer = 'lisa' THEN amount ELSE 0 END) AS lisa,
       SUM(CASE WHEN payer = 'shared' THEN amount ELSE 0 END) AS shared,
       SUM(amount) AS total
     FROM expenses WHERE archived_at IS NULL GROUP BY billing_month ORDER BY billing_month DESC`
  );
  const headers = lang === 'en'
    ? ['Month', 'Toshi', 'Lisa', 'Shared', 'Total']
    : ['請求月', '夫', '妻', '共同', '合計'];
  const csv = rowsToCsv(headers, rows.map((r) => [r.month, r.toshi, r.lisa, r.shared, r.total]));
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="settlements.csv"`,
    },
  });
});

app.get('/assets.csv', async (c) => {
  const lang = c.req.query('lang') || 'ja';
  const rows = await selectAll<any>(
    c.env.DB,
    `SELECT * FROM asset_snapshots ORDER BY month ASC, setting_key ASC`
  );
  const headers = lang === 'en'
    ? ['Month', 'Key', 'Balance', 'Change', 'Note']
    : ['月', '項目', '残高', '増減', 'メモ'];
  const csv = rowsToCsv(headers, rows.map((r) => [r.month, r.setting_key, r.balance, r.delta, r.note]));
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="assets.csv"`,
    },
  });
});

// JSON ダンプ（バックアップ用）
app.get('/dump.json', async (c) => {
  const tables = ['expenses', 'cards', 'accounts', 'account_balances', 'incomes', 'recurring_incomes',
                  'fixed_costs', 'fixed_cost_snapshots', 'asset_settings', 'asset_events',
                  'asset_snapshots', 'ledger_links', 'messages'];
  const result: Record<string, any[]> = {};
  for (const t of tables) {
    try {
      result[t] = await selectAll(c.env.DB, `SELECT * FROM "${t}"`);
    } catch {
      result[t] = [];
    }
  }
  return c.json({
    exported_at: new Date().toISOString(),
    env: c.env.APP_ENV,
    tables: result,
  });
});

export default app;
