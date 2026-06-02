# MVP: Bybit Trading Automation — Architecture & Orchestration

## 1. System Overview

A lightweight algorithmic trading MVP that monitors Bybit price data, validates entry conditions based on technical indicators, executes orders, assigns native TP/SL, and sends Telegram alerts. Once a trade is placed, the system does not continuously monitor that position.

- **Frontend**: Next.js dashboard (Setup CRUD, auth, UI)
- **Backend**: Node.js REST API + Scheduler (15-min polling)
- **Database**: SQLite (single-file, zero-config)
- **External**: Bybit REST API, Telegram Bot API

---

## 2. Component View

```mermaid
graph TB
    subgraph Frontend["Next.js Frontend"]
        UI[Dashboard / Setup CRUD]
        Auth[Auth Pages]
        SetupForm[Setup Form]
        REST[Embedded REST API]
        AuthM[Auth Middleware]
    end

    subgraph Backend["Node.js Backend"]
        DBQ[DB Query Package]
        Sched[Scheduler<br/>every 15 min]
        Engine[Trading Engine]
        BybitH[Bybit Helper]
        TelH[Telegram Helper]
    end

    subgraph Data["SQLite Database"]
        DB[("sqlite DB<br/>trading.db")]
    end

    subgraph External["External Services"]
        BybitAPI[Bybit REST API]
        TelAPI[Telegram Bot API]
    end

    UI --> REST
    Auth --> REST
    SetupForm --> REST
    REST --> AuthM
    REST --> DBQ
    Sched --> Engine
    Engine --> DBQ
    Engine --> BybitH
    Engine --> TelH
    DBQ --> DB
    BybitH --> BybitAPI
    TelH --> TelAPI
```

### Component Responsibilities

| Component | Responsibility |
|-----------|----------------|
| **Next.js Frontend** | Login, setup CRUD (Pending/Active/Closed tabs), memo/notes, Telegram chat ID config |
| **REST API** | Serve UI, validate requests, orchestrate helpers |
| **Auth Middleware** | Token/session validation for protected endpoints |
| **DB Query Package** | All SQLite reads/writes for users, accounts, setups, orders |
| **Scheduler** | Wake every 15 min, select due setups, feed to Trading Engine |
| **Trading Engine** | Core orchestration: check activation, ignore box, entry signal, then place TP/SL |
| **Bybit Helper** | Fetch prices, submit orders, query order status |
| **Telegram Helper** | Send real-time alerts to user chat |

---

## 3. Database Schema

```mermaid
erDiagram
    USERS ||--o{ BYBIT_ACCOUNTS : owns
    USERS ||--o{ TRADING_SETUPS : creates
    BYBIT_ACCOUNTS ||--o{ TRADING_SETUPS : linked_to
    TRADING_SETUPS ||--o{ ORDERS : has

    USERS {
        int id PK
        string email UK
        string password_hash
        datetime created_at
    }

    BYBIT_ACCOUNTS {
        int id PK
        int user_id FK
        string label
        string api_key_enc
        string api_secret_enc
        boolean is_testnet
        datetime created_at
    }

    TRADING_SETUPS {
        int id PK
        int user_id FK
        int account_id FK
        string symbol
        string side "long|short"
        string status "pending|triggered|active|closed|canceled"
        text memo
        decimal activation_price
        decimal ignore_box_upper
        decimal ignore_box_lower
        string entry_indicator_type "superTrend|macd|ema"
        string entry_indicator_tf
        string risk_type "percent|fixed"
        decimal risk_value
        decimal sl_price
        json tp_prices "array of rr of tp"
        boolean be_enabled
        decimals be_trigger_price
        decimal entry_price
        decimal entry_qty
        datetime activated_at
        string exit_indicator_type "superTrend|macd|ema"
        string exit_indicator_tf
        datetime closed_at
        datetime created_at
        datetime updated_at
    }

    ORDERS {
        int id PK
        int setup_id FK
        string order_type "entry|tp1|tp2|tp3|tp4|sl"
        string side "buy|sell"
        decimal price
        decimal qty
        string status "pending|filled|canceled|rejected"
        string bybit_order_id UK
        datetime created_at
        datetime updated_at 
    }
```

### Schema Notes

- `api_key_enc` / `api_secret_enc`: store encrypted, never plaintext.
- `tp_levels`: JSON array of RR ratios (e.g., `[1,2,3,4]`).
- `tp_prices`: JSON array of computed limit prices for each TP.
- `status`: lifecycle is **pending → triggered->active → closed** or **pending → canceled**.
if price hit active price , the status will be triggered.


