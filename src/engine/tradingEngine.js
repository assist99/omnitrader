const Database = require('./db/database');
const ExchangeService = require('./services/ExchangeService');
const TelegramService = require('./services/telegramService');
const PendingSetupService = require('./services/pendingSetupService');
const EntryService = require('./services/entryService');
const ActiveSetupService = require('./services/activeSetupService');
const logger = require('./logger');

class TradingEngine {
  constructor() {
    this.db = new Database();
    this.telegramService = new TelegramService(this.db);
    this.exchangeServices = new Map();
    this.isInitialized = false;
    this.stats = {
      totalSetupsProcessed: 0,
      setupsActivated: 0,
      setupsCancelled: 0,
      ordersPlaced: 0,
      errors: 0,
      lastRun: null
    };
  }

  async initialize() {
    try {
      await this.db.connect();
      logger.info('Trading engine initialized');
      this.isInitialized = true;
      return true;
    } catch (error) {
      logger.error('Failed to initialize trading engine:', error);
      throw error;
    }
  }

  async processAllSetups() {
    if (!this.isInitialized) {
      throw new Error('Trading engine not initialized');
    }

    try {
      logger.info('Starting to process all setups');

      const setups = await this.db.getSetupsByStatus(['pending', 'triggered', 'active']);

      logger.info(`Found ${setups.length} setups to process`);
      this.stats.totalSetupsProcessed += setups.length;

      const setupPromises = setups.map(async setup => {
        try {
          await this.processSetup(setup);
        } catch (error) {
          logger.error(`Error processing setup #${setup.id}:`, error);
          this.stats.errors++;

          await this.sendErrorNotification(setup.user_id, {
            component: 'TradingEngine',
            error: error.message,
            details: `Setup #${setup.id} - ${setup.symbol}`,
            timestamp: new Date().toISOString()
          });
        }
      });

      await Promise.allSettled(setupPromises);

      this.stats.lastRun = new Date().toISOString();
      logger.info(`Processing completed. Stats: ${JSON.stringify(this.stats, null, 2)}`);

      return this.stats;
    } catch (error) {
      logger.error('Error in processAllSetups:', error);
      throw error;
    }
  }

  async processSetup(setup) {
    logger.info(`Processing setup #${setup.id}: ${setup.symbol} ${setup.side} (${setup.status})`);

    switch (setup.status) {
      case 'pending':
        const rt = await PendingSetupService.processPendingSetup(this, setup);
        if (!rt) break;
      case 'triggered':
        await EntryService.processTriggeredSetup(this, setup);
        break;
      case 'active':
        await ActiveSetupService.processActiveSetup(this, setup);
        break;
      default:
        logger.warn(`Unknown setup status: ${setup.status} for setup #${setup.id}`);
    }
  }

  async getExchangeService(accountId, exchange, apiKeyEnc, apiSecretEnc, isTestnet) {
    const cacheKey = `${accountId}_${exchange}_${isTestnet ? 'test' : 'main'}`;

    if (!this.exchangeServices.has(cacheKey)) {
      const service = new ExchangeService(exchange, apiKeyEnc, apiSecretEnc, isTestnet);
      this.exchangeServices.set(cacheKey, service);
    }

    return this.exchangeServices.get(cacheKey);
  }

  async sendErrorNotification(userId, errorData) {
    try {
      await this.telegramService.sendNotification(userId, 'error', errorData);
    } catch (error) {
      logger.error('Failed to send error notification:', error);
    }
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      stats: this.stats,
      exchangeServicesCount: this.exchangeServices.size,
      telegramAvailable: this.telegramService.isAvailable()
    };
  }

  async cleanup() {
    try {
      await this.db.disconnect();
      this.exchangeServices.clear();
      this.isInitialized = false;
      logger.info('Trading engine cleaned up');
    } catch (error) {
      logger.error('Error cleaning up trading engine:', error);
    }
  }
}

module.exports = TradingEngine;