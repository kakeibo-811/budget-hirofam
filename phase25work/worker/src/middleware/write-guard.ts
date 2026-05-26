import type { Context, Next } from 'hono';
import type { Env, Variables } from '../index';

/**
 * WRITE_ENABLED が "true" でない限り、書き込みメソッドを 423 Locked で拒否。
 * これにより、本番に未検証コードを乗せても、書き込みは絶対に動かない。
 *
 * 例外：
 * - /api/diag/* は書き込みでも通す（バックアップなどの管理操作）
 * - GET / HEAD / OPTIONS は常に通す
 */
export async function writeGuard(
  c: Context<{ Bindings: Env; Variables: Variables }>,
  next: Next
) {
  const method = c.req.method;
  const isWrite = method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';

  if (!isWrite) return next();

  // POSTだが読み取り系のプレビューは常に許可する。
  // CSV取り込みの列判定・件数確認はDBを書き換えないため、
  // WRITE_ENABLED=false の検証中でも使えるようにする。
  if (c.req.path === '/api/assets/import/preview') return next();
  if (c.req.path === '/api/expenses/import/preview') return next();

  // 診断系は管理操作なので別ガード
  if (c.req.path.startsWith('/api/diag/')) return next();

  if (c.env.WRITE_ENABLED !== 'true') {
    return c.json(
      {
        error: 'Write operations are disabled',
        detail: 'WRITE_ENABLED feature flag is off. Enable it in wrangler.toml when ready.',
        code: 'WRITE_DISABLED',
      },
      423
    );
  }

  return next();
}
