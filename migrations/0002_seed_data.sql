-- ============================================================
-- Initial seed data
-- 過去のセッションで確定済みの設定を投入
-- ============================================================

-- カード（既知の3枚）
INSERT OR IGNORE INTO cards (name, owner, close_day, pay_day, sort_order) VALUES
  ('JAL', 'toshi', 15, 10, 10),
  ('Marriott Amex', 'toshi', 20, 17, 20),
  ('Amazon', 'toshi', 27, 27, 30);

-- 口座（最低限の枠だけ）
INSERT OR IGNORE INTO accounts (name, owner, kind, sort_order) VALUES
  ('夫メイン口座', 'toshi', 'bank', 10),
  ('妻メイン口座', 'lisa', 'bank', 20),
  ('共同口座', 'shared', 'bank', 30);

-- 固定費（既知の5件）
INSERT OR IGNORE INTO fixed_costs (name, amount, owner, split, sort_order, note) VALUES
  ('Coop', 30000, 'shared', 1, 10, '生協'),
  ('住宅ローン', 0, 'shared', 1, 20, '金額は資産負債タブと連動予定'),
  ('カード年会費', 0, 'shared', 1, 30, '年1回'),
  ('インターネット', 5000, 'shared', 1, 40, ''),
  ('ポタ電', 0, 'shared', 1, 50, '');

-- 資産・負債設定（過去セッションで確定済みの値）
INSERT OR IGNORE INTO asset_settings (key, label_ja, label_en, initial_amount, monthly_amount, yearly_month, yearly_amount, interest_rate, note) VALUES
  ('repair_reserve',   '修繕積立金',     'Repair Reserve',     393668,  130000,  NULL,  NULL,    NULL,   '毎月ローン返済日に積立'),
  ('loan_toshi',       '夫への貸付金',   'Loan to Toshi',      924213,  -10000,  NULL,  NULL,    NULL,   '毎月ローン返済日に1万円返済'),
  ('loan_lisa',        '妻への貸付金',   'Loan to Lisa',       164045,  -10000,  NULL,  NULL,    NULL,   '毎月ローン返済日に1万円返済'),
  ('home_loan',        '住宅ローン残高', 'Home Loan',          0,       NULL,    NULL,  NULL,    1.19,   '元利均等、金利1.19%固定'),
  ('property_tax',     '固定資産税',     'Property Tax',       0,       NULL,    6,     500000,  NULL,   '毎年6月'),
  ('earthquake_ins',   '地震保険',       'Earthquake Insurance', 0,     NULL,    6,     100000,  NULL,   '毎年6月'),
  ('fire_ins',         '火災保険',       'Fire Insurance',     0,       NULL,    NULL,  300000,  NULL,   '5年に1度、初回2026年'),
  ('stocks_value',     '株式評価額',     'Stocks Value',       0,       NULL,    NULL,  NULL,    NULL,   '評価額を手動更新'),
  ('stocks_pl',        '株式損益',       'Stocks P/L',         0,       NULL,    NULL,  NULL,    NULL,   '');
