const TimeUtils = require('../utils/timeUtils');
const CandleUtils = require('../utils/candleUtils');
const logger = require('../logger');

class PendingSetupService {
  static db = null;
  static telegramService = null;
  static stats = {
    setupsActivated: 0,
    setupsCancelled: 0,
    errors: 0
  };
  
  static setDeps(db, telegramService) {
    this.db = db;
    this.telegramService = telegramService;
  }

  static async cancelSetup(setup, reason) {
    try {
      await this.db.updateSetupStatus(setup.id, 'canceled', {
        closed_at: new Date().toISOString()
      });

      this.stats.setupsCancelled++;

      await this.telegramService.sendNotification(setup.user_id, 'setup_canceled', {
        setupId: setup.id,
        symbol: setup.symbol,
        side: setup.side,
        reason: reason,
        timestamp: new Date().toISOString()
      });

      logger.setupCancelled(setup.id, reason);
    } catch (error) {
      logger.error(`Error cancelling setup #${setup.id}:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  

  static async activateSetup(setup, lastCandle) {
    try {
      await this.db.updateSetupStatus(setup.id, 'triggered', {
        activated_at: new Date().toISOString()
      });

      await this.telegramService.sendNotification(setup.user_id, 'setup_activated', {
        setupId: setup.id,
        symbol: setup.symbol,
        side: setup.side,
        price: lastCandle.close,
        timestamp: new Date().toISOString()
      });

      this.stats.setupsActivated++;
      logger.setupActivated(setup.id, lastCandle.close);
    } catch (error) {
      logger.error(`Error activating setup #${setup.id}:`, error);
      this.stats.errors++;
      throw error;
    }
  }

  

  static async processItemFromCandle(symbol, timeframe, candles) {
    try {
      if (!this.db || !this.telegramService) {
        logger.warn('PendingSetupService deps not set, skipping setup processing');
        return;
      }
      
      const setups = await this.db.getPendingSetupsForSymbolTimeframe(symbol, timeframe);
      if (!setups || setups.length === 0) return;
      
      logger.debug(`Processing ${setups.length} pending setups for ${symbol} ${timeframe}`);
      
      for (const setup of setups) {
        await this.processPendingSetup(setup, candles);
      }
    } catch (error) {
      logger.error(`Error processing pending setups for ${symbol} ${timeframe}:`, error);
      this.stats.errors++;
    }
  }

  static async processPendingSetup(setup, candles) {
    logger.info(`Checking pending setup #${setup.id}`);
    
    if (!TimeUtils.isTriggerTime(setup.entry_indicator_tf)) {
      logger.debug(`Not trigger time for ${setup.entry_indicator_tf}. Skipping setup #${setup.id}`);
      return false;
    }
    
    const parsedCandles = CandleUtils.parseExchangeCandles(candles);
    const closedBars = CandleUtils.filterClosedBars(parsedCandles, setup.entry_indicator_tf);
    
    if (closedBars.length === 0) {
      logger.warn(`No closed bars available for setup #${setup.id}`);
      return false;
    }
    
    const lastCandle = closedBars[closedBars.length - 1];
    
    const ignoreBoxCheck = TimeUtils.isWithinIgnoreBox(lastCandle, setup.ignore_box_lower, setup.ignore_box_upper);
    if (!ignoreBoxCheck.within) {
      logger.info(`Setup #${setup.id} canceled: ${ignoreBoxCheck.reason}`);
      await this.cancelSetup(setup, ignoreBoxCheck.reason);
      return false;
    }
    
    const activationCheck = TimeUtils.shouldActivate(setup.side, lastCandle, setup.activation_price);
    if (activationCheck.shouldActivate) {
      logger.info(`Setup #${setup.id} activated: ${activationCheck.reason}`);
      await this.activateSetup(setup, lastCandle);
      return true;
    }
    
    logger.info(`Setup #${setup.id} not activated: ${activationCheck.reason}`);
    return false;
  }

  
}

module.exports = PendingSetupService;