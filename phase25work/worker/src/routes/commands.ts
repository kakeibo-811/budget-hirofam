import { Hono } from 'hono';
import type { Env, Variables } from '../index';
import { selectOne, exec } from '../db/helpers';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

function parseAmount(text: string): number | null {
  const m = text.replace(/[,，]/g, '').match(/(\d+)\s*(万)?\s*円?/);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2] === '万' ? n * 10000 : n;
}
function parseDay(text: string): number | null {
  if (/月末/.test(text)) return 31;
  const m = text.match(/(\d{1,2})\s*日/);
  if (!m) return null;
  const d = Number(m[1]);
  return d >= 1 && d <= 31 ? d : null;
}

app.post('/preview', async (c) => {
  const b = await c.req.json<{ command?: string }>();
  const command = String(b.command || '').trim();
  let parsed: any = { action: 'unsupported', confidence: 0.2, message: 'まだ対応していない命令です。プレビューだけ記録します。' };

  const cardMatch = command.match(/(.+?)(カード|Card|card)?.*(締め日|支払日).*/);
  if (cardMatch) {
    const day = parseDay(command);
    const field = command.includes('締め') ? 'close_day' : 'pay_day';
    const name = cardMatch[1].replace(/の|を|カード|Card|card/g, '').trim();
    const card = await selectOne<any>(c.env.DB, `SELECT * FROM cards WHERE archived_at IS NULL AND LOWER(name) LIKE LOWER(?) LIMIT 1`, [`%${name}%`]);
    parsed = { action: 'update_card', confidence: card && day ? 0.85 : 0.4, target: card, field, value: day, before: card ? card[field] : null, message: card && day ? `${card.name} の ${field} を ${day} に変更します。` : 'カード名または日付を特定できませんでした。' };
  }

  const paymentLike = /(定期|支払|引き落とし|引落|送金|PayPal|paypal)/i.test(command) && /(追加|登録)/.test(command);
  if (paymentLike && parsed.action === 'unsupported') {
    const amount = parseAmount(command);
    const day = parseDay(command);
    const paid_by = /妻/.test(command) ? 'lisa' : 'toshi';
    const burden_owner = /妻負担/.test(command) ? 'lisa' : /夫負担/.test(command) ? 'toshi' : 'shared';
    parsed = { action: 'create_scheduled_payment', confidence: amount && day ? 0.75 : 0.35, draft: { name: command.slice(0, 40), amount, frequency: 'monthly', due_day: day, paid_by, burden_owner, split: burden_owner === 'shared' ? 1 : 0 }, message: amount && day ? '支払予定を追加できます。内容を確認してください。' : '金額または支払日が不足しています。' };
  }

  const r = await c.env.DB.prepare(`INSERT INTO operation_commands (command_text, parsed_action, preview_json, status) VALUES (?, ?, ?, 'preview')`).bind(command, parsed.action, JSON.stringify(parsed)).run();
  return c.json({ id: r.meta.last_row_id, command, parsed });
});

app.post('/:id/commit', async (c) => {
  const id = Number(c.req.param('id'));
  const row = await selectOne<any>(c.env.DB, `SELECT * FROM operation_commands WHERE id = ?`, [id]);
  if (!row) return c.json({ error: 'not found' }, 404);
  const parsed = JSON.parse(row.preview_json || '{}');
  if (parsed.action === 'update_card' && parsed.target?.id && parsed.field && parsed.value) {
    await exec(c.env.DB, `UPDATE cards SET ${parsed.field} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [parsed.value, parsed.target.id]);
  } else if (parsed.action === 'create_scheduled_payment' && parsed.draft?.amount && parsed.draft?.due_day) {
    const d = parsed.draft;
    await c.env.DB.prepare(`INSERT INTO scheduled_payments (name, amount, frequency, due_day, paid_by, burden_owner, split, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(d.name, d.amount, d.frequency || 'monthly', d.due_day, d.paid_by || 'toshi', d.burden_owner || 'shared', d.split ? 1 : 0, row.command_text).run();
  } else {
    await exec(c.env.DB, `UPDATE operation_commands SET status = 'unsupported' WHERE id = ?`, [id]);
    return c.json({ error: 'unsupported command', parsed }, 400);
  }
  await exec(c.env.DB, `UPDATE operation_commands SET status = 'committed', committed_at = CURRENT_TIMESTAMP WHERE id = ?`, [id]);
  return c.json({ ok: true, parsed });
});

export default app;
