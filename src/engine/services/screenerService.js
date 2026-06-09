const IndicatorService = require('./indicatorService');
const CandleUtils = require('../utils/candleUtils');
const TimeUtils = require('../utils/timeUtils');
const logger = require('../logger');

class ScreenerService {
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

  static async processAll(db, engine, telegramService) {
    try {
      logger.info('Processing screener items');

      const items = await db.getScreenerItems(null, true);
      if (!items || items.length === 0) {
        logger.info('No enabled screener items found');
        return;
      }

      const serviceCache = new Map();
      const promises = items.map(async (item) => {
        try {
          if (!TimeUtils.isTriggerTime(item.timeframe)) {
            logger.info(`Skipping screener item ${item.id}: not trigger time for ${item.timeframe}`);
            return;
          }

          const account = await db.get('SELECT * FROM exchange_accounts WHERE id = ?', [item.exchange_account_id]);
          if (!account) {
            logger.error(`Exchange account not found for screener item ${item.id}`);
            return;
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
          const parsedCandles = CandleUtils.parseExchangeCandles(candles);
          if (parsedCandles.length < 20) {
            logger.info(`Insufficient candles for screener item ${item.id}: ${parsedCandles.length}`);
            return;
          }
          logger.info(`Processing screener item ${item.id} for ${item.symbol} (${parsedCandles.length} candles)`);
          const params = item.indicator_params ? JSON.parse(item.indicator_params) : {};
          const result = IndicatorService.checkCondition(item.indicator_type, parsedCandles, params);
          logger.info(`Processed result item ${item.id}  for ${item.symbol} ${JSON.stringify(result,null,2)}`);

          if (result.error) {
            logger.error(`Error checking indicator for screener item ${item.id}: ${result.error}`);
            return;
          }

          const now = new Date().toISOString();
          const currentSignal = result.signal;
          const price = result.price ?? parsedCandles[parsedCandles.length - 1]?.close;

          if (currentSignal && currentSignal !== 'none' && currentSignal !== item.last_signal) {
            if (this.isCooldownElapsed(item.last_alerted_at, item.timeframe)) {
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
            }
          } else {
            await db.updateScreenerItemSignal(item.id, currentSignal || null, now);
            logger.info(`Screener item ${item.id}: no reversal (${currentSignal} vs ${item.last_signal})`);
          }
        } catch (error) {
          logger.error(`Error processing screener item ${item.id}:`, error);
        }
      });

      await Promise.allSettled(promises);
      logger.info(`Screener processing completed. Processed ${items.length} items`);
    } catch (error) {
      logger.error('Error in screener processAll:', error);
    }
  }
}

module.exports = ScreenerService;