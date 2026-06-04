const IndicatorService = require('./indicatorService');
const PriceUtils = require('../utils/priceUtils');
const TimeUtils = require('../utils/timeUtils');
const CandleUtils = require('../utils/candleUtils');
const logger = require('../logger');

class ActiveSetupService {
  static async processActiveSetup(ctx, setup) {
    logger.info(`Processing active setup #${setup.id}`);

    const bybitService = await ctx.getBybitService(setup.account_id, setup.api_key_enc, setup.api_secret_enc, setup.is_testnet);

    const positions = await bybitService.getPositions(setup.symbol);
    if (positions.length === 0 || positions.every(p => parseFloat(p.size) === 0)) {
      logger.info(`Position not found for setup #${setup.id}. Marking as closed.`);
      await this.closeSetup(ctx, setup, 'Position not found');
      return;
    }

    if (setup.exit_indicator_type && setup.exit_indicator_tf) {
      if (TimeUtils.isTriggerTime(setup.exit_indicator_tf)) {
        await this.checkExitCondition(ctx, setup, bybitService);
      }
    }

    await this.updateOrderStatuses(ctx, setup, bybitService);

    if (TimeUtils.isTriggerTime(setup.entry_indicator_tf)) {
      await this.checkBreakEven(ctx, setup, bybitService);
    }

  }

  static async checkExitCondition(ctx, setup, bybitService) {
    try {
      const candles = await bybitService.getCandles(setup.symbol, setup.exit_indicator_tf, 100);
      const parsedCandles = CandleUtils.parseBybitCandles(candles);
      const closedBars = CandleUtils.filterClosedBars(parsedCandles, setup.exit_indicator_tf);

      if (closedBars.length === 0) return;

      const ticker = await bybitService.getTicker(setup.symbol);
      const currentPrice = parseFloat(ticker.lastPrice);

      const isInProfit = setup.side === 'long'
        ? currentPrice > setup.entry_price
        : currentPrice < setup.entry_price;

      if (!isInProfit) {
        logger.info(`Setup #${setup.id} not in profit. Skipping exit check.`);
        return;
      }

      const exitResult = IndicatorService.checkCondition(
        setup.exit_indicator_type,
        closedBars,
        IndicatorService.getIndicatorParameters(setup.exit_indicator_type)
      );

      if (exitResult.met) {
        logger.info(`Exit condition met for setup #${setup.id}`);
        await this.closePosition(ctx, setup, bybitService, 'exit_condition');
      }
    } catch (error) {
      logger.error(`Error checking exit condition for setup #${setup.id}:`, error);
    }
  }

  static async checkBreakEven(ctx, setup, bybitService) {
    try {
      if (!setup.be_enabled) return;

      const orders = await ctx.db.getOrdersBySetupId(setup.id);
      const tp1Order = orders.find(o => o.order_type === 'tp1');

      if (!tp1Order || tp1Order.status !== 'filled') return;

      const slOrder = orders.find(o => o.order_type === 'sl');
      if (slOrder.price === setup.entry_price) return;

      await bybitService.cancelOrder(slOrder.bybit_order_id, setup.symbol);

      const newSlOrder = await bybitService.placeOrder({
        symbol: setup.symbol,
        side: setup.side === 'long' ? 'Sell' : 'Buy',
        orderType: 'Limit',
        qty: setup.entry_qty,
        price: setup.entry_price,
        timeInForce: 'GTC'
      });

      await ctx.db.updateOrderStatus(slOrder.id, 'canceled');
      await ctx.db.createOrder({
        setup_id: setup.id,
        order_type: 'sl',
        side: setup.side === 'long' ? 'sell' : 'buy',
        price: setup.entry_price,
        qty: setup.entry_qty,
        bybit_order_id: newSlOrder.orderId,
        status: 'pending'
      });

      await ctx.telegramService.sendNotification(setup.user_id, 'be_activated', {
        setupId: setup.id,
        symbol: setup.symbol,
        entryPrice: setup.entry_price,
        timestamp: new Date().toISOString()
      });

      logger.beActivated(setup.id);
    } catch (error) {
      logger.error(`Error checking break-even for setup #${setup.id}:`, error);
    }
  }

  static async updateOrderStatuses(ctx, setup, bybitService) {
    try {
      const orders = await ctx.db.getOrdersBySetupId(setup.id);

      for (const order of orders) {
        if (order.status === 'pending' && order.bybit_order_id) {
          const status = await bybitService.getOrderStatus(order.bybit_order_id, setup.symbol);
          if (!status) {
            logger.warn(`Order status not found for order ${order.id} (Bybit ID: ${order.bybit_order_id})`);
            continue;
          }
          if (status.orderStatus === 'Filled') {
            await ctx.db.updateOrderStatus(order.id, 'filled');

            await ctx.telegramService.sendNotification(setup.user_id, 'order_filled', {
              setupId: setup.id,
              symbol: setup.symbol,
              orderType: order.order_type,
              side: order.side,
              price: order.price,
              quantity: order.qty,
              timestamp: new Date().toISOString()
            });

            logger.orderFilled(setup.id, order.order_type, order.price);

            if (order.order_type.startsWith('tp')) {
              const tpLevel = parseInt(order.order_type.replace('tp', ''));
              const pnl = PriceUtils.calculatePnl(setup.entry_price, order.price, order.qty, setup.side);

              await ctx.telegramService.sendNotification(setup.user_id, 'tp_hit', {
                setupId: setup.id,
                symbol: setup.symbol,
                tpLevel: tpLevel,
                price: order.price,
                quantity: order.qty,
                pnl: pnl,
                timestamp: new Date().toISOString()
              });

              logger.tpHit(setup.id, tpLevel, order.price, pnl.netPnl);
            } else if (order.order_type === 'sl') {
              const pnl = PriceUtils.calculatePnl(setup.entry_price, order.price, order.qty, setup.side);

              await ctx.telegramService.sendNotification(setup.user_id, 'sl_hit', {
                setupId: setup.id,
                symbol: setup.symbol,
                price: order.price,
                quantity: order.qty,
                pnl: pnl,
                timestamp: new Date().toISOString()
              });

              logger.slHit(setup.id, order.price, pnl.netPnl);

              await this.closeSetup(ctx, setup, 'stop_loss_hit');
              return;
            }
          } else if (status.orderStatus === 'Cancelled' || status.orderStatus === 'Rejected') {
            await ctx.db.updateOrderStatus(order.id, status.orderStatus.toLowerCase());
          }
        }
      }

      const updatedSetup = await ctx.db.getSetupById(setup.id);
      if (updatedSetup?.status === 'active') {
        await this.updateSetupProfit(ctx, updatedSetup, bybitService);
      }
    } catch (error) {
      logger.error(`Error updating order statuses for setup #${setup.id}:`, error);
    }
  }

  static async updateSetupProfit(ctx, setup, bybitService, currentPrice = null) {
    if (!setup.entry_price || !setup.entry_qty) {
      return;
    }

    try {
      const price = currentPrice !== null ? currentPrice : parseFloat((await bybitService.getTicker(setup.symbol)).lastPrice);
      const pnl = PriceUtils.calculatePnl(setup.entry_price, price, setup.entry_qty, setup.side);
      await ctx.db.updateSetupStatus(setup.id, setup.status, { profit: pnl.netPnl });
    } catch (error) {
      logger.error(`Error updating profit for setup #${setup.id}:`, error);
    }
  }

  static async closePosition(ctx, setup, bybitService, reason) {
    try {
      await bybitService.closePosition(setup.symbol, setup.side);

      const orders = await ctx.db.getOrdersBySetupId(setup.id);
      for (const order of orders) {
        if (order.status === 'pending' && order.bybit_order_id) {
          try {
            await bybitService.cancelOrder(order.bybit_order_id, setup.symbol);
            await ctx.db.updateOrderStatus(order.id, 'canceled');
          } catch (error) {
            logger.error(`Error cancelling order ${order.id}:`, error);
          }
        }
      }

      await this.closeSetup(ctx, setup, reason);
      logger.info(`Position closed for setup #${setup.id}: ${reason}`);
    } catch (error) {
      logger.error(`Error closing position for setup #${setup.id}:`, error);
      throw error;
    }
  }

  static async closeSetup(ctx, setup, reason) {
    try {
      const closePayload = {
        closed_at: new Date().toISOString()
      };

      let bybitService;
      let pnl;
      let currentPrice;

      if (setup.entry_price && setup.entry_qty) {
        bybitService = await ctx.getBybitService(setup.account_id, setup.api_key_enc, setup.api_secret_enc, setup.is_testnet);
        const ticker = await bybitService.getTicker(setup.symbol);
        currentPrice = parseFloat(ticker.lastPrice);
        pnl = PriceUtils.calculatePnl(setup.entry_price, currentPrice, setup.entry_qty, setup.side);
        closePayload.profit = pnl.netPnl;
      }

      await ctx.db.updateSetupStatus(setup.id, 'closed', closePayload);

      if (reason === 'exit_condition' && pnl) {
        await ctx.telegramService.sendNotification(setup.user_id, 'exit_triggered', {
          setupId: setup.id,
          symbol: setup.symbol,
          exitIndicatorType: setup.exit_indicator_type,
          exitIndicatorTf: setup.exit_indicator_tf,
          price: currentPrice,
          pnl: pnl,
          timestamp: new Date().toISOString()
        });

        logger.exitTriggered(setup.id, reason);
      }
    } catch (error) {
      logger.error(`Error closing setup #${setup.id}:`, error);
      throw error;
    }
  }
}

module.exports = ActiveSetupService;