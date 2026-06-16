const IndicatorService = require('./indicatorService');
const CandleUtils = require('../utils/candleUtils');
const TimeUtils = require('../utils/timeUtils');
const logger = require('../logger');

class SupplyDemandService {
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
      if (!closedBars || closedBars.length < 3) {
        logger.info(`Insufficient candles for supply/demand item ${item.id}: ${closedBars ? closedBars.length : 0}`);
        return;
      }

      const params = item.indicator_params ? JSON.parse(item.indicator_params) : {};
      
      const result = IndicatorService.checkCondition('supply_demand', closedBars, params);
      console.log('Check result for supply demand',result);
      if (result.error) {
        logger.error(`Error checking supply/demand for item ${item.id}: ${result.error}`);
        return;
      }

      const now = new Date().toISOString();
      const currentSignal = result.signal;
      const price = result.price ?? closedBars[closedBars.length - 1]?.close;

      if (currentSignal && currentSignal !== 'none' && currentSignal !== item.last_signal) {
        const signal = currentSignal;

        await telegramService.sendNotification(item.user_id, 'supply_demand_zone', {
          symbol: item.symbol,
          timeframe: item.timeframe,
          signal: signal,
          price: price,
          zoneTop: result.zoneTop,
          zoneBottom: result.zoneBottom,
          zonePrice: result.zonePrice,
          exchange: item.exchange,
          isTestnet: !!item.is_testnet
        });

        await db.updateSupplyDemandItemSignal(
          item.id, 
          signal, 
          result.zonePrice || null,
          result.zoneTop || null,
          result.zoneBottom || null,
          result.zoneTf || item.timeframe,
          now
        );
        await db.updateSupplyDemandItemAlerted(item.id, now);
        logger.info(`Supply/demand alert sent for ${item.symbol}: ${signal} zone at ${result.zonePrice}`);
      } else {
        await db.updateSupplyDemandItemSignal(
          item.id, 
          currentSignal || null,
          result.zonePrice || null,
          result.zoneTop || null,
          result.zoneBottom || null,
          result.zoneTf || item.timeframe,
          now
        );
        logger.info(`Supply/demand item ${item.id}: no zone detected (${currentSignal} vs ${item.last_signal})`);
      }
    } catch (error) {
      logger.error(`Error processing supply/demand item ${item.id}:`, error);
    }
  }

  static async processItemFromCandle(symbol, timeframe, closedBars) {
    try {
      if (!this.db || !this.telegramService) {
        logger.warn('SupplyDemandService deps not set, skipping item processing');
        return;
      }

      const parsed = CandleUtils.parseExchangeCandles(closedBars);
      const filtered = CandleUtils.filterClosedBars(parsed, timeframe);
      
      if (filtered.length < 3) {
        logger.debug(`Insufficient candles for supply/demand screener ${symbol}@${timeframe}: ${filtered.length}`);
        return;
      }

      // Query database for supply/demand items matching this symbol/timeframe
      const items = await this.db.getSupplyDemandItemsBySymbolTimeframe(symbol, timeframe, true);
      if (!items || items.length === 0) return;

      // Process all items in parallel for this symbol/timeframe
      const promises = items.map(item => 
        this.processItem(item, filtered, this.db, this.telegramService)
      );
      
      await Promise.all(promises);
      logger.debug(`Processed ${items.length} supply/demand items for ${symbol} ${timeframe}`);
    } catch (error) {
      logger.error(`Error in processItemFromCandle for ${symbol} ${timeframe}:`, error);
    }
  }

  static async processAll(db, engine, telegramService) {
    try {
      logger.info('Processing supply/demand items');

      const items = await db.getSupplyDemandItems(null, true);
      if (!items || items.length === 0) {
        logger.info('No enabled supply/demand items found');
        return;
      }

      const serviceCache = new Map();
      for (const item of items) {
        try {
          if (!TimeUtils.isTriggerTime(item.timeframe)) {
            logger.info(`Skipping supply/demand item ${item.id}: not trigger time for ${item.timeframe}`);
            continue;
          }

          const account = await db.get('SELECT * FROM exchange_accounts WHERE id = ?', [item.exchange_account_id]);
          if (!account) {
            logger.error(`Exchange account not found for supply/demand item ${item.id}`);
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
          if (unclosedParsedCandles.length < 3) {
            logger.info(`Insufficient candles for supply/demand item ${item.id}: ${unclosedParsedCandles.length}`);
            continue;
          }
          
          await this.processItem(item, closedBars, db, telegramService);
        } catch (error) {
          logger.error(`Error processing supply/demand item ${item.id}:`, error);
        }
      }
      logger.info(`Supply/demand processing completed. Processed ${items.length} items`);
    } catch (error) {
      logger.error('Error in supply/demand processAll:', error);
    }
  }
}

module.exports = SupplyDemandService;