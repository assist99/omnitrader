# Global Database Processor with Write Locking - Implementation Plan

## Problem Analysis

Current system creates multiple independent Database instances:
1. `TradingEngine` creates its own `new Database()` instance
2. `ScreenerCandleProvider` creates its own `new Database()` instance
3. Both services run concurrently in production via `servicesLauncher.js`

This leads to:
- Concurrent write operations without synchronization
- SQLite database file contention
- Potential data corruption or lost writes
- Race conditions in update operations

## Scope

Focus on synchronizing `TradingEngine` and `ScreenerCandleProvider` only (per user request).

## Solution Architecture

### 1. Global Database Manager Pattern
Create a singleton/global database manager that:
- Provides a single shared database connection instance
- Manages write queue with locking mechanism
- Ensures only one write operation executes at a time
- Allows concurrent read operations

### 2. Write Locking Strategy
Implement a mutex/queue-based locking mechanism:
- Use `async-mutex` or similar lightweight library
- Queue write operations and process them sequentially
- Allow concurrent reads when no writes are pending
- Provide timeout and error handling for write operations

## Implementation Steps

### Phase 1: Create Global Database Manager

**File: `src/engine/db/DatabaseManager.js`**
```javascript
const Database = require('./database');
const logger = require('../logger');

class DatabaseManager {
  constructor() {
    this.db = new Database();
    this.isConnected = false;
    this.writeQueue = [];
    this.isProcessingWrite = false;
    this.writeLock = null;
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

  async acquireWriteLock() {
    // Implement write locking
  }

  async releaseWriteLock() {
    // Implement lock release
  }

  async runWriteOperation(operationName, sql, params) {
    // Queue and execute writes with locking
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
  async run(sql, params) {
    return this.runWriteOperation('run', sql, params);
  }

  async exec(sql) {
    return this.runWriteOperation('exec', sql, params);
  }

  async updateSetupStatus(setupId, newStatus, updates) {
    return this.runWriteOperation('updateSetupStatus', async () => {
      return this.db.updateSetupStatus(setupId, newStatus, updates);
    });
  }

  async createOrder(orderData) {
    return this.runWriteOperation('createOrder', async () => {
      return this.db.createOrder(orderData);
    });
  }

  async updateOrderStatus(orderId, status, exchangeOrderId) {
    return this.runWriteOperation('updateOrderStatus', async () => {
      return this.db.updateOrderStatus(orderId, status, exchangeOrderId);
    });
  }
}
```

### Phase 2: Modify Existing Services to Use Global Manager

**File: `src/engine/tradingEngine.js`**
- Replace `new Database()` with `globalDatabaseManager`
- Ensure proper connection lifecycle
- Update methods to use DatabaseManager's write operations

**File: `src/engine/screenerCandleProvider.js`**
- Replace `new Database()` with `globalDatabaseManager`
- Update service initialization

**File: `src/engine/services/telegramService.js`**
- Modify constructor to accept DatabaseManager instance

**File: `src/engine/services/screenerService.js`**
- Update static `setDeps` to handle DatabaseManager

### Phase 3: Implement Export Mechanism

**File: `src/engine/db/index.js`**
```javascript
const DatabaseManager = require('./DatabaseManager');
const globalDatabaseManager = new DatabaseManager();

module.exports = {
  Database, // For backward compatibility
  DatabaseManager,
  getDatabaseManager: () => globalDatabaseManager
};
```

**Update `src/engine/db/database.js` exports:**
- Export Database class normally
- Import globalDatabaseManager for migration use

### Phase 4: Update Service Dependencies

**File: `src/engine/servicesLauncher.js`**
- Ensure both services share the same DatabaseManager instance
- Add connection management in startup/shutdown

### Phase 5: Testing Strategy

1. **Concurrent Write Test**: Simulate multiple write operations
2. **Locking Test**: Verify writes are processed sequentially
3. **Read-Write Test**: Ensure reads work while writes are pending
4. **Error Recovery Test**: Handle write failures gracefully

## Technical Details

### Write Locking Implementation Options

**Option A: Simple Queue with Promise Chain**
```javascript
async runWriteOperation(operationName, operationFn) {
  return new Promise((resolve, reject) => {
    this.writeQueue.push({ operationName, operationFn, resolve, reject });
    this.processWriteQueue();
  });
}
```

**Option B: Use `async-mutex` Library**
- More robust mutual exclusion
- Built-in timeout and error handling
- Less custom implementation

### Timeout and Error Handling
- Set timeout for write operations (e.g., 30 seconds)
- Implement retry logic for transient failures
- Log detailed write operation metrics

### Monitoring and Logging
- Add write queue metrics (size, wait time)
- Log lock acquisition/release
- Monitor for potential deadlocks

## Migration Considerations

1. **Backward Compatibility**: Maintain existing Database class API
2. **API Routes**: Continue using independent Database instances (per user request)
3. **CLI Scripts**: Continue using independent Database instances (per user request)
4. **Data Integrity**: Ensure no data loss during migration

## Key Dependencies

- `async-mutex` (optional, for robust locking)
- Update `package.json` if using external library

## Success Criteria

1. ✅ No concurrent writes to SQLite database
2. ✅ Write operations processed sequentially
3. ✅ Read operations not blocked by writes
4. ✅ TradingEngine and ScreenerCandleProvider share single connection
5. ✅ System remains stable under load
6. ✅ No data corruption or lost writes
7. ✅ Proper error handling and recovery
8. ✅ No impact on API routes or CLI tools

## Rollback Plan

If issues arise:
1. Keep original `database.js` intact
2. Revert services to use `new Database()`
3. Remove DatabaseManager imports
4. Restore original service initialization