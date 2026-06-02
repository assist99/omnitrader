# **1. Authentication & Account Management**

* **Email & Password Login:** Users must be able to securely authenticate/login using email and password. No email verification required at this stage.
* **Multi-Account Bybit Integration:** Support for linking multiple Bybit accounts via API. Users must be able to assign a specific account when creating a trading setup.

# **2. Trading Setup Management (CRUD Dashboard)**

A dashboard interface to **List, Add, Edit, and Cancel** trading setups. Trades should be categorized into three tabs/states:

* **Pending:** Waiting for activation or entry criteria.
* **Active:** Order executed, currently in an open position.
* **Closed:** Trade finalized (hit TP/SL, manually closed, or canceled).
* *Note: Each setup must support a "Memo/Notes" field for user documentation.*

# **3. Entry Logic & Execution**

* **Activation Price:** The system starts monitoring the asset once the price hits this user-defined level.
* **The "Ignore Box" Rule:** Users define an upper and lower boundary box. **If the price hits either the upper or lower boundary of this ignore box *before* the entry order is triggered, the entire trade setup is automatically canceled.**
* **Reversal Entry Conditions:** Once activated (and not canceled by the ignore box), the system detects reversal entry signals based on user-selected indicators and specific timeframes (TF):
* SuperTrend
* MACD
* EMA Crosses
* Candlestick Chart Patterns (e.g., engulfing, pinbars)
* *The user must be able to select one specific condition + timeframe per setup.*



# **4. Position Sizing, Stop Loss (SL), & Multi-Take Profit (TP)**

* **Risk Management:** Automatically calculate position size based on a user-defined Risk % or fixed Dollar ($) value.
* **Stop Loss (SL):** Positioned automatically based on the estimated SL levels (e.g., edge of the ignore box, or indicator bands like lower/upper bands).
* **Multi-TP Scale Out:** Support for up to 4 Take Profit levels based on Risk-to-Reward (RR) ratios (1:1, 1:2, 1:3, 1:4).
* *Example Execution:* Set limit orders to close 25% at TP1, 25% at TP2, 25% at TP3, and the remainder at TP4.


* **Break-Even (BE) Condition:** If checked by the user, the system must automatically move the Stop Loss to the entry price (Break-Even) the exact moment **TP1** is successfully hit.

# **5. Exit Logic**

* **Technical Exits:** Users can set an explicit exit condition based on *SuperTrend, MACD, or EMA* on a specific timeframe.
* *Crucial Guardrail:* This technical exit condition **only triggers if the position is currently in profit**.

# **6. Notifications & Alerts**

* Full integration with **Telegram API**.
* Real-time instant alerts sent to a designated Telegram bot:
* A trade setup is activated or canceled (e.g., hit ignore box).
* An order is placed/executed.
* A Take Profit (TP), Stop Loss (SL), or Break-Even (BE) event is triggered.
* An exit condition is met.