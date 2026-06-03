const sqlite3 = require('sqlite3').verbose();
const Config = require('../config');
const logger = require('../logger');

class Database {
  constructor() {
    this.dbPath = Config.getDatabasePath();
    this.db = null;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      this.db = new sqlite3.Database(this.dbPath, (err) => {
        if (err) {
          logger.dbError('connect', err);
          reject(err);
        } else {
          logger.info(`Connected to database: ${this.dbPath}`);
          resolve();
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
    if (!Array.isArray(statuses) || statuses.length === 0) {
      return [];
    }
    
    const placeholders = statuses.map(() => '?').join(',');
    const sql = `
      SELECT ts.*, ba.api_key_enc, ba.api_secret_enc, ba.is_testnet, ba.label as account_label,
             u.email as user_email
      FROM trading_setups ts
      JOIN bybit_accounts ba ON ts.account_id = ba.id
      JOIN users u ON ts.user_id = u.id
      WHERE ts.status IN (${placeholders})
      ORDER BY ts.created_at ASC
    `;
    
    return this.all(sql, statuses);
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
        setup_id, order_type, side, price, qty, status, bybit_order_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `;
    
    const params = [
      orderData.setup_id,
      orderData.order_type,
      orderData.side,
      orderData.price,
      orderData.qty,
      orderData.status || 'pending',
      orderData.bybit_order_id || null
    ];
    
    const result = await this.run(sql, params);
    return { ...orderData, id: result.lastID };
  }

  async updateOrderStatus(orderId, status, bybitOrderId = null) {
    const updates = ['status = ?', 'updated_at = datetime("now")'];
    const params = [status];
    
    if (bybitOrderId) {
      updates.push('bybit_order_id = ?');
      params.push(bybitOrderId);
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

  async getSetupById(setupId) {
    const sql = `
      SELECT ts.*, ba.api_key_enc, ba.api_secret_enc, ba.is_testnet, ba.label as account_label,
             u.email as user_email
      FROM trading_setups ts
      JOIN bybit_accounts ba ON ts.account_id = ba.id
      JOIN users u ON ts.user_id = u.id
      WHERE ts.id = ?
    `;
    
    return this.get(sql, [setupId]);
  }
}

module.exports = Database;