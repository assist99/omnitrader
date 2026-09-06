// Auto-migration script for MA Z-Score screener per-user telegram subscriptions.
// Adds mazscore_tf_subscriptions and mazscore_asset_subscriptions tables. Runs on application startup.

const logger = require('../logger');

class MazscoreSubscriptionsMigration {
  constructor(db) {
    this.db = db;
  }

  async runMigration() {
    try {
      const needsMigration = await this.checkIfMigrationNeeded();
      if (!needsMigration) {
        logger.info('mazscore_tf_subscriptions and mazscore_asset_subscriptions tables already exist — skipping migration');
        return false;
      }

      logger.info('Starting MA Z-Score subscriptions migration...');

      await this.db.beginTransaction();

      try {
        await this.db.exec(`
          CREATE TABLE IF NOT EXISTS mazscore_tf_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            timeframe TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, timeframe)
          )
        `);
        logger.info('Created mazscore_tf_subscriptions table');

        await this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_mazscore_tf_user ON mazscore_tf_subscriptions(user_id)
        `);
        logger.info('Created idx_mazscore_tf_user index');

        await this.db.exec(`
          CREATE TABLE IF NOT EXISTS mazscore_asset_subscriptions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL,
            enabled INTEGER NOT NULL DEFAULT 1,
            created_at TEXT DEFAULT (datetime('now')),
            UNIQUE(user_id, symbol)
          )
        `);
        logger.info('Created mazscore_asset_subscriptions table');

        await this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_mazscore_asset_user ON mazscore_asset_subscriptions(user_id)
        `);
        logger.info('Created idx_mazscore_asset_user index');

        await this.db.commit();
        logger.info('MA Z-Score subscriptions migration completed successfully');
        return true;
      } catch (error) {
        await this.db.rollback();
        logger.error('MA Z-Score subscriptions migration failed, transaction rolled back:', error);
        throw error;
      }
    } catch (error) {
      logger.error('MA Z-Score subscriptions migration check failed:', error);
      throw error;
    }
  }

  async checkIfMigrationNeeded() {
    const tfExists = await this.db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='mazscore_tf_subscriptions'"
    );
    const assetExists = await this.db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='mazscore_asset_subscriptions'"
    );
    return !tfExists || !assetExists;
  }
}

module.exports = MazscoreSubscriptionsMigration;