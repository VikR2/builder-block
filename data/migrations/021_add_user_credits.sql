-- User credit balances and transaction ledger
-- Migration: 021_add_user_credits.sql
-- Created: 2026-04-20

CREATE TABLE IF NOT EXISTS user_credit_accounts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance_credits INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_credit_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delta_credits INTEGER NOT NULL,
    reason TEXT NOT NULL,
    metadata_json TEXT,
    balance_after INTEGER NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_credit_transactions_user
    ON user_credit_transactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_credit_transactions_reason
    ON user_credit_transactions(reason);
