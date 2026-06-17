const sqlite3 = require('sqlite3').verbose();
const Config = require('../config');
const logger = require('../logger');
const fs = require('fs');
const path = require('path');

class Database {
  constructor() {
    this.dbPath = Config.getDatabasePath();
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, async (err) => {
        if (err) {
          logger.dbError('connect', err);
          reject(err);
          return;
        }

        logger.info(`Connected to database: ${this.dbPath}`);
        try {
          await this.migrateSchema();
          resolve();
        } catch (migrationErr) {
          logger.dbError('migrateSchema', migrationErr);
          reject(migrationErr);
        }
      });
    });
  }

  async disconnect() {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        resolve();
        return;
      }
      
      this.db.close((err) => {
        if (err) {
          logger.dbError('disconnect', err);
          reject(err);
        } else {
          logger.info('Disconnected from database');
          resolve();
        }
      });
    });
  }

  async run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          logger.dbError('run', err);
          reject(err);
        } else {
          resolve({ lastID: this.lastID, changes: this.changes });
        }
      });
    });
  }

  async get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) {
          logger.dbError('get', err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          logger.dbError('all', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  async exec(sql) {
    return new Promise((resolve, reject) => {
      this.db.exec(sql, (err) => {
        if (err) {
          logger.dbError('exec', err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  }

  async migrateSchema() {
    // If this is a fresh database (no `users` table), create full schema.
    const exists = await new Promise((resolve) => {
      this.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'", [], (err, row) => {
        resolve(Boolean(row));
      });
    });

    if (!exists) {
      logger.info('Initializing database schema (fresh DB)');
      
      // Read SQL from external schema file
      const schemaFilePath = path.join(__dirname, 'schema.sql');
      let initSql;
      
      try {
        initSql = fs.readFileSync(schemaFilePath, 'utf8');
        logger.info(`Read schema from ${schemaFilePath}`);
        await this.exec(initSql);
      } catch (err) {
        logger.dbError('readSchemaFile', err);
        throw new Error(`Failed to read database schema file: ${err.message}`);
      }

    } else {
      // Run migration to exchange_accounts if needed
      await this.runExchangeAccountsMigration();
    }

  }

  async runExchangeAccountsMigration() {
    try {
      const DatabaseMigration = require('./migrate_to_exchange_accounts');
      const migration = new DatabaseMigration(this);
      await migration.runMigration();
    } catch (error) {
      logger.error('Exchange accounts migration failed:', error);
      // Don't throw - allow app to continue with old schema
      logger.warn('Continuing with existing schema (bybit_accounts)');
    }
  }

  async beginTransaction() {
    return this.run('BEGIN TRANSACTION');
  }

  async commit() {
    return this.run('COMMIT');
  }

  async rollback() {
    return this.run('ROLLBACK');
  }

  async getSetupsByStatus(statuses) {
    const placeholders = statuses.map(() => '?').join(',');
    const sql = `
      SELECT ts.*, ea.exchange, ea.api_key_enc, ea.api_secret_enc, ea.is_testnet
      FROM trading_setups ts
      JOIN exchange_accounts ea ON ts.exchange_account_id = ea.id
      WHERE ts.status IN (${placeholders})
      ORDER BY ts.created_at DESC
    `;
    return this.all(sql, statuses);
  }

  async getPendingSetupsBySymbolTimeframe() {
    const sql = `
      SELECT DISTINCT ts.symbol, ts.entry_indicator_tf as timeframe
      FROM trading_setups ts
      WHERE ts.status = 'pending'
      ORDER BY ts.symbol, ts.entry_indicator_tf
    `;
    return this.all(sql);
  }

  async getPendingSetupsForSymbolTimeframe(symbol, timeframe) {
    const sql = `
      SELECT ts.*, ea.exchange, ea.api_key_enc, ea.api_secret_enc, ea.is_testnet
      FROM trading_setups ts
      JOIN exchange_accounts ea ON ts.exchange_account_id = ea.id
      WHERE ts.status = 'pending' 
        AND ts.symbol = ? 
        AND ts.entry_indicator_tf = ?
      ORDER BY ts.created_at ASC
    `;
    return this.all(sql, [symbol, timeframe]);
  }

  async getTriggeredSetupsBySymbolTimeframe() {
    const sql = `
      SELECT DISTINCT ts.symbol, ts.entry_indicator_tf as timeframe
      FROM trading_setups ts
      WHERE ts.status = 'triggered'
      ORDER BY ts.symbol, ts.entry_indicator_tf
    `;
    return this.all(sql);
  }

  async getTriggeredSetupsForSymbolTimeframe(symbol, timeframe) {
    const sql = `
      SELECT ts.*, ea.exchange, ea.api_key_enc, ea.api_secret_enc, ea.is_testnet
      FROM trading_setups ts
      JOIN exchange_accounts ea ON ts.exchange_account_id = ea.id
      WHERE ts.status = 'triggered' 
        AND ts.symbol = ? 
        AND ts.entry_indicator_tf = ?
      ORDER BY ts.created_at ASC
    `;
    return this.all(sql, [symbol, timeframe]);
  }

  async getActiveSetups() {
    const sql = `
      SELECT ts.*, ea.exchange, ea.api_key_enc, ea.api_secret_enc, ea.is_testnet
      FROM trading_setups ts
      JOIN exchange_accounts ea ON ts.exchange_account_id = ea.id
      WHERE ts.status = 'active'
      ORDER BY ts.created_at ASC
    `;
    return this.all(sql);
  }

  async updateSetupStatus(setupId, newStatus, updates = {}) {
    const now = new Date().toISOString();
    const updateFields = ['status = ?', 'updated_at = ?'];
    const params = [newStatus, now];
    
    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined) {
        updateFields.push(`${key} = ?`);
        params.push(value);
      }
    });
    
    params.push(setupId);
    
    const sql = `
      UPDATE trading_setups 
      SET ${updateFields.join(', ')}
      WHERE id = ?
    `;
    
    return this.run(sql, params);
  }

  async createOrder(orderData) {
    const sql = `
      INSERT INTO orders (
        setup_id, order_type, side, price, qty, status, exchange_order_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;
    
    const params = [
      orderData.setup_id,
      orderData.order_type,
      orderData.side,
      orderData.price,
      orderData.qty,
      orderData.status || 'pending',
      orderData.exchange_order_id || null
    ];
    
    const result = await this.run(sql, params);
    return { ...orderData, id: result.lastID };
  }

  async updateOrderStatus(orderId, status, exchangeOrderId = null) {
    const updates = ['status = ?', 'updated_at = datetime("now")'];
    const params = [status];
    
    if (exchangeOrderId) {
      updates.push('exchange_order_id = ?');
      params.push(exchangeOrderId);
    }
    
    params.push(orderId);
    
    const sql = `
      UPDATE orders 
      SET ${updates.join(', ')}
      WHERE id = ?
    `;
    
    return this.run(sql, params);
  }

  async getOrdersBySetupId(setupId) {
    const sql = `
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
        END
    `;
    
    return this.all(sql, [setupId]);
  }

  async getOrdersByStatus(setupId, statuses) {
    if (!Array.isArray(statuses) || statuses.length === 0) {
      return [];
    }
    
    const placeholders = statuses.map(() => '?').join(',');
    const sql = `
      SELECT * FROM orders 
      WHERE setup_id = ? AND status IN (${placeholders})
    `;
    
    return this.all(sql, [setupId, ...statuses]);
  }

  async getUserTelegramChatId(userId) {
    const result = await this.get(
      'SELECT telegram_chat_id FROM users WHERE id = ?',
      [userId]
    );
    return result?.telegram_chat_id || null;
  }

  async getUserByEmail(email) {
    return this.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  async getUserById(id) {
    return this.get('SELECT * FROM users WHERE id = ?', [id]);
  }

  async createUser(email, passwordHash) {
    const now = new Date().toISOString();
    const sql = `
      INSERT INTO users (email, password_hash, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `;
    const result = await this.run(sql, [email, passwordHash, now, now]);
    return { id: result.lastID, email, created_at: now, updated_at: now };
  }

  async updateUserPassword(id, hash) {
    const sql = `
      UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?
    `;
    const now = new Date().toISOString();
    return this.run(sql, [hash, now, id]);
  }

  async updateUserTelegramChatId(id, chatId) {
    const sql = `
      UPDATE users SET telegram_chat_id = ?, updated_at = ? WHERE id = ?
    `;
    const now = new Date().toISOString();
    return this.run(sql, [chatId, now, id]);
  }

  async getSetupById(setupId) {
    const sql = `
      SELECT ts.*, ea.exchange, ea.api_key_enc, ea.api_secret_enc, ea.is_testnet, ea.label as account_label,
             u.email as user_email
      FROM trading_setups ts
      JOIN exchange_accounts ea ON ts.exchange_account_id = ea.id
      JOIN users u ON ts.user_id = u.id
      WHERE ts.id = ?
    `;
    
    return this.get(sql, [setupId]);
  }

async getScreenerItems(userId, enabledOnly = true) {
  let sql = `
    SELECT si.*, ea.exchange, ea.label as exchange_account_label, ea.is_testnet
    FROM screener_items si
    JOIN exchange_accounts ea ON si.exchange_account_id = ea.id
  `;
  
  const params = [];
  const whereClauses = [];

  // 1. Only filter by user_id if a valid userId is provided
  if (userId !== null && userId !== undefined) {
    whereClauses.push(`si.user_id = ?`);
    params.push(userId);
  }

  // 2. Handle enabledOnly logic (assuming enabled is a boolean/tinyint 1 or 0)
  if (enabledOnly === true) {
    whereClauses.push(`si.enabled = 1`);
  } else if (enabledOnly === false) {
    whereClauses.push(`si.enabled = 0`);
  }
  // If enabledOnly is anything else (like 'all'), we don't push an enabled filter

  // 3. Append WHERE clause if there are any conditions
  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }

  sql += ` ORDER BY si.created_at DESC`;

  return this.all(sql, params);
}
  async getScreenerItemById(id, userId) {
    const sql = `
      SELECT si.*, ea.exchange, ea.label as exchange_account_label, ea.is_testnet
      FROM screener_items si
      JOIN exchange_accounts ea ON si.exchange_account_id = ea.id
      WHERE si.id = ? AND si.user_id = ?
    `;
    return this.get(sql, [id, userId]);
  }

  async createScreenerItem(data) {
    const sql = `
      INSERT INTO screener_items (
        user_id, exchange_account_id, symbol, timeframe, indicator_type, indicator_params, enabled
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
    `;
    const params = [
      data.user_id,
      data.exchange_account_id,
      data.symbol,
      data.timeframe,
      data.indicator_type,
      JSON.stringify(data.indicator_params || {})
    ];
    const result = await this.run(sql, params);
    return { id: result.lastID };
  }

  async updateScreenerItem(id, userId, updates) {
    const allowed = ['symbol', 'timeframe', 'indicator_type', 'indicator_params', 'enabled'];
    const fields = [];
    const params = [];
    for (const [k, v] of Object.entries(updates)) {
      if (allowed.includes(k)) {
        fields.push(`${k} = ?`);
        params.push(k === 'indicator_params' ? JSON.stringify(v) : v);
      }
    }
    if (fields.length === 0) return;
    params.push(new Date().toISOString(), id, userId);
    const sql = `UPDATE screener_items SET ${fields.join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`;
    return this.run(sql, params);
  }

  async updateScreenerItemSignal(id, signal, checkedAt) {
    const sql = `UPDATE screener_items SET last_signal = ?, last_checked_at = ? WHERE id = ?`;
    return this.run(sql, [signal, checkedAt, id]);
  }

  async updateScreenerItemAlerted(id, alertedAt) {
    const sql = `UPDATE screener_items SET last_alerted_at = ? WHERE id = ?`;
    return this.run(sql, [alertedAt, id]);
  }

  async deleteScreenerItem(id, userId) {
    const sql = `DELETE FROM screener_items WHERE id = ? AND user_id = ?`;
    return this.run(sql, [id, userId]);
  }

  async getScreenerItemsBySymbolTimeframe(symbol, timeframe, enabledOnly = true) {
    let sql = `
      SELECT si.*, ea.exchange, ea.label as exchange_account_label, ea.is_testnet
      FROM screener_items si
      JOIN exchange_accounts ea ON si.exchange_account_id = ea.id
      WHERE si.symbol = ? AND si.timeframe = ?
    `;
    
    const params = [symbol, timeframe];
    
    if (enabledOnly === true) {
      sql += ` AND si.enabled = 1`;
    } else if (enabledOnly === false) {
      sql += ` AND si.enabled = 0`;
    }
    
    sql += ` ORDER BY si.created_at DESC`;
    
    return this.all(sql, params);
  }

  async getSupplyDemandItems(userId, enabledOnly = true) {
    let sql = `
      SELECT sdi.*, ea.exchange, ea.label as exchange_account_label, ea.is_testnet
      FROM supply_demand_items sdi
      JOIN exchange_accounts ea ON sdi.exchange_account_id = ea.id
    `;
    
    const params = [];
    const whereClauses = [];

    // 1. Only filter by user_id if a valid userId is provided
    if (userId !== null && userId !== undefined) {
      whereClauses.push(`sdi.user_id = ?`);
      params.push(userId);
    }

    // 2. Handle enabledOnly logic (assuming enabled is a boolean/tinyint 1 or 0)
    if (enabledOnly === true) {
      whereClauses.push(`sdi.enabled = 1`);
    } else if (enabledOnly === false) {
      whereClauses.push(`sdi.enabled = 0`);
    }
    // If enabledOnly is anything else (like 'all'), we don't push an enabled filter

    // 3. Append WHERE clause if there are any conditions
    if (whereClauses.length > 0) {
      sql += ` WHERE ${whereClauses.join(' AND ')}`;
    }

    sql += ` ORDER BY sdi.created_at DESC`;

    return this.all(sql, params);
  }

  async getSupplyDemandItemById(id, userId) {
    const sql = `
      SELECT sdi.*, ea.exchange, ea.label as exchange_account_label, ea.is_testnet
      FROM supply_demand_items sdi
      JOIN exchange_accounts ea ON sdi.exchange_account_id = ea.id
      WHERE sdi.id = ? AND sdi.user_id = ?
    `;
    return this.get(sql, [id, userId]);
  }

  async createSupplyDemandItem(data) {
    const sql = `
      INSERT INTO supply_demand_items (
        user_id, exchange_account_id, symbol, timeframe, indicator_type, indicator_params, enabled
      ) VALUES (?, ?, ?, ?, ?, ?, 1)
    `;
    const params = [
      data.user_id,
      data.exchange_account_id,
      data.symbol,
      data.timeframe,
      data.indicator_type || 'supply_demand',
      JSON.stringify(data.indicator_params || {})
    ];
    const result = await this.run(sql, params);
    return { id: result.lastID };
  }

  async updateSupplyDemandItem(id, userId, updates) {
    const allowed = ['symbol', 'timeframe', 'indicator_type', 'indicator_params', 'enabled'];
    const fields = [];
    const params = [];
    for (const [k, v] of Object.entries(updates)) {
      if (allowed.includes(k)) {
        fields.push(`${k} = ?`);
        params.push(k === 'indicator_params' ? JSON.stringify(v) : v);
      }
    }
    if (fields.length === 0) return;
    params.push(new Date().toISOString(), id, userId);
    const sql = `UPDATE supply_demand_items SET ${fields.join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`;
    return this.run(sql, params);
  }

  async updateSupplyDemandItemSignal(id, signal, zonePrice, zoneTop, zoneBottom, zoneTf, checkedAt) {
    const sql = `UPDATE supply_demand_items SET last_signal = ?, last_zone_price = ?, last_zone_top = ?, last_zone_bottom = ?, last_zone_timeframe = ?, last_checked_at = ? WHERE id = ?`;
    return this.run(sql, [signal, zonePrice, zoneTop, zoneBottom, zoneTf, checkedAt, id]);
  }

  async updateSupplyDemandItemAlerted(id, alertedAt) {
    const sql = `UPDATE supply_demand_items SET last_alerted_at = ? WHERE id = ?`;
    return this.run(sql, [alertedAt, id]);
  }

  async deleteSupplyDemandItem(id, userId) {
    const sql = `DELETE FROM supply_demand_items WHERE id = ? AND user_id = ?`;
    return this.run(sql, [id, userId]);
  }

  async getSupplyDemandItemsBySymbolTimeframe(symbol, timeframe, enabledOnly = true) {
    let sql = `
      SELECT sdi.*, ea.exchange, ea.label as exchange_account_label, ea.is_testnet
      FROM supply_demand_items sdi
      JOIN exchange_accounts ea ON sdi.exchange_account_id = ea.id
      WHERE sdi.symbol = ? AND sdi.timeframe = ?
    `;
    
    const params = [symbol, timeframe];
    
    if (enabledOnly === true) {
      sql += ` AND sdi.enabled = 1`;
    } else if (enabledOnly === false) {
      sql += ` AND sdi.enabled = 0`;
    }
    
    sql += ` ORDER BY sdi.created_at DESC`;
    
    return this.all(sql, params);
  }
}

module.exports = Database;