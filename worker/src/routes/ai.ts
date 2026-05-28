import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

type AiMode = 'summary' | 'spec';
const defaultModel = 'gpt-5.2';

function cleanMonth(v: any): string {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 7);
}

function cleanMode(v: any): AiMode {
  return String(v || '').toLowerCase() === 'spec' ? 'spec' : 'summary';
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
    selectAll<any>(c.env.DB, `SELECT id, date, payment_due_date, cycle_month, billing_month, amount, description, category, payer, paid_by, burden_owner, payment_method FROM expenses WHERE archived_at IS NULL AND COALESCE(cycle_month, billing_month) = ? ORDER BY COALESCE(payment_due_date, date) ASC, id ASC LIMIT 300`, [month]),
    selectAll<any>(c.env.DB, `SELECT id, name, owner, amount, pay_day, kind FROM recurring_incomes WHERE active = 1 AND archived_at IS NULL ORDER BY owner ASC, pay_day ASC, id ASC LIMIT 100`),
    selectAll<any>(c.env.DB, `SELECT s.id, s.month, s.amount, s.payment_due_date, s.paid_by, s.burden_owner, f.name, f.category, f.pay_day, f.active_from_month, f.active_to_month
       FROM fixed_cost_snapshots s
       JOIN fixed_costs f ON f.id = s.fixed_cost_id
       WHERE s.month = ? AND f.archived_at IS NULL
       ORDER BY COALESCE(s.payment_due_date, printf('%s-%02d', s.month, COALESCE(f.pay_day, 1))) ASC, s.id ASC
       LIMIT 200`, [month]),
    selectAll<any>(c.env.DB, `SELECT id, name, amount, frequency, due_day, due_month, due_date, active_from_month, active_to_month, paid_by, burden_owner, category, active FROM scheduled_payments WHERE archived_at IS NULL ORDER BY sort_order ASC, id ASC LIMIT 200`),
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
  return {
    month,
    computed_summary: {
      income_total: incomeTotal,
      expense_total: expenseTotal,
      fixed_total: fixedTotal,
      account_balance_total: accountTotal,
      net_income_minus_expenses: incomeTotal - expenseTotal - fixedTotal,
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
  if (mode === 'spec') {
    return [
      'AIキーが未設定のため、現在はアプリ内データだけで仕様変更案を作っています。',
      '',
      `対象月: ${context.month}`,
      `依頼内容: ${question || '指定なし'}`,
      '',
      '進め方:',
      '1. 変更したい仕様を、対象タブ・入力項目・反映先の数値に分けて整理します。',
      '2. ダッシュボード、精算、分析、Timeline、資産・負債への影響を確認します。',
      '3. 元データを壊さない形で、Preview限定で実装・検証します。',
      '',
      '確認すべき主な連動先:',
      `- 収入: ${yen(summary.income_total)}`,
      `- 明細支出: ${yen(summary.expense_total)}`,
      `- 固定費: ${yen(summary.fixed_total)}`,
      `- 口座残高合計: ${yen(summary.account_balance_total)}`,
      '',
      '本物のAIを有効化すると、この依頼内容をもとに、より具体的な改修仕様・リスク・テスト観点まで文章化できます。',
    ].join('\n');
  }
  return [
    'AIキーが未設定のため、現在はアプリ内計算による高速サマリーを表示しています。',
    '',
    `対象月: ${context.month}`,
    `収入合計: ${yen(summary.income_total)}`,
    `明細支出合計: ${yen(summary.expense_total)}`,
    `固定費合計: ${yen(summary.fixed_total)}`,
    `収入 - 支出 - 固定費: ${yen(summary.net_income_minus_expenses)}`,
    `口座残高合計: ${yen(summary.account_balance_total)}`,
    '',
    '大きい支出:',
    ...(largest.length ? largest.map((e: any) => `- ${e.payment_due_date || e.date || '-'} ${e.description || e.category || '明細'} ${yen(e.amount)} / ${ownerLabel(e.paid_by || e.payer)}`) : ['- 明細なし']),
    '',
    '固定費の先頭:',
    ...(fixed.length ? fixed.map((f: any) => `- ${f.payment_due_date || `${f.month}-${String(f.pay_day || 1).padStart(2, '0')}`} ${f.name || '固定費'} ${yen(f.amount)} / ${ownerLabel(f.paid_by)}`) : ['- 固定費なし']),
    '',
    accounts.length ? `口座数: ${accounts.length}` : '口座情報なし',
    '',
    '本物のAIを有効化すると、この数字を根拠に、異常値・改善点・仕様変更案まで自然文で分析できます。',
  ].join('\n');
}

function systemPrompt(mode: AiMode): string {
  const base = [
    'You are an AI assistant embedded in a Japanese household budgeting app for Toshi and Lisa.',
    'Use only the provided JSON context. Do not invent transactions, amounts, dates, or rules.',
    'If evidence is missing or ambiguous, say so clearly.',
    'Settlement transfers and loan repayments between spouses must not be treated as income.',
    'Household expenses are split 50/50 unless the context says otherwise.',
    'Answer in Japanese, concise but specific, with yen amounts and dates when relevant.',
  ].join('\n');
  if (mode === 'spec') {
    return `${base}\nFocus on turning the user request into a safe implementation/spec change plan. Include affected tabs, calculation impact, risks, and verification points. Do not claim changes were applied.`;
  }
  return `${base}\nFocus on accurate monthly financial summary, unusual movements, cashflow risks, and what to check next.`;
}

function userPrompt(mode: AiMode, question: string, context: any): string {
  return JSON.stringify({
    task: mode === 'spec' ? '仕様変更案を作成してください' : '数字のサマリーを作成してください',
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

app.get('/status', async (c) => {
  return c.json({
    configured: Boolean(c.env.OPENAI_API_KEY),
    model: c.env.OPENAI_MODEL || defaultModel,
    fallback_enabled: true,
  });
});

app.post('/ask', async (c) => {
  const body = await c.req.json<any>();
  const month = cleanMonth(body.month);
  const mode = cleanMode(body.mode);
  const context = await buildContext(c, month);
  if (!c.env.OPENAI_API_KEY) {
    return c.json({
      month,
      mode,
      configured: false,
      model: 'local-summary',
      answer: localAnswer(mode, String(body.question || ''), context),
    });
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
        { role: 'user', content: userPrompt(mode, String(body.question || ''), context) },
      ],
      max_output_tokens: 1200,
    }),
  });
  const data = await res.json<any>();
  if (!res.ok) {
    return c.json({ error: data?.error?.message || `OpenAI API error ${res.status}` }, 502);
  }
  return c.json({ month, mode, configured: true, model, answer: extractText(data) });
});

export default app;
