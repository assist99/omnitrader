// Auto-migration script for price alarms.
// Adds price_alarms table. Runs on application startup.

const logger = require('../logger');

class PriceAlarmsMigration {
  constructor(db) {
    this.db = db;
  }

  async runMigration() {
    try {
      const needsMigration = await this.checkIfMigrationNeeded();
      if (!needsMigration) {
        logger.info('price_alarms table already exists — skipping migration');
        return false;
      }

      logger.info('Starting price alarms migration...');

      await this.db.beginTransaction();

      try {
        await this.db.exec(`
          CREATE TABLE IF NOT EXISTS price_alarms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            symbol TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            direction TEXT NOT NULL,
            price_level REAL NOT NULL,
            created_at TEXT DEFAULT (datetime('now'))
          )
        `);
        logger.info('Created price_alarms table');

        await this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_price_alarms_user ON price_alarms(user_id)
        `);
        await this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_price_alarms_lookup ON price_alarms(symbol, timeframe)
        `);
        logger.info('Created price_alarms indexes');

        await this.db.commit();
        logger.info('Price alarms migration completed successfully');
        return true;
      } catch (error) {
        await this.db.rollback();
        logger.error('Price alarms migration failed, transaction rolled back:', error);
        throw error;
      }
    } catch (error) {
      logger.error('Price alarms migration check failed:', error);
      throw error;
    }
  }

  async checkIfMigrationNeeded() {
    const exists = await this.db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='price_alarms'"
    );
    return !exists;
  }
}

module.exports = PriceAlarmsMigration;