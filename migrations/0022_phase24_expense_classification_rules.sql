-- Phase24: AI-assisted expense classification rules.

CREATE TABLE IF NOT EXISTS expense_classification_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  merchant_key TEXT NOT NULL,
  description_sample TEXT,
  paid_by TEXT,
  burden_owner TEXT,
  payment_method TEXT,
  fixed_candidate INTEGER NOT NULL DEFAULT 0,
  confidence INTEGER NOT NULL DEFAULT 80,
  source TEXT NOT NULL DEFAULT 'confirmed',
  usage_count INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  archived_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_classification_rules_active_key
  ON expense_classification_rules(merchant_key)
  WHERE archived_at IS NULL;
