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
      // Run screener rework migration
      await this.runScreenerReworkMigration();
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

  async runScreenerReworkMigration() {
    try {
      const ScreenerMigration = require('./migrate_screener_rework');
      const migration = new ScreenerMigration(this);
      await migration.runMigration();
    } catch (error) {
      logger.error('Screener rework migration failed:', error);
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
      SELECT ts.*, ea.exchange, ea.label as account_label, ea.api_key_enc, ea.api_secret_enc, ea.is_testnet
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
    // Extract base currency for pattern matching
    let symbolPattern = symbol;
    if (symbol.includes('/')) {
      const base = symbol.split('/')[0];
      symbolPattern = base + '/%';
    }
    
    const sql = `
      SELECT ts.*, ea.exchange, ea.api_key_enc, ea.api_secret_enc, ea.is_testnet
      FROM trading_setups ts
      JOIN exchange_accounts ea ON ts.exchange_account_id = ea.id
      WHERE ts.status = 'pending' 
        AND ts.symbol LIKE ? 
        AND ts.entry_indicator_tf = ?
      ORDER BY ts.created_at ASC
    `;
    return this.all(sql, [symbolPattern, timeframe]);
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
    // Extract base currency for pattern matching
    let symbolPattern = symbol;
    if (symbol.includes('/')) {
      const base = symbol.split('/')[0];
      symbolPattern = base + '/%';
    }
    
    const sql = `
      SELECT ts.*, ea.exchange, ea.api_key_enc, ea.api_secret_enc, ea.is_testnet
      FROM trading_setups ts
      JOIN exchange_accounts ea ON ts.exchange_account_id = ea.id
      WHERE ts.status = 'triggered' 
        AND ts.symbol LIKE ? 
        AND ts.entry_indicator_tf = ?
        AND ts.entry_indicator_type != 'manual'
      ORDER BY ts.created_at ASC
    `;
    return this.all(sql, [symbolPattern, timeframe]);
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

async upsertScreenerSnapshot(symbol, timeframe, indicatorType, signal) {
    const sql = `
      INSERT INTO screener_snapshot (symbol, timeframe, indicator_type, signal, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'))
      ON CONFLICT(symbol, timeframe, indicator_type)
      DO UPDATE SET signal = excluded.signal, updated_at = excluded.updated_at
    `;
    return this.run(sql, [symbol, timeframe, indicatorType, signal]);
  }

  async getScreenerSnapshots(indicatorType) {
    const sql = `SELECT * FROM screener_snapshot WHERE indicator_type = ? ORDER BY symbol, timeframe`;
    return this.all(sql, [indicatorType]);
  }

async getExchangeAccountByIndex(index) {
    const sql = `
      SELECT ea.*, u.id as user_id
      FROM exchange_accounts ea
      JOIN users u ON ea.user_id = u.id
      ORDER BY ea.id ASC
      LIMIT 1 OFFSET ?
    `;
    return this.get(sql, [index]);
  }
}

module.exports = Database;