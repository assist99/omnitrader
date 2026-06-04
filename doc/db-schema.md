# OmniTrader Database Schema

## Overview

The system uses a single SQLite database file (`db/trading.db`) shared between the UI (Next.js) and Engine (Node.js). Foreign keys are enabled via `PRAGMA foreign_keys=ON`.

## Tables

### `_migrations`

Tracks schema migrations applied to the database.

| Column | Type | Description |
|--------|------|-------------|
| version | INTEGER (PK) | Migration version number |
| applied_at | TEXT | Timestamp of when migration was applied |

### `users`

User accounts for the dashboard.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK, AUTOINCREMENT) | Unique user ID |
| email | TEXT (UNIQUE, NOT NULL) | User email for login |
| password_hash | TEXT (NOT NULL) | bcrypt-hashed password |
| telegram_chat_id | TEXT | Telegram chat ID for notifications (nullable) |
| created_at | TEXT | Account creation timestamp |

**Migration History:**
- v1: Initial schema (id, email, password_hash, created_at)
- v4: Added telegram_chat_id column
- v5: Added profit column to trading_setups

### `bybit_accounts`

Linked Bybit exchange accounts.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK, AUTOINCREMENT) | Unique account ID |
| user_id | INTEGER (FK → users.id, NOT NULL) | Owner user |
| label | TEXT (NOT NULL) | Human-readable label (e.g., "Main Account") |
| api_key_enc | TEXT (NOT NULL) | Encrypted Bybit API key |
| api_secret_enc | TEXT (NOT NULL) | Encrypted Bybit API secret |
| is_testnet | INTEGER (DEFAULT 1) | 1 = testnet, 0 = mainnet |
| created_at | TEXT | Account creation timestamp |
| updated_at | TEXT | Last account update timestamp |

### `trading_setups`

Trading strategy configurations created by users.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK, AUTOINCREMENT) | Unique setup ID |
| user_id | INTEGER (FK → users.id, NOT NULL) | Owner user |
| account_id | INTEGER (FK → bybit_accounts.id, NOT NULL) | Linked Bybit account |
| symbol | TEXT (NOT NULL) | Trading pair (e.g., "BTCUSDT") |
| side | TEXT (CHECK: 'long', 'short', NOT NULL) | Trade direction |
| status | TEXT (CHECK: 'pending', 'triggered', 'active', 'closed', 'canceled', DEFAULT 'pending', NOT NULL) | Current lifecycle status |
| memo | TEXT | Optional notes/description |
| activation_price | REAL (CHECK ≥ 0, NOT NULL) | Price at which setup becomes triggered |
| ignore_box_upper | REAL (CHECK ≥ 0, NOT NULL) | Upper bound of price range to ignore |
| ignore_box_lower | REAL (CHECK ≥ 0, NOT NULL) | Lower bound of price range to ignore |
| entry_indicator_type | TEXT (CHECK: 'superTrend', 'macd', 'ema', NOT NULL) | Indicator for entry signal |
| entry_indicator_tf | TEXT (CHECK: 'm1','m5','m15','m30','h1','h2','h4','d1', NOT NULL) | Timeframe for entry indicator |
| risk_type | TEXT (CHECK: 'percent', 'fixed', NOT NULL) | Risk calculation method |
| risk_value | REAL (CHECK > 0, NOT NULL) | Risk amount/percentage |
| sl_price | REAL (DEFAULT 0) | Stop loss price (0 = not set) |
| tp_prices | TEXT (DEFAULT '[1,2,3,4]') | JSON array of take-profit prices |
| be_enabled | INTEGER (DEFAULT 0) | Break-even feature enabled |
| be_trigger_price | REAL (DEFAULT 0) | Price to trigger break-even |
| entry_price | REAL | Actual entry price once filled |
| entry_qty | REAL | Actual entry quantity once filled |
| profit | REAL | Current or latest profit for the setup |
| activated_at | TEXT | When setup was triggered |
| exit_indicator_type | TEXT (CHECK: 'superTrend', 'macd', 'ema') | Indicator for exit signal |
| exit_indicator_tf | TEXT (CHECK: 'm1','m5','m15','m30','h1','h2','h4','d1') | Timeframe for exit indicator |
| closed_at | TEXT | When setup was closed/canceled |
| created_at | TEXT (DEFAULT datetime('now')) | Setup creation timestamp |
| updated_at | TEXT (DEFAULT datetime('now')) | Last update timestamp |

### `orders`

Orders placed on Bybit for active setups.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER (PK, AUTOINCREMENT) | Unique order ID |
| setup_id | INTEGER (FK → trading_setups.id, NOT NULL) | Parent setup |
| order_type | TEXT (CHECK: 'entry','tp1','tp2','tp3','tp4','sl', NOT NULL) | Order purpose |
| side | TEXT (CHECK: 'buy', 'sell', NOT NULL) | Order direction |
| price | REAL (NOT NULL) | Order price |
| qty | REAL (NOT NULL) | Order quantity |
| status | TEXT (CHECK: 'pending','filled','canceled','rejected', DEFAULT 'pending', NOT NULL) | Order status |
| bybit_order_id | TEXT (UNIQUE) | Bybit's order ID |
| created_at | TEXT (DEFAULT datetime('now')) | Order creation timestamp |
| updated_at | TEXT (DEFAULT datetime('now')) | Last update timestamp |

## Relationships

```
users ──┬── bybit_accounts    (one user → many accounts)
        └── trading_setups    (one user → many setups)

bybit_accounts ──┬── trading_setups  (one account → many setups)
                └── (user_id via setups)

trading_setups ──┬── orders         (one setup → many orders)
```

## Indexes

| Index Name | Table | Columns | Purpose |
|------------|-------|---------|---------|
| idx_users_email | users | email | Fast login lookups |
| idx_accounts_user | bybit_accounts | user_id | List accounts per user |
| idx_setups_user_created | trading_setups | user_id, created_at DESC | Dashboard listing |
| idx_setups_status | trading_setups | status | Engine queries by status |
| idx_orders_setup | orders | setup_id | Load orders for a setup |

## Cascade Deletion

When a Bybit account is deleted, related data is also removed:

1. **Orders**: All orders belonging to setups under the deleted account are deleted first.
2. **Trading Setups**: All setups referencing the deleted account are deleted.
3. **Bybit Account**: The account record itself is deleted.

This is implemented as manual cascade in the `DELETE /api/accounts/:id` endpoint using `BEGIN TRANSACTION` / `COMMIT` to ensure atomicity.

## Sample Queries

```sql
-- Get all active setups with account label
SELECT ts.*, ba.label as account_label
FROM trading_setups ts
JOIN bybit_accounts ba ON ts.account_id = ba.id
WHERE ts.status = 'active'
ORDER BY ts.created_at DESC;

-- Get orders for a specific setup
SELECT * FROM orders
WHERE setup_id = ?
ORDER BY
  CASE order_type
    WHEN 'entry' THEN 1
    WHEN 'tp1' THEN 2
    WHEN 'tp2' THEN 3
    WHEN 'tp3' THEN 4
    WHEN 'tp4' THEN 5
    WHEN 'sl' THEN 6
    ELSE 7
  END;

-- Get setups needing processing (engine)
SELECT ts.*, ba.api_key_enc, ba.api_secret_enc, ba.is_testnet
FROM trading_setups ts
JOIN bybit_accounts ba ON ts.account_id = ba.id
WHERE ts.status IN ('pending', 'triggered', 'active')
ORDER BY ts.created_at ASC;

-- Get user's Telegram chat ID
SELECT telegram_chat_id FROM users WHERE id = ?;
```