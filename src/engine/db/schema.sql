-- SQL schema for OmniTrader database
-- This file is used by database.js migrateSchema() for fresh database initialization

-- Enable foreign keys support
PRAGMA foreign_keys = ON;

-- Users table for authentication and user management
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  telegram_chat_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Exchange accounts table (supports multiple exchanges via CCXT)
CREATE TABLE IF NOT EXISTS exchange_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL,  -- bybit, hyperliquid, etc.
  label TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  api_secret_enc TEXT NOT NULL,
  is_testnet INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT
);

-- Trading setups (configurations for automated trading)
CREATE TABLE IF NOT EXISTS trading_setups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  exchange_account_id INTEGER NOT NULL REFERENCES exchange_accounts(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  memo TEXT,
  activation_price REAL NOT NULL,
  ignore_box_upper REAL NOT NULL,
  ignore_box_lower REAL NOT NULL,
  entry_indicator_type TEXT NOT NULL,
  entry_indicator_tf TEXT NOT NULL,
  risk_type TEXT NOT NULL,
  risk_value REAL NOT NULL,
  sl_price REAL DEFAULT 0,
  tp_prices TEXT DEFAULT '[1,2,3,4]',
  be_enabled INTEGER DEFAULT 0,
  be_trigger_price REAL DEFAULT 0,
  entry_price REAL,
  entry_qty REAL,
  activated_at TEXT,
  exit_indicator_type TEXT,
  exit_indicator_tf TEXT,
  closed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  profit REAL DEFAULT 0,
  reason TEXT DEFAULT ''
);

-- Orders created for trading setups
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setup_id INTEGER NOT NULL REFERENCES trading_setups(id) ON DELETE CASCADE,
  order_type TEXT NOT NULL,
  side TEXT NOT NULL,
  price REAL NOT NULL,
  qty REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  exchange_order_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Migration tracking table
CREATE TABLE IF NOT EXISTS _migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_exchange_accounts_user ON exchange_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_setups_user_created ON trading_setups(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_setups_status ON trading_setups(status);
CREATE INDEX IF NOT EXISTS idx_setups_account ON trading_setups(exchange_account_id);
CREATE INDEX IF NOT EXISTS idx_orders_setup ON orders(setup_id);