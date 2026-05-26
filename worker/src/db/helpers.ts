/**
 * D1 / SQLite の安全操作ヘルパー。
 *
 * 過去の事故とその対策：
 * - "too many SQL variables" → SQLITE_MAX_VARIABLE_NUMBER は通常 999。
 *   ここでは安全マージンを取って 1チャンクあたり最大 50 行 × 列数 で計算する。
 * - 二重計上 → idempotency key 用の UNIQUE 制約と ON CONFLICT 利用を支援。
 * - DROP TABLE / DELETE without WHERE → このヘルパーから直接は流せないようにし、
 *   呼び出し側で必ず明示的に書かせる。
 */

const MAX_VARS_PER_QUERY = 800; // 999 から余裕を持たせる

/**
 * バルクINSERT。columns の数 × 行数が MAX_VARS を超えないようチャンク化する。
 * 各チャンクは batch() で並列実行される。
 */
export async function bulkInsert(
  db: D1Database,
  table: string,
  columns: string[],
  rows: any[][],
  options: { onConflict?: string } = {}
): Promise<{ inserted: number; chunks: number }> {
  if (rows.length === 0) return { inserted: 0, chunks: 0 };

  const colsPerRow = columns.length;
  if (colsPerRow === 0) throw new Error('bulkInsert: columns must not be empty');

  const rowsPerChunk = Math.max(1, Math.floor(MAX_VARS_PER_QUERY / colsPerRow));
  const chunks: any[][][] = [];
  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    chunks.push(rows.slice(i, i + rowsPerChunk));
  }

  const colList = columns.map((c) => `"${c}"`).join(', ');
  const onConflict = options.onConflict ? ` ${options.onConflict}` : '';

  let totalInserted = 0;
  for (const chunk of chunks) {
    const valuesPlaceholder = chunk
      .map(() => `(${columns.map(() => '?').join(', ')})`)
      .join(', ');
    const sql = `INSERT INTO "${table}" (${colList}) VALUES ${valuesPlaceholder}${onConflict}`;
    const flatValues = chunk.flat();
    const result = await db.prepare(sql).bind(...flatValues).run();
    totalInserted += result.meta?.changes ?? chunk.length;
  }

  return { inserted: totalInserted, chunks: chunks.length };
}

/**
 * 単純な SELECT 全件。列名を指定可。
 */
export async function selectAll<T = any>(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results ?? [];
}

/**
 * 1件取得。なければ null。
 */
export async function selectOne<T = any>(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<T | null> {
  const result = await db.prepare(sql).bind(...params).first<T>();
  return result ?? null;
}

/**
 * 安全な実行。WHERE 句が必須なメソッドを強制する。
 */
export async function exec(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<D1Result> {
  // 安全チェック：DELETE/UPDATE で WHERE が無いものを拒否（FROM 全体を消す事故対策）
  const trimmed = sql.trim().toUpperCase();
  if ((trimmed.startsWith('DELETE') || trimmed.startsWith('UPDATE')) &&
      !trimmed.includes('WHERE')) {
    throw new Error('exec(): DELETE/UPDATE without WHERE is forbidden by the safety layer');
  }
  if (trimmed.startsWith('DROP TABLE')) {
    throw new Error('exec(): DROP TABLE is forbidden by the safety layer');
  }
  return await db.prepare(sql).bind(...params).run();
}

/**
 * idempotency key で重複登録を防ぐINSERT。
 * 同じ (source_type, source_id, owner, month) は1回しか作らない。
 */
export async function idempotentLink(
  db: D1Database,
  args: {
    source_type: string;
    source_id: number | string;
    owner: string;
    month: string;
    amount: number;
    expense_id: number;
  }
): Promise<{ created: boolean; id: number }> {
  const existing = await selectOne<{ id: number }>(
    db,
    `SELECT id FROM ledger_links
     WHERE source_type = ? AND source_id = ? AND owner = ? AND month = ?`,
    [args.source_type, args.source_id, args.owner, args.month]
  );
  if (existing) {
    return { created: false, id: existing.id };
  }
  const r = await db
    .prepare(
      `INSERT INTO ledger_links
       (source_type, source_id, owner, month, amount, expense_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      args.source_type,
      args.source_id,
      args.owner,
      args.month,
      args.amount,
      args.expense_id
    )
    .run();
  return { created: true, id: r.meta.last_row_id as number };
}
