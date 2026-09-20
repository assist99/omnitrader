// Auto-migration script to add be_activated column to trading_setups
// Runs on application startup

const logger = require('../logger');

class BeActivatedMigration {
  constructor(db) {
    this.db = db;
  }

  async runMigration() {
    try {
      const needsMigration = await this.checkIfMigrationNeeded();
      if (!needsMigration) {
        logger.info('be_activated column already exists — skipping migration');
        return false;
      }

      logger.info('Starting be_activated migration...');
      await this.db.beginTransaction();

      try {
        await this.db.exec(`
          ALTER TABLE trading_setups 
          ADD COLUMN be_activated INTEGER DEFAULT 0
        `);
        logger.info('Added be_activated column to trading_setups table');

        await this.db.commit();
        logger.info('be_activated migration completed successfully');
        return true;
      } catch (error) {
        await this.db.rollback();
        logger.error('be_activated migration failed, transaction rolled back:', error);
        throw error;
      }
    } catch (error) {
      logger.error('be_activated migration check failed:', error);
      throw error;
    }
  }

  async checkIfMigrationNeeded() {
    const columns = await this.db.all(
      "PRAGMA table_info(trading_setups)"
    );
    return !columns.some(col => col.name === 'be_activated');
  }
}

module.exports = BeActivatedMigration;