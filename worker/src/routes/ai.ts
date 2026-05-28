import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

type AiMode = 'summary' | 'tab_spec';
const defaultModel = 'gpt-5.2';

function cleanMonth(v: any): string {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 7);
}

function cleanMode(v: any): AiMode {
  const s = String(v || '').toLowerCase();
  return s === 'spec' || s === 'tab_spec' ? 'tab_spec' : 'summary';
}

function yen(n: any): string {
  return `¥${Math.round(Number(n || 0)).toLocaleString('ja-JP')}`;
}

function ownerLabel(v: any): string {
  const s = String(v || '').toLowerCase();
  if (s === 'toshi') return '夫';
  if (s === 'lisa') return '妻';
  if (s === 'shared') return '共通';
  return 'その他';
}

async function buildContext(c: any, month: string) {
  const [incomes, expenses, recurringIncomes, fixedSnapshots, scheduledPayments, accounts, assetSettings] = await Promise.all([
    selectAll<any>(c.env.DB, `SELECT id, date, amount, owner, description, kind FROM incomes WHERE archived_at IS NULL AND date LIKE ? ORDER BY date ASC, id ASC LIMIT 200`, [`${month}-%`]),
    selectAll<any>(c.env.DB, `SELECT id, date, payment_due_date, cycle_month, billing_month, amount, description, payer, paid_by, burden_owner, payment_method FROM expenses WHERE archived_at IS NULL AND COALESCE(cycle_month, billing_month) = ? ORDER BY COALESCE(payment_due_date, date) ASC, id ASC LIMIT 300`, [month]),
    selectAll<any>(c.env.DB, `SELECT id, name, owner, amount, pay_day, kind FROM recurring_incomes WHERE active = 1 AND archived_at IS NULL ORDER BY owner ASC, pay_day ASC, id ASC LIMIT 100`),
    selectAll<any>(c.env.DB, `SELECT s.id, s.month, s.amount, s.payment_due_date, s.paid_by, s.burden_owner, f.name, f.pay_day, f.active_from_month, f.active_to_month
       FROM fixed_cost_snapshots s
       JOIN fixed_costs f ON f.id = s.fixed_cost_id
       WHERE s.month = ? AND f.archived_at IS NULL
       ORDER BY COALESCE(s.payment_due_date, printf('%s-%02d', s.month, COALESCE(f.pay_day, 1))) ASC, s.id ASC
       LIMIT 200`, [month]),
    selectAll<any>(c.env.DB, `SELECT id, name, amount, frequency, due_day, due_month, due_date, active_from_month, active_to_month, paid_by, burden_owner, active FROM scheduled_payments WHERE archived_at IS NULL ORDER BY sort_order ASC, id ASC LIMIT 200`),
    selectAll<any>(c.env.DB, `SELECT a.id, a.name, a.owner, a.kind, b.balance, b.as_of_date
       FROM accounts a
       LEFT JOIN account_balances b ON b.id = (SELECT id FROM account_balances WHERE account_id = a.id ORDER BY as_of_date DESC, id DESC LIMIT 1)
       WHERE a.archived_at IS NULL ORDER BY a.sort_order ASC, a.id ASC LIMIT 100`),
    selectAll<any>(c.env.DB, `SELECT key, value FROM asset_rebuild_settings ORDER BY key ASC LIMIT 100`),
  ]);
  const expenseTotal = expenses.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const incomeTotal = incomes.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const fixedTotal = fixedSnapshots.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const accountTotal = accounts.reduce((sum, r) => sum + Number(r.balance || 0), 0);
  const largestExpenses = [...expenses].sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0)).slice(0, 20);
  const byPaymentMethod = expenses.reduce((acc, e) => {
    const key = String(e.payment_method || (e.paid_by ? `paid_by_${e.paid_by}` : 'unspecified'));
    acc[key] = Number(acc[key] || 0) + Number(e.amount || 0);
    return acc;
  }, {} as Record<string, number>);
  return {
    month,
    computed_summary: {
      income_total: incomeTotal,
      expense_total: expenseTotal,
      fixed_total: fixedTotal,
      account_balance_total: accountTotal,
      net_income_minus_expenses: incomeTotal - expenseTotal - fixedTotal,
      expense_by_payment_method: byPaymentMethod,
    },
    incomes,
    recurring_incomes: recurringIncomes,
    expenses,
    largest_expenses: largestExpenses,
    fixed_cost_snapshots: fixedSnapshots,
    scheduled_payments: scheduledPayments,
    accounts,
    asset_settings: assetSettings,
  };
}

function localAnswer(mode: AiMode, question: string, context: any): string {
  const summary = context.computed_summary || {};
  const largest = (context.largest_expenses || []).slice(0, 5);
  const fixed = (context.fixed_cost_snapshots || []).slice(0, 5);
  const accounts = context.accounts || [];
  if (mode === 'tab_spec') {
    return [
      'AIキー未設定のため、現在はアプリ内データだけでタブ仕様変更案を作っています。',
      '',
      `対象月: ${context.month}`,
      `依頼内容: ${question || '指定なし'}`,
      '',
      'タブ仕様変更として扱える範囲:',
      '- 表示項目、文言、並び順、折りたたみ、iPhone表示',
      '- 集計根拠リンク、明細表示、履歴表示',
      '- Dashboard / Timeline / 分析 / 収入 / 固定費 / 資産・負債の連動ルール',
      '',
      '変更案:',
      '1. どのタブを変えるかを明示する。',
      '2. そのタブで見せる数字の根拠を固定する。',
      '3. 他タブへ連動する数値と、連動させない表示専用項目を分ける。',
      '4. Previewで対象月の収入・支出・固定費・Timeline・精算への影響を確認する。',
      '',
      '現在の確認用数値:',
      `- 収入: ${yen(summary.income_total)}`,
      `- 明細支出: ${yen(summary.expense_total)}`,
      `- 固定費: ${yen(summary.fixed_total)}`,
      `- 口座残高合計: ${yen(summary.account_balance_total)}`,
      '',
      'この回答はAI履歴に残ります。本物のAIキーを有効化すると、依頼文からより具体的な画面仕様とテスト観点まで作れます。',
    ].join('\n');
  }
  return [
    'AIキー未設定のため、現在はアプリ内計算による高速サマリーを表示しています。',
    '',
    `対象月: ${context.month}`,
    `収入合計: ${yen(summary.income_total)}`,
    `明細支出合計: ${yen(summary.expense_total)}`,
    `固定費合計: ${yen(summary.fixed_total)}`,
    `収入 - 支出 - 固定費: ${yen(summary.net_income_minus_expenses)}`,
    `口座残高合計: ${yen(summary.account_balance_total)}`,
    '',
    '大きい支出:',
    ...(largest.length ? largest.map((e: any) => `- ${e.payment_due_date || e.date || '-'} ${e.description || e.payment_method || '明細'} ${yen(e.amount)} / ${ownerLabel(e.paid_by || e.payer)}`) : ['- 明細なし']),
    '',
    '固定費の先頭:',
    ...(fixed.length ? fixed.map((f: any) => `- ${f.payment_due_date || `${f.month}-${String(f.pay_day || 1).padStart(2, '0')}`} ${f.name || '固定費'} ${yen(f.amount)} / ${ownerLabel(f.paid_by)}`) : ['- 固定費なし']),
    '',
    accounts.length ? `口座数: ${accounts.length}` : '口座情報なし',
    '',
    'カテゴリー情報は使わず、金額・支払日・支払者・支払方法を中心に要約しています。',
  ].join('\n');
}

function systemPrompt(mode: AiMode): string {
  const base = [
    'You are an AI assistant embedded in a Japanese household budgeting app for Toshi and Lisa.',
    'Use only the provided JSON context. Do not invent transactions, amounts, dates, or rules.',
    'Do not use category-level analysis unless the user explicitly asks for categories.',
    'If evidence is missing or ambiguous, say so clearly.',
    'Settlement transfers and loan repayments between spouses must not be treated as income.',
    'Household expenses are split 50/50 unless the context says otherwise.',
    'Answer in Japanese, concise but specific, with yen amounts and dates when relevant.',
  ].join('\n');
  if (mode === 'tab_spec') {
    return `${base}\nFocus on turning the user request into a safe tab specification change plan. Include affected tabs, screen behavior, calculation impact, risks, and verification points. Do not claim changes were applied.`;
  }
  return `${base}\nFocus on accurate monthly financial summary, unusual movements, cashflow risks, and what to check next.`;
}

function userPrompt(mode: AiMode, question: string, context: any): string {
  return JSON.stringify({
    task: mode === 'tab_spec' ? 'タブ仕様の変更案を作成してください' : '数字のサマリーを作成してください',
    user_request: question || null,
    context,
  });
}

function extractText(data: any): string {
  if (typeof data?.output_text === 'string') return data.output_text;
  const parts: string[] = [];
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n').trim();
}

async function saveHistory(c: any, args: { month: string; mode: AiMode; question: string; answer: string; model: string; configured: boolean }) {
  const r = await c.env.DB.prepare(
    `INSERT INTO ai_history (month, mode, question, answer, model, configured)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(args.month, args.mode, args.question || null, args.answer, args.model, args.configured ? 1 : 0).run();
  return r.meta.last_row_id;
}

app.get('/status', async (c) => {
  return c.json({
    configured: Boolean(c.env.OPENAI_API_KEY),
    model: c.env.OPENAI_MODEL || defaultModel,
    fallback_enabled: true,
    history_enabled: true,
  });
});

app.get('/history', async (c) => {
  const rows = await selectAll<any>(c.env.DB, `SELECT id, month, mode, question, answer, model, configured, created_at
     FROM ai_history ORDER BY created_at DESC, id DESC LIMIT 50`);
  return c.json({ items: rows });
});

app.post('/ask', async (c) => {
  const body = await c.req.json<any>();
  const month = cleanMonth(body.month);
  const mode = cleanMode(body.mode);
  const question = String(body.question || '');
  const context = await buildContext(c, month);
  if (!c.env.OPENAI_API_KEY) {
    const answer = localAnswer(mode, question, context);
    const id = await saveHistory(c, { month, mode, question, answer, model: 'local-summary', configured: false });
    return c.json({ id, month, mode, configured: false, model: 'local-summary', answer });
  }
  const model = c.env.OPENAI_MODEL || defaultModel;
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        { role: 'system', content: systemPrompt(mode) },
        { role: 'user', content: userPrompt(mode, question, context) },
      ],
      max_output_tokens: 1200,
    }),
  });
  const data = await res.json<any>();
  if (!res.ok) {
    return c.json({ error: data?.error?.message || `OpenAI API error ${res.status}` }, 502);
  }
  const answer = extractText(data);
  const id = await saveHistory(c, { month, mode, question, answer, model, configured: true });
  return c.json({ id, month, mode, configured: true, model, answer });
});

export default app;
