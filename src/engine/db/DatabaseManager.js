const Database = require('./database');
const logger = require('../logger');

class DatabaseManager {
  constructor() {
    this.db = new Database();
    this.isConnected = false;
    this.writeQueue = [];
    this.isProcessingWrite = false;
    this.writeLock = null;
    this.DEFAULT_WRITE_TIMEOUT_MS = 30000; // 30 seconds
  }

  async connect() {
    if (!this.isConnected) {
      await this.db.connect();
      this.isConnected = true;
      logger.info('Global DatabaseManager connected');
    }
  }

  async disconnect() {
    if (this.isConnected) {
      await this.db.disconnect();
      this.isConnected = false;
      logger.info('Global DatabaseManager disconnected');
    }
  }

  async acquireWriteLock(timeoutMs = this.DEFAULT_WRITE_TIMEOUT_MS) {
    // Simple queue-based locking with timeout
    return new Promise((resolve, reject) => {
      const lockRequest = { 
        resolve, 
        reject, 
        timestamp: Date.now(),
        timeoutId: null
      };
      
      // Set timeout for lock acquisition
      if (timeoutMs > 0) {
        lockRequest.timeoutId = setTimeout(() => {
          const index = this.writeQueue.indexOf(lockRequest);
          if (index !== -1) {
            this.writeQueue.splice(index, 1);
          }
          reject(new Error(`Write lock timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      }
      
      this.writeQueue.push(lockRequest);
      this.processWriteQueue();
    });
  }

  async releaseWriteLock() {
    this.isProcessingWrite = false;
    this.writeLock = null;
    this.processWriteQueue();
  }

  processWriteQueue() {
    if (this.isProcessingWrite || this.writeQueue.length === 0) {
      return;
    }

    this.isProcessingWrite = true;
    const lockRequest = this.writeQueue.shift();
    
    // Clear the timeout since we're granting the lock
    if (lockRequest.timeoutId) {
      clearTimeout(lockRequest.timeoutId);
    }
    
    this.writeLock = {
      acquiredAt: Date.now(),
      id: Math.random().toString(36).substring(7)
    };
    
    logger.debug(`Write lock acquired: ${this.writeLock.id}`);
    lockRequest.resolve(this.writeLock);
  }

  async runWriteOperation(operationName, operationFn, timeoutMs = this.DEFAULT_WRITE_TIMEOUT_MS) {
    const startTime = Date.now();
    logger.debug(`Queueing write operation: ${operationName}`);
    
    try {
      const lock = await this.acquireWriteLock(timeoutMs);
      const lockWaitTime = Date.now() - startTime;
      
      if (lockWaitTime > 1000) {
        logger.warn(`Write lock wait time ${lockWaitTime}ms for operation: ${operationName}`);
      }
      
      logger.debug(`Executing write operation: ${operationName} (waited ${lockWaitTime}ms)`);
      
      try {
        const result = await operationFn();
        return result;
      } finally {
        await this.releaseWriteLock();
        const totalTime = Date.now() - startTime;
        logger.debug(`Write operation completed: ${operationName} (total ${totalTime}ms)`);
      }
    } catch (error) {
      logger.error(`Write operation failed: ${operationName}`, error);
      throw error;
    }
  }

  async get(sql, params) {
    // Read operation - no locking required
    return this.db.get(sql, params);
  }

  async all(sql, params) {
    // Read operation - no locking required
    return this.db.all(sql, params);
  }

  // Wrapper methods for existing Database write operations
  async run(sql, params, timeoutMs) {
    return this.runWriteOperation('run', async () => {
      return this.db.run(sql, params);
    }, timeoutMs);
  }

  async exec(sql, timeoutMs) {
    return this.runWriteOperation('exec', async () => {
      return this.db.exec(sql);
    }, timeoutMs);
  }

  async updateSetupStatus(setupId, newStatus, updates, timeoutMs) {
    return this.runWriteOperation('updateSetupStatus', async () => {
      return this.db.updateSetupStatus(setupId, newStatus, updates);
    }, timeoutMs);
  }

  async createOrder(orderData, timeoutMs) {
    return this.runWriteOperation('createOrder', async () => {
      return this.db.createOrder(orderData);
    }, timeoutMs);
  }

  async updateOrderStatus(orderId, status, exchangeOrderId, timeoutMs) {
    return this.runWriteOperation('updateOrderStatus', async () => {
      return this.db.updateOrderStatus(orderId, status, exchangeOrderId);
    }, timeoutMs);
  }

  async getSetupsByStatus(statuses) {
    return this.db.getSetupsByStatus(statuses);
  }

  async getPendingSetupsBySymbolTimeframe() {
    return this.db.getPendingSetupsBySymbolTimeframe();
  }

  async getPendingSetupsForSymbolTimeframe(symbol, timeframe) {
    return this.db.getPendingSetupsForSymbolTimeframe(symbol, timeframe);
  }

  async getTriggeredSetupsBySymbolTimeframe() {
    return this.db.getTriggeredSetupsBySymbolTimeframe();
  }

  async getTriggeredSetupsForSymbolTimeframe(symbol, timeframe) {
    return this.db.getTriggeredSetupsForSymbolTimeframe(symbol, timeframe);
  }

  async getActiveSetups() {
    return this.db.getActiveSetups();
  }

  async getOrdersBySetupId(setupId) {
    return this.db.getOrdersBySetupId(setupId);
  }

  async getOrdersByStatus(setupId, statuses) {
    return this.db.getOrdersByStatus(setupId, statuses);
  }

  async getUserTelegramChatId(userId) {
    return this.db.getUserTelegramChatId(userId);
  }

  async getUserByEmail(email) {
    return this.db.getUserByEmail(email);
  }

  async getUserById(id) {
    return this.db.getUserById(id);
  }

async createUser(email, passwordHash, timeoutMs) {
    return this.runWriteOperation('createUser', async () => {
      return this.db.createUser(email, passwordHash);
    }, timeoutMs);
  }

  async updateUserPassword(id, hash, timeoutMs) {
    return this.runWriteOperation('updateUserPassword', async () => {
      return this.db.updateUserPassword(id, hash);
    }, timeoutMs);
  }

  async updateUserTelegramChatId(id, chatId, timeoutMs) {
    return this.runWriteOperation('updateUserTelegramChatId', async () => {
      return this.db.updateUserTelegramChatId(id, chatId);
    }, timeoutMs);
  }

  async createScreenerItem(data, timeoutMs) {
    return this.runWriteOperation('createScreenerItem', async () => {
      return this.db.createScreenerItem(data);
    }, timeoutMs);
  }

  async updateScreenerItem(id, userId, updates, timeoutMs) {
    return this.runWriteOperation('updateScreenerItem', async () => {
      return this.db.updateScreenerItem(id, userId, updates);
    }, timeoutMs);
  }

  async updateScreenerItemSignal(id, signal, checkedAt, timeoutMs) {
    return this.runWriteOperation('updateScreenerItemSignal', async () => {
      return this.db.updateScreenerItemSignal(id, signal, checkedAt);
    }, timeoutMs);
  }

  async updateScreenerItemAlerted(id, alertedAt, timeoutMs) {
    return this.runWriteOperation('updateScreenerItemAlerted', async () => {
      return this.db.updateScreenerItemAlerted(id, alertedAt);
    }, timeoutMs);
  }

  async deleteScreenerItem(id, userId, timeoutMs) {
    return this.runWriteOperation('deleteScreenerItem', async () => {
      return this.db.deleteScreenerItem(id, userId);
    }, timeoutMs);
  }

  async updateUserPassword(id, hash) {
    return this.runWriteOperation('updateUserPassword', async () => {
      return this.db.updateUserPassword(id, hash);
    });
  }

  async updateUserTelegramChatId(id, chatId) {
    return this.runWriteOperation('updateUserTelegramChatId', async () => {
      return this.db.updateUserTelegramChatId(id, chatId);
    });
  }

  async getSetupById(setupId) {
    return this.db.getSetupById(setupId);
  }

  async getScreenerItems(userId, enabledOnly = true) {
    return this.db.getScreenerItems(userId, enabledOnly);
  }

  async getScreenerItemById(id, userId) {
    return this.db.getScreenerItemById(id, userId);
  }

  async createScreenerItem(data) {
    return this.runWriteOperation('createScreenerItem', async () => {
      return this.db.createScreenerItem(data);
    });
  }

  async updateScreenerItem(id, userId, updates) {
    return this.runWriteOperation('updateScreenerItem', async () => {
      return this.db.updateScreenerItem(id, userId, updates);
    });
  }

  async updateScreenerItemSignal(id, signal, checkedAt) {
    return this.runWriteOperation('updateScreenerItemSignal', async () => {
      return this.db.updateScreenerItemSignal(id, signal, checkedAt);
    });
  }

  async updateScreenerItemAlerted(id, alertedAt) {
    return this.runWriteOperation('updateScreenerItemAlerted', async () => {
      return this.db.updateScreenerItemAlerted(id, alertedAt);
    });
  }

  async deleteScreenerItem(id, userId) {
    return this.runWriteOperation('deleteScreenerItem', async () => {
      return this.db.deleteScreenerItem(id, userId);
    });
  }

  async getScreenerItemsBySymbolTimeframe(symbol, timeframe, enabledOnly = true) {
    return this.db.getScreenerItemsBySymbolTimeframe(symbol, timeframe, enabledOnly);
  }

  async getSupplyDemandItems(userId, enabledOnly = true) {
    return this.db.getSupplyDemandItems(userId, enabledOnly);
  }

  async getSupplyDemandItemById(id, userId) {
    return this.db.getSupplyDemandItemById(id, userId);
  }

async createSupplyDemandItem(data, timeoutMs) {
    return this.runWriteOperation('createSupplyDemandItem', async () => {
      return this.db.createSupplyDemandItem(data);
    }, timeoutMs);
  }

  async updateSupplyDemandItem(id, userId, updates, timeoutMs) {
    return this.runWriteOperation('updateSupplyDemandItem', async () => {
      return this.db.updateSupplyDemandItem(id, userId, updates);
    }, timeoutMs);
  }

  async updateSupplyDemandItemSignal(id, signal, zonePrice, zoneTop, zoneBottom, zoneTf, checkedAt, timeoutMs) {
    return this.runWriteOperation('updateSupplyDemandItemSignal', async () => {
      return this.db.updateSupplyDemandItemSignal(id, signal, zonePrice, zoneTop, zoneBottom, zoneTf, checkedAt);
    }, timeoutMs);
  }

  async updateSupplyDemandItemAlerted(id, alertedAt, timeoutMs) {
    return this.runWriteOperation('updateSupplyDemandItemAlerted', async () => {
      return this.db.updateSupplyDemandItemAlerted(id, alertedAt);
    }, timeoutMs);
  }

  async deleteSupplyDemandItem(id, userId, timeoutMs) {
    return this.runWriteOperation('deleteSupplyDemandItem', async () => {
      return this.db.deleteSupplyDemandItem(id, userId);
    }, timeoutMs);
  }

  async beginTransaction(timeoutMs) {
    return this.runWriteOperation('beginTransaction', async () => {
      return this.db.beginTransaction();
    }, timeoutMs);
  }

  async commit(timeoutMs) {
    return this.runWriteOperation('commit', async () => {
      return this.db.commit();
    }, timeoutMs);
  }

  async rollback(timeoutMs) {
    return this.runWriteOperation('rollback', async () => {
      return this.db.rollback();
    }, timeoutMs);
  }

  async updateSupplyDemandItem(id, userId, updates) {
    return this.runWriteOperation('updateSupplyDemandItem', async () => {
      return this.db.updateSupplyDemandItem(id, userId, updates);
    });
  }

  async updateSupplyDemandItemSignal(id, signal, zonePrice, zoneTop, zoneBottom, zoneTf, checkedAt) {
    return this.runWriteOperation('updateSupplyDemandItemSignal', async () => {
      return this.db.updateSupplyDemandItemSignal(id, signal, zonePrice, zoneTop, zoneBottom, zoneTf, checkedAt);
    });
  }

  async updateSupplyDemandItemAlerted(id, alertedAt) {
    return this.runWriteOperation('updateSupplyDemandItemAlerted', async () => {
      return this.db.updateSupplyDemandItemAlerted(id, alertedAt);
    });
  }

  async deleteSupplyDemandItem(id, userId) {
    return this.runWriteOperation('deleteSupplyDemandItem', async () => {
      return this.db.deleteSupplyDemandItem(id, userId);
    });
  }

  async getSupplyDemandItemsBySymbolTimeframe(symbol, timeframe, enabledOnly = true) {
    return this.db.getSupplyDemandItemsBySymbolTimeframe(symbol, timeframe, enabledOnly);
  }

  async beginTransaction() {
    return this.runWriteOperation('beginTransaction', async () => {
      return this.db.beginTransaction();
    });
  }

  async commit() {
    return this.runWriteOperation('commit', async () => {
      return this.db.commit();
    });
  }

  async rollback() {
    return this.runWriteOperation('rollback', async () => {
      return this.db.rollback();
    });
  }

  getQueueStats() {
    return {
      queueLength: this.writeQueue.length,
      isProcessingWrite: this.isProcessingWrite,
      hasLock: !!this.writeLock,
      lockId: this.writeLock?.id,
      lockAcquiredAt: this.writeLock?.acquiredAt
    };
  }
}

module.exports = DatabaseManager;