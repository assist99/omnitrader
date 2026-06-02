const TimeUtils = require('../utils/timeUtils');
const CandleUtils = require('../utils/candleUtils');
const logger = require('../logger');

class PendingSetupService {
  static async cancelSetup(ctx, setup, reason) {
    try {
      await ctx.db.updateSetupStatus(setup.id, 'canceled', {
        closed_at: new Date().toISOString()
      });

      ctx.stats.setupsCancelled++;

      await ctx.telegramService.sendNotification(setup.user_id, 'setup_cancelled', {
        setupId: setup.id,
        symbol: setup.symbol,
        side: setup.side,
        reason: reason,
        timestamp: new Date().toISOString()
      });

      logger.setupCancelled(setup.id, reason);
    } catch (error) {
      logger.error(`Error cancelling setup #${setup.id}:`, error);
      throw error;
    }
  }

  static async activateSetup(ctx, setup, lastCandle) {
    try {
      await ctx.db.updateSetupStatus(setup.id, 'triggered', {
        activated_at: new Date().toISOString()
      });

      await ctx.telegramService.sendNotification(setup.user_id, 'setup_activated', {
        setupId: setup.id,
        symbol: setup.symbol,
        side: setup.side,
        price: lastCandle.close,
        timestamp: new Date().toISOString()
      });

      logger.setupActivated(setup.id, lastCandle.close);
    } catch (error) {
      logger.error(`Error activating setup #${setup.id}:`, error);
      throw error;
    }
  }

  static async processPendingSetup(ctx, setup) {
    logger.info(`Checking pending setup #${setup.id}`);

    if (!TimeUtils.isTriggerTime(setup.entry_indicator_tf)) {
      logger.info(`Not trigger time for ${setup.entry_indicator_tf}. Skipping setup #${setup.id}`);
      return false;
    }

    const bybitService = await ctx.getBybitService(setup.account_id, setup.api_key_enc, setup.api_secret_enc, setup.is_testnet);

    const candles = await bybitService.getCandles(setup.symbol, setup.entry_indicator_tf, 100);
    const parsedCandles = CandleUtils.parseBybitCandles(candles);
    const closedBars = CandleUtils.filterClosedBars(parsedCandles);

    if (closedBars.length === 0) {
      logger.warn(`No closed bars available for setup #${setup.id}`);
      return false;
    }

    const lastCandle = closedBars[closedBars.length - 1];
    const currentPrice = lastCandle.close;

    const ignoreBoxCheck = TimeUtils.isWithinIgnoreBox(currentPrice, setup.ignore_box_lower, setup.ignore_box_upper);
    if (!ignoreBoxCheck.within) {
      logger.info(`Setup #${setup.id} cancelled: ${ignoreBoxCheck.reason}`);
      await this.cancelSetup(ctx, setup, ignoreBoxCheck.reason);
      return false;
    }

    const activationCheck = TimeUtils.shouldActivate(setup.side, lastCandle, setup.activation_price);
    if (activationCheck.shouldActivate) {
      logger.info(`Setup #${setup.id} activated: ${activationCheck.reason}`);
      await this.activateSetup(ctx, setup, lastCandle);
      return true;
    }

    logger.info(`Setup #${setup.id} not activated: ${activationCheck.reason}`);
    return false;
  }
}

module.exports = PendingSetupService;