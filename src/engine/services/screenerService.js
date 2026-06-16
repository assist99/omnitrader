const IndicatorService = require('./indicatorService');
const CandleUtils = require('../utils/candleUtils');
const TimeUtils = require('../utils/timeUtils');
const logger = require('../logger');

class ScreenerService {
  static db = null;
  static telegramService = null;

  static setDeps(db, telegramService) {
    this.db = db;
    this.telegramService = telegramService;
  }

  static getTimeframeDurationMinutes(timeframe) {
    const tfMap = {
      'm1': 1, 'm5': 5, 'm15': 15, 'm30': 30,
      'h1': 60, 'h2': 120, 'h4': 240, 'd1': 1440
    };
    return tfMap[timeframe] || 60;
  }

  static isCooldownElapsed(lastAlertedAt, timeframe) {
    if (!lastAlertedAt) return true;
    const durationMs = this.getTimeframeDurationMinutes(timeframe) * 60 * 1000;
    const elapsed = Date.now() - new Date(lastAlertedAt).getTime();
    return elapsed >= durationMs;
  }

  static async processItem(item, closedBars, db, telegramService) {
    try {
      if (!closedBars || closedBars.length < 20) {
        logger.info(`Insufficient candles for screener item ${item.id}: ${closedBars ? closedBars.length : 0}`);
        return;
      }
      const params = item.indicator_params ? JSON.parse(item.indicator_params) : {};
      const result = IndicatorService.checkCondition(item.indicator_type, closedBars, params);
      
      if (result.error) {
        logger.error(`Error checking indicator for screener item ${item.id}: ${result.error}`);
        return;
      }

      const now = new Date().toISOString();
      const currentSignal = result.signal;
      const price = result.price ?? closedBars[closedBars.length - 1]?.close;
      if (currentSignal && currentSignal !== 'none') {
        const signal = currentSignal;

        await telegramService.sendNotification(item.user_id, 'screener_reversal', {
          symbol: item.symbol,
          timeframe: item.timeframe,
          indicatorType: item.indicator_type,
          signal: signal,
          price: price,
          exchange: item.exchange,
          isTestnet: !!item.is_testnet
        });

        await db.updateScreenerItemSignal(item.id, signal, now);
        await db.updateScreenerItemAlerted(item.id, now);
        logger.info(`Screener alert sent for ${item.symbol}: ${signal}`);
      } else {
        //await db.updateScreenerItemSignal(item.id, currentSignal || null, now);
        logger.info(`Screener item ${item.id}: no reversal (${currentSignal} vs ${item.last_signal})`);
      }
    } catch (error) {
      logger.error(`Error processing screener item ${item.id}:`, error);
    }
  }

  static async processItemFromCandle(symbol, timeframe, closedBars) {
    try {
      if (!this.db || !this.telegramService) {
        logger.warn('ScreenerService deps not set, skipping item processing');
        return;
      }

      const parsed = CandleUtils.parseExchangeCandles(closedBars);
      const filtered = CandleUtils.filterClosedBars(parsed, timeframe);
      
      if (filtered.length < 20) {
        logger.debug(`Insufficient candles for screener ${symbol}@${timeframe}: ${filtered.length}`);
        return;
      }
      
      // Query database for screener items matching this symbol/timeframe
      const items = await this.db.getScreenerItemsBySymbolTimeframe(symbol, timeframe, true);
      if (!items || items.length === 0) return;
      
      // Process all items in parallel for this symbol/timeframe
      const promises = items.map(item => 
        this.processItem(item, filtered, this.db, this.telegramService)
      );
      
      await Promise.all(promises);
      logger.debug(`Processed ${items.length} screener items for ${symbol} ${timeframe}`);
    } catch (error) {
      logger.error(`Error in processItemFromCandle for ${symbol} ${timeframe}:`, error);
    }
  }

  static async processAll(db, engine, telegramService) {
    try {
      logger.info('Processing screener items');

      const items = await db.getScreenerItems(null, true);
      if (!items || items.length === 0) {
        logger.info('No enabled screener items found');
        return;
      }

      const serviceCache = new Map();
      for (const item of items) {
        try {
          if (!TimeUtils.isTriggerTime(item.timeframe)) {
            logger.info(`Skipping screener item ${item.id}: not trigger time for ${item.timeframe}`);
            continue;
          }

          const account = await db.get('SELECT * FROM exchange_accounts WHERE id = ?', [item.exchange_account_id]);
          if (!account) {
            logger.error(`Exchange account not found for screener item ${item.id}`);
            continue;
          }

          const cacheKey = `${item.exchange_account_id}`;
          let service = serviceCache.get(cacheKey);
          if (!service) {
            service = await engine.getExchangeService(
              item.exchange_account_id,
              account.exchange,
              account.api_key_enc,
              account.api_secret_enc,
              account.is_testnet
            );
            serviceCache.set(cacheKey, service);
          }

          const candles = await service.getCandles(item.symbol, item.timeframe, 100);
          const unclosedParsedCandles = CandleUtils.parseExchangeCandles(candles);
          const closedBars = CandleUtils.filterClosedBars(unclosedParsedCandles, item.timeframe);
          if (unclosedParsedCandles.length < 20) {
            logger.info(`Insufficient candles for screener item ${item.id}: ${unclosedParsedCandles.length}`);
            continue;
          }
          
          await this.processItem(item, closedBars, db, telegramService);
        } catch (error) {
          logger.error(`Error processing screener item ${item.id}:`, error);
        }
      }
      logger.info(`Screener processing completed. Processed ${items.length} items`);
    } catch (error) {
      logger.error('Error in screener processAll:', error);
    }
  }
}

module.exports = ScreenerService;