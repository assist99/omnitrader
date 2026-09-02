// Auto-migration script for screener rework (v2 schema)
// Adds screener_snapshot table, drops obsolete screener_items/supply_demand_items
// Runs on application startup

const logger = require('../logger');

class ScreenerReworkMigration {
  constructor(db) {
    this.db = db;
  }

  async runMigration() {
    try {
      const needsMigration = await this.checkIfMigrationNeeded();
      if (!needsMigration) {
        logger.info('Screener snapshot table already exists — skipping migration');
        return false;
      }

      logger.info('Starting screener rework migration...');

      await this.db.beginTransaction();

      try {
        await this.db.exec(`
          CREATE TABLE IF NOT EXISTS screener_snapshot (
            symbol TEXT NOT NULL,
            timeframe TEXT NOT NULL,
            indicator_type TEXT NOT NULL,
            signal TEXT,
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            PRIMARY KEY (symbol, timeframe, indicator_type)
          )
        `);
        logger.info('Created screener_snapshot table');

        await this.db.exec(`
          CREATE INDEX IF NOT EXISTS idx_screener_snapshot_type ON screener_snapshot(indicator_type)
        `);
        logger.info('Created idx_screener_snapshot_type index');

        // Drop obsolete tables — no code references them anymore
        await this.db.exec('DROP TABLE IF EXISTS screener_items');
        await this.db.exec('DROP TABLE IF EXISTS supply_demand_items');
        logger.info('Dropped obsolete screener_items and supply_demand_items tables');

        await this.db.commit();
        logger.info('Screener rework migration completed successfully');
        return true;
      } catch (error) {
        await this.db.rollback();
        logger.error('Screener rework migration failed, transaction rolled back:', error);
        throw error;
      }
    } catch (error) {
      logger.error('Screener rework migration check failed:', error);
      throw error;
    }
  }

  async checkIfMigrationNeeded() {
    const snapshotExists = await this.db.get(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='screener_snapshot'"
    );
    return !snapshotExists;
  }
}

module.exports = ScreenerReworkMigration;