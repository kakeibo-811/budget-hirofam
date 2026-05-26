-- ============================================================
-- Budget HiroFam - Initial Schema
-- 過去の事故を踏まえた設計：
-- - UNIQUE制約で二重計上防止（ledger_links）
-- - archived_at で論理削除（DELETE安全化）
-- - locked カラムで過去月ロック（固定費snapshot）
-- - インデックス充実で検索高速化
-- ============================================================

-- カード
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner TEXT NOT NULL CHECK(owner IN ('toshi', 'lisa', 'shared')),
  close_day INTEGER NOT NULL CHECK(close_day BETWEEN 1 AND 31),
  pay_day INTEGER NOT NULL CHECK(pay_day BETWEEN 1 AND 31),
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_cards_owner ON cards(owner);
CREATE INDEX IF NOT EXISTS idx_cards_archived ON cards(archived_at);

-- 口座
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner TEXT NOT NULL CHECK(owner IN ('toshi', 'lisa', 'shared')),
  kind TEXT NOT NULL CHECK(kind IN ('bank', 'cash', 'wallet', 'paypal', 'other')),
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_accounts_owner ON accounts(owner);

-- 口座残高履歴
CREATE TABLE IF NOT EXISTS account_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  as_of_date TEXT NOT NULL,
  balance INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_account_balances_account ON account_balances(account_id, as_of_date DESC);

-- 明細
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  description TEXT NOT NULL,
  payer TEXT NOT NULL CHECK(payer IN ('toshi', 'lisa', 'shared', 'other')),
  billing_month TEXT NOT NULL,  -- YYYY-MM
  card_id INTEGER REFERENCES cards(id) ON DELETE SET NULL,
  category TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_expenses_billing_month ON expenses(billing_month);
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date);
CREATE INDEX IF NOT EXISTS idx_expenses_payer ON expenses(payer);
CREATE INDEX IF NOT EXISTS idx_expenses_card ON expenses(card_id);

-- 収入
CREATE TABLE IF NOT EXISTS incomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  owner TEXT NOT NULL CHECK(owner IN ('toshi', 'lisa')),
  kind TEXT NOT NULL CHECK(kind IN ('salary', 'bonus', 'other')),
  description TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_incomes_date ON incomes(date);
CREATE INDEX IF NOT EXISTS idx_incomes_owner ON incomes(owner);

-- 定期収入設定
CREATE TABLE IF NOT EXISTS recurring_incomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  owner TEXT NOT NULL CHECK(owner IN ('toshi', 'lisa')),
  amount INTEGER NOT NULL,
  pay_day INTEGER NOT NULL CHECK(pay_day BETWEEN 1 AND 31),
  kind TEXT NOT NULL DEFAULT 'salary',
  active INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 固定費マスタ
CREATE TABLE IF NOT EXISTS fixed_costs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  amount INTEGER NOT NULL,
  owner TEXT NOT NULL CHECK(owner IN ('toshi', 'lisa', 'shared')),
  split INTEGER NOT NULL DEFAULT 1 CHECK(split IN (0, 1)), -- 1=折半対象
  pay_day INTEGER,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 固定費月次スナップショット（過去月ロック対応）
CREATE TABLE IF NOT EXISTS fixed_cost_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fixed_cost_id INTEGER NOT NULL REFERENCES fixed_costs(id) ON DELETE CASCADE,
  month TEXT NOT NULL,  -- YYYY-MM
  amount INTEGER NOT NULL,
  locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(fixed_cost_id, month)
);
CREATE INDEX IF NOT EXISTS idx_fcs_month ON fixed_cost_snapshots(month);

-- 資産・負債設定
CREATE TABLE IF NOT EXISTS asset_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,             -- 'repair_reserve', 'loan_toshi', 'home_loan', etc.
  label_ja TEXT NOT NULL,
  label_en TEXT NOT NULL,
  initial_amount INTEGER NOT NULL DEFAULT 0,
  monthly_amount INTEGER,                -- 毎月の増減（積立=正、返済=負）
  yearly_month INTEGER,                  -- 年1回イベントの月
  yearly_amount INTEGER,                 -- 年1回イベントの金額
  interest_rate REAL,                    -- 住宅ローン金利など
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 資産・負債イベント
CREATE TABLE IF NOT EXISTS asset_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT NOT NULL REFERENCES asset_settings(key) ON DELETE CASCADE,
  event_date TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('lump_repayment', 'adjustment', 'extra_payment', 'rate_change', 'value_update')),
  amount INTEGER NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_asset_events_key_date ON asset_events(setting_key, event_date);

-- 資産・負債月次スナップショット（再計算結果のキャッシュ）
CREATE TABLE IF NOT EXISTS asset_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setting_key TEXT NOT NULL,
  month TEXT NOT NULL,
  balance INTEGER NOT NULL,
  delta INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  computed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(setting_key, month)
);
CREATE INDEX IF NOT EXISTS idx_asset_snapshots_month ON asset_snapshots(month);

-- ============================================================
-- 重複登録防止用キー（最重要）
-- 過去に「貸付金返済の連動ボタン複数回押下で二重計上」バグが発生。
-- (source_type, source_id, owner, month) でユニーク制約を強制。
-- ============================================================
CREATE TABLE IF NOT EXISTS ledger_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_type TEXT NOT NULL,             -- 'loan_repayment', 'fixed_cost', 'transfer', 'manual'
  source_id INTEGER NOT NULL,            -- 元データのID
  owner TEXT NOT NULL,                   -- 'toshi', 'lisa', 'shared'
  month TEXT NOT NULL,                   -- YYYY-MM
  amount INTEGER NOT NULL,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_type, source_id, owner, month)
);
CREATE INDEX IF NOT EXISTS idx_ledger_links_expense ON ledger_links(expense_id);
CREATE INDEX IF NOT EXISTS idx_ledger_links_month ON ledger_links(month);

-- メッセージボード
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_messages_month ON messages(month);

-- Undo履歴（直前操作1つを戻すため、操作ログを保存）
CREATE TABLE IF NOT EXISTS undo_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT,
  table_name TEXT NOT NULL,
  operation TEXT NOT NULL CHECK(operation IN ('create', 'update', 'delete')),
  record_id INTEGER,
  before_data TEXT,    -- JSON
  after_data TEXT,     -- JSON
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_undo_log_user_date ON undo_log(user_email, created_at DESC);
