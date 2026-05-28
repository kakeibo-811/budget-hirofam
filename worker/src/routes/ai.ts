import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectAll } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

type AiMode = 'summary' | 'spec';

function cleanMonth(v: any): string {
  const s = String(v || '').trim();
  return /^\d{4}-\d{2}$/.test(s) ? s : new Date().toISOString().slice(0, 7);
}

function cleanMode(v: any): AiMode {
  return String(v || '').toLowerCase() === 'spec' ? 'spec' : 'summary';
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
    model: c.env.OPENAI_MODEL || 'gpt-5.4-mini',
  });
});

app.post('/ask', async (c) => {
  if (!c.env.OPENAI_API_KEY) {
    return c.json({ error: 'AI is not configured. Set OPENAI_API_KEY as a Cloudflare Worker secret for Preview.' }, 503);
  }
  const body = await c.req.json<any>();
  const month = cleanMonth(body.month);
  const mode = cleanMode(body.mode);
  const context = await buildContext(c, month);
  const model = c.env.OPENAI_MODEL || 'gpt-5.4-mini';
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
  return c.json({ month, mode, model, answer: extractText(data) });
});

export default app;
