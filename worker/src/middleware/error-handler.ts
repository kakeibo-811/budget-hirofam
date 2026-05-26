import type { Context } from 'hono';
import type { Env, Variables } from '../index';

/**
 * 過去の事故対策：
 * - APIエラー500をそのまま返さず、ユーザー向け説明を載せる
 * - too many SQL variables などの SQLite/D1 エラーを判別してメッセージ化
 */
export function errorHandler(
  err: Error,
  c: Context<{ Bindings: Env; Variables: Variables }>
) {
  const msg = err.message ?? String(err);

  // D1 / SQLite のよくあるエラーをユーザー向け文言に翻訳
  if (msg.includes('too many SQL variables')) {
    return c.json(
      {
        error: '一括処理のサイズが大きすぎます。CSV取り込みなら一度に取り込む件数を減らしてください。',
        detail: msg,
        code: 'D1_TOO_MANY_VARS',
      },
      400
    );
  }
  if (msg.includes('UNIQUE constraint failed')) {
    return c.json(
      {
        error: '同じデータが既に登録されています。重複登録は防止されました。',
        detail: msg,
        code: 'D1_UNIQUE_CONSTRAINT',
      },
      409
    );
  }
  if (msg.includes('FOREIGN KEY constraint failed')) {
    return c.json(
      {
        error: '関連するデータが見つかりません。先に親データを作成してください。',
        detail: msg,
        code: 'D1_FK_CONSTRAINT',
      },
      400
    );
  }
  if (msg.includes('no such table')) {
    return c.json(
      {
        error: 'データベースの初期化が未完了です。マイグレーションを実行してください。',
        detail: msg,
        code: 'D1_NO_TABLE',
      },
      503
    );
  }

  console.error('[unhandled]', err);
  return c.json(
    {
      error: 'サーバー内部でエラーが発生しました。時間をおいて再度お試しください。',
      detail: c.env.APP_ENV === 'production' ? undefined : msg,
      code: 'INTERNAL_ERROR',
    },
    500
  );
}
