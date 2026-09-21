const logger = require('../logger');

class SupertrendSubscriptionsMigration {
  constructor(db) {
    this.db = db;
  }

  async runMigration() {
    try {
      const needsMigration = await this.checkIfMigrationNeeded();
      if (!needsMigration) {
        logger.info('supertrend_tf_subscriptions and supertrend_asset_subscriptions tables already exist — skipping migration');
        return false;
      }

      logger.info('Starting SuperTrend subscriptions migration...');

      await this.db.beginTransaction();

      try {
        await this.db.exec(`
          CREATE TABLE IF NOT EXISTS supertrend_tf_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            timeframe TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, timeframe)
          )
        `);
        logger.info('Created supertrend_tf_subscriptions table');

        await this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_supertrend_tf_user ON supertrend_tf_subscriptions(user_id)
        `);
        logger.info('Created idx_supertrend_tf_user index');

        await this.db.exec(`
          CREATE TABLE IF NOT EXISTS supertrend_asset_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, symbol)
          )
        `);
        logger.info('Created supertrend_asset_subscriptions table');

        await this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_supertrend_asset_user ON supertrend_asset_subscriptions(user_id)
        `);
        logger.info('Created idx_supertrend_asset_user index');

        // Migrate old data if old table exists
        const oldTableExists = await this.db.get(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='supertrend_screener_subscriptions'"
        );
        if (oldTableExists) {
          logger.info('Migrating old supertrend_screener_subscriptions data...');

          // Migrate distinct timeframes per user
          await this.db.exec(`
            INSERT OR IGNORE INTO supertrend_tf_subscriptions (user_id, timeframe, enabled)
            SELECT DISTINCT user_id, timeframe, 1
            FROM supertrend_screener_subscriptions
            WHERE enabled = 1
          `);

          // Migrate distinct symbols per user
          await this.db.exec(`
            INSERT OR IGNORE INTO supertrend_asset_subscriptions (user_id, symbol, enabled)
            SELECT DISTINCT user_id, symbol, 1
            FROM supertrend_screener_subscriptions
            WHERE enabled = 1
          `);

          logger.info('Old data migrated successfully');
        }

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
    const tfExists = await this.db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='supertrend_tf_subscriptions'"
    );
    const assetExists = await this.db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='supertrend_asset_subscriptions'"
    );
    return !tfExists || !assetExists;
  }
}

module.exports = SupertrendSubscriptionsMigration;