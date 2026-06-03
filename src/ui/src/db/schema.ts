export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS _migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  telegram_chat_id TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bybit_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  label TEXT NOT NULL,
  api_key_enc TEXT NOT NULL,
  api_secret_enc TEXT NOT NULL,
  is_testnet INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS trading_setups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('long','short')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','triggered','active','closed','canceled')),
  memo TEXT,
  activation_price REAL NOT NULL CHECK(activation_price >= 0),
  ignore_box_upper REAL NOT NULL CHECK(ignore_box_upper >= 0),
  ignore_box_lower REAL NOT NULL CHECK(ignore_box_lower >= 0),
  entry_indicator_type TEXT NOT NULL CHECK(entry_indicator_type IN ('superTrend','macd','ema')),
  entry_indicator_tf TEXT NOT NULL CHECK(entry_indicator_tf IN ('m1','m5','m15','m30','h1','h2','h4','d1')),
  risk_type TEXT NOT NULL CHECK(risk_type IN ('percent','fixed')),
  risk_value REAL NOT NULL CHECK(risk_value > 0),
  sl_price REAL DEFAULT 0,
  tp_prices TEXT DEFAULT '[1,2,3,4]',
  be_enabled INTEGER DEFAULT 0,
  be_trigger_price REAL DEFAULT 0,
  entry_price REAL,
  entry_qty REAL,
  activated_at TEXT,
  exit_indicator_type TEXT CHECK(exit_indicator_type IN ('superTrend','macd','ema')),
  exit_indicator_tf TEXT CHECK(exit_indicator_tf IN ('m1','m5','m15','m30','h1','h2','h4','d1')),
  closed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (account_id) REFERENCES bybit_accounts(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  setup_id INTEGER NOT NULL,
  order_type TEXT NOT NULL CHECK(order_type IN ('entry','tp1','tp2','tp3','tp4','sl')),
  side TEXT NOT NULL CHECK(side IN ('buy','sell')),
  price REAL NOT NULL,
  qty REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','filled','canceled','rejected')),
  bybit_order_id TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (setup_id) REFERENCES trading_setups(id)
);

CREATE INDEX IF NOT EXISTS idx_setups_user_created ON trading_setups(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_setups_status ON trading_setups(status);
CREATE INDEX IF NOT EXISTS idx_accounts_user ON bybit_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_setup ON orders(setup_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`;

export const MIGRATIONS_SQL = `
INSERT OR IGNORE INTO _migrations (version) VALUES (1);
`;

export const MIGRATION_2_SQL = `
CREATE TABLE trading_setups_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('long','short')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','triggered','active','closed','canceled')),
  memo TEXT,
  activation_price REAL NOT NULL CHECK(activation_price >= 0),
  ignore_box_upper REAL NOT NULL CHECK(ignore_box_upper >= 0),
  ignore_box_lower REAL NOT NULL CHECK(ignore_box_lower >= 0),
  entry_indicator_type TEXT NOT NULL CHECK(entry_indicator_type IN ('superTrend','macd','ema')),
  entry_indicator_tf TEXT NOT NULL CHECK(entry_indicator_tf IN ('m15','m30','h1','h2','h4','d1')),
  risk_type TEXT NOT NULL CHECK(risk_type IN ('percent','fixed')),
  risk_value REAL NOT NULL CHECK(risk_value > 0),
  sl_price REAL DEFAULT 0,
  tp_prices TEXT DEFAULT '[1,2,3,4]',
  be_enabled INTEGER DEFAULT 0,
  be_trigger_price REAL DEFAULT 0,
  entry_price REAL,
  entry_qty REAL,
  activated_at TEXT,
  exit_indicator_type TEXT CHECK(exit_indicator_type IN ('superTrend','macd','ema')),
  exit_indicator_tf TEXT CHECK(exit_indicator_tf IN ('m15','m30','h1','h2','h4','d1')),
  closed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (account_id) REFERENCES bybit_accounts(id)
);

INSERT INTO trading_setups_v2 SELECT * FROM trading_setups;
DROP TABLE trading_setups;
ALTER TABLE trading_setups_v2 RENAME TO trading_setups;
`;

export const MIGRATION_3_SQL = `
CREATE TABLE trading_setups_v3 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('long','short')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','triggered','active','closed','canceled')),
  memo TEXT,
  activation_price REAL NOT NULL CHECK(activation_price >= 0),
  ignore_box_upper REAL NOT NULL CHECK(ignore_box_upper >= 0),
  ignore_box_lower REAL NOT NULL CHECK(ignore_box_lower >= 0),
  entry_indicator_type TEXT NOT NULL CHECK(entry_indicator_type IN ('superTrend','macd','ema')),
  entry_indicator_tf TEXT NOT NULL CHECK(entry_indicator_tf IN ('m1','m5','m15','m30','h1','h2','h4','d1')),
  risk_type TEXT NOT NULL CHECK(risk_type IN ('percent','fixed')),
  risk_value REAL NOT NULL CHECK(risk_value > 0),
  sl_price REAL DEFAULT 0,
  tp_prices TEXT DEFAULT '[1,2,3,4]',
  be_enabled INTEGER DEFAULT 0,
  be_trigger_price REAL DEFAULT 0,
  entry_price REAL,
  entry_qty REAL,
  activated_at TEXT,
  exit_indicator_type TEXT CHECK(exit_indicator_type IN ('superTrend','macd','ema')),
  exit_indicator_tf TEXT CHECK(exit_indicator_tf IN ('m1','m5','m15','m30','h1','h2','h4','d1')),
  closed_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (account_id) REFERENCES bybit_accounts(id)
);

INSERT INTO trading_setups_v3 SELECT * FROM trading_setups;
DROP TABLE trading_setups;
ALTER TABLE trading_setups_v3 RENAME TO trading_setups;
`;

export const MIGRATION_4_SQL = `
ALTER TABLE users ADD COLUMN telegram_chat_id TEXT;
`;