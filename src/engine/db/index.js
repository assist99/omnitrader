const Database = require('./database');
const DatabaseManager = require('./DatabaseManager');

// Create a singleton instance for global use
const globalDatabaseManager = new DatabaseManager();

module.exports = {
  Database, // For backward compatibility
  DatabaseManager,
  getDatabaseManager: () => globalDatabaseManager
};