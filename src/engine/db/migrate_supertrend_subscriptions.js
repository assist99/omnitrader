// Auto-migration script for SuperTrend screener per-user telegram subscriptions.
// Adds supertrend_screener_subscriptions table. Runs on application startup.

const logger = require('../logger');

class SupertrendSubscriptionsMigration {
  constructor(db) {
    this.db = db;
  }

  async runMigration() {
    try {
      const needsMigration = await this.checkIfMigrationNeeded();
      if (!needsMigration) {
        logger.info('supertrend_screener_subscriptions table already exists — skipping migration');
        return false;
      }

      logger.info('Starting SuperTrend subscriptions migration...');

      await this.db.beginTransaction();

      try {
        await this.db.exec(`
          CREATE TABLE IF NOT EXISTS supertrend_screener_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, symbol, timeframe)
          )
        `);
        logger.info('Created supertrend_screener_subscriptions table');

        await this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_supertrend_sub_user ON supertrend_screener_subscriptions(user_id)
        `);
        logger.info('Created idx_supertrend_sub_user index');

        await this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_supertrend_sub_lookup ON supertrend_screener_subscriptions(symbol, timeframe)
        `);
        logger.info('Created idx_supertrend_sub_lookup index');

        await this.db.commit();
        logger.info('SuperTrend subscriptions migration completed successfully');
        return true;
      } catch (error) {
        await this.db.rollback();
        logger.error('SuperTrend subscriptions migration failed, transaction rolled back:', error);
        throw error;
      }
    } catch (error) {
      logger.error('SuperTrend subscriptions migration check failed:', error);
      throw error;
    }
  }

  async checkIfMigrationNeeded() {
    const exists = await this.db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='supertrend_screener_subscriptions'"
    );
    return !exists;
  }
}

module.exports = SupertrendSubscriptionsMigration;