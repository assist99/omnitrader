const IndicatorService = require('./indicatorService');
const PriceUtils = require('../utils/priceUtils');
const TimeUtils = require('../utils/timeUtils');
const CandleUtils = require('../utils/candleUtils');
const logger = require('../logger');

class ActiveSetupService {
  static async processActiveSetup(ctx, setup) {
    logger.info(`Processing active setup #${setup.id}`);

    const exchangeService = await ctx.getExchangeService(setup.exchange_account_id, setup.exchange, setup.api_key_enc, setup.api_secret_enc, setup.is_testnet);

    const positions = await exchangeService.getPositions(setup.symbol);
    if (positions.length === 0 || positions.every(p => parseFloat(p.size) === 0)) {
      logger.info(`Position not found for setup #${setup.id}. Marking as closed.`);
      await this.closeSetup(ctx, setup, 'Position not found');
      return;
    }


    await this.updateOrderStatuses(ctx, setup, exchangeService);

    if (setup.exit_indicator_type && setup.exit_indicator_tf) {
      if (TimeUtils.isTriggerTime(setup.exit_indicator_tf)) {
        await this.checkExitCondition(ctx, setup, exchangeService);
      }
    }

    await this.checkBreakEven(ctx, setup, exchangeService);
  }

  static async checkExitCondition(ctx, setup, exchangeService) {
    try {
      const candles = await exchangeService.getCandles(setup.symbol, setup.exit_indicator_tf, 100);
      const parsedCandles = CandleUtils.parseExchangeCandles(candles);
      const closedBars = CandleUtils.filterClosedBars(parsedCandles, setup.exit_indicator_tf);

      if (closedBars.length === 0) return;

      const ticker = await exchangeService.getTicker(setup.symbol);
      const currentPrice = parseFloat(ticker.lastPrice);
      logger.info(`Checking exit condition for setup #${setup.id} at price ${currentPrice}`);
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
        const shouldExit = (setup.side === 'long' && exitResult.signal === 'bearish_crossover') ||
          (setup.side === 'short' && exitResult.signal === 'bullish_crossover');

        if (!shouldExit) {
          logger.info(`Exit signal mismatch for setup #${setup.id}: side=${setup.side}, signal=${exitResult.signal}`);
          return;
        }

        logger.info(`Exit condition met for setup #${setup.id}`);
        await this.closePosition(ctx, setup, exchangeService, 'exit_condition');
      }
    } catch (error) {
      logger.error(`Error checking exit condition for setup #${setup.id}:`, error);
    }
  }

  static async checkBreakEven(ctx, setup, exchangeService) {
    try {
      if (!setup.be_enabled) return;

      const orders = await ctx.db.getOrdersBySetupId(setup.id);
      const tp1Order = orders.find(o => o.order_type === 'tp1');
      if (!tp1Order || tp1Order.status !== 'filled') return;

      const slOrder = orders.find(o => o.order_type === 'sl');
      if (slOrder.price === setup.entry_price) return;
      await exchangeService.cancelOrder(slOrder.exchange_order_id, setup.symbol, { 'trigger': true });

      const newSlOrder = await exchangeService.placeOrder({
        symbol: setup.symbol,
        side: setup.side === 'long' ? 'Sell' : 'Buy',
        orderType: 'Market',
        qty: setup.entry_qty,
        triggerPrice: setup.entry_price,
        triggerDirection: setup.side === 'long' ? 2 : 1,
        triggerBy: 'MarkPrice',
        reduceOnly: true
      });

      await ctx.db.updateOrderStatus(slOrder.id, 'canceled');
      await ctx.db.createOrder({
        setup_id: setup.id,
        order_type: 'sl',
        side: setup.side === 'long' ? 'sell' : 'buy',
        price: setup.entry_price,
        qty: setup.entry_qty,
        exchange_order_id: newSlOrder.orderId,
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

  static async updateOrderStatuses(ctx, setup, exchangeService) {
    try {
      const orders = await ctx.db.getOrdersBySetupId(setup.id);

      for (const order of orders) {
        if (order.status === 'pending' && order.exchange_order_id) {
          console.log(`Checking status for order ${order.id} (Exchange ID: ${order.exchange_order_id})`);
          const params = order.order_type === 'sl' ? { 'category':'linear','stop': true, 'orderFilter': 'StopOrder' } : {};
          console.log(`Params for getOrderStatus:`, params);
          const status = await exchangeService.getOrderStatus(order.exchange_order_id, setup.symbol, params);
          if (!status) {
            logger.warn(`Order status not found for order ${order.id} (Exchange ID: ${order.exchange_order_id})`);
            continue;
          }
          console.log(order)
          if (status.status === 'closed' && status.amount == status.filled) {
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

              const allTpOrders = orders.filter(o => o.order_type.startsWith('tp'));
              const allTpFilled = allTpOrders.length > 0 && allTpOrders.every(o => o.status === 'filled');
              if (allTpFilled) {
                const slOrder = orders.find(o => o.order_type === 'sl');
                if (slOrder && slOrder.status === 'pending' && slOrder.exchange_order_id) {
                  try {
                    await exchangeService.cancelOrder(slOrder.exchange_order_id, setup.symbol, { 'trigger': true });
                    await ctx.db.updateOrderStatus(slOrder.id, 'canceled');
                  } catch (error) {
                    logger.error(`Error cancelling SL order after all TP filled for setup #${setup.id}:`, error);
                  }
                }
              }
            } else if (order.order_type === 'sl') {
              const pendingTpOrders = orders.filter(o => o.order_type.startsWith('tp') && o.status === 'pending' && o.exchange_order_id);
              for (const tpOrder of pendingTpOrders) {
                try {
                  await exchangeService.cancelOrder(tpOrder.exchange_order_id, setup.symbol);
                  await ctx.db.updateOrderStatus(tpOrder.id, 'canceled');
                } catch (error) {
                  logger.error(`Error cancelling TP order ${tpOrder.id} after SL hit for setup #${setup.id}:`, error);
                }
              }

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

              await this.closeSetup(ctx, setup, 'stop_loss_hit', pnl.netPnl);
              return;
            }
          } else if (status.status === 'canceled' || status.status === 'rejected') {
            await ctx.db.updateOrderStatus(order.id, 'canceled');
          }
        }
      }

      const updatedSetup = await ctx.db.getSetupById(setup.id);
      if (updatedSetup?.status === 'active') {
        await this.updateSetupProfit(ctx, updatedSetup, exchangeService);
      }
    } catch (error) {
      logger.error(`Error updating order statuses for setup #${setup.id}:`, error);
    }
  }

  static async updateSetupProfit(ctx, setup, exchangeService, currentPrice = null) {
    if (!setup.entry_price || !setup.entry_qty) {
      return;
    }

    try {
      const price = currentPrice !== null ? currentPrice : parseFloat((await exchangeService.getTicker(setup.symbol)).lastPrice);
      const pnl = PriceUtils.calculatePnl(setup.entry_price, price, setup.entry_qty, setup.side);
      await ctx.db.updateSetupStatus(setup.id, setup.status, { profit: pnl.netPnl });
    } catch (error) {
      logger.error(`Error updating profit for setup #${setup.id}:`, error);
    }
  }

  static async closePosition(ctx, setup, exchangeService, reason) {
    try {
      const orders = await ctx.db.getOrdersBySetupId(setup.id);
      
      // Calculate filled TP quantity
      const filledTpOrders = orders.filter(o => o.order_type.startsWith('tp') && o.status === 'filled');
      const filledQty = filledTpOrders.reduce((sum, o) => sum + (o.qty || 0), 0);
      const remainingQty = (setup.entry_qty || 0) - filledQty;
      
      // Place reduce-only market order for remaining quantity if any
      if (remainingQty > 0) {
        const closeOrder = {
          symbol: setup.symbol,
          side: setup.side === 'long' ? 'Sell' : 'Buy',
          orderType: 'Market',
          qty: remainingQty.toString(),
          reduceOnly: true,
          timeInForce: 'IOC'
        };
        await exchangeService.placeOrder(closeOrder);
        logger.info(`Placed reduce-only close order for setup #${setup.id}: ${remainingQty} qty remaining`);
      } else {
        logger.info(`No remaining qty to close for setup #${setup.id} (already fully closed by TP orders)`);
      }

      // Cancel pending orders (including SL)
      for (const order of orders) {
        if (order.status === 'pending' && order.exchange_order_id) {
          try {
            const params = order.order_type == 'sl' ? { 'trigger': true } : {}
            await exchangeService.cancelOrder(order.exchange_order_id, setup.symbol, params);
            await ctx.db.updateOrderStatus(order.id, 'canceled');
          } catch (error) {
            logger.error(`Error cancelling order ${order.id}:`, error);
          }
        }
      }

      // Calculate profit based on remaining qty (for partial close)
      const qtyForPnl = remainingQty > 0 ? remainingQty : 0;
      let pnl = null;
      let currentPrice = null;
      if (setup.entry_price && qtyForPnl > 0) {
        const ticker = await exchangeService.getTicker(setup.symbol);
        currentPrice = parseFloat(ticker.lastPrice);
        pnl = PriceUtils.calculatePnl(setup.entry_price, currentPrice, qtyForPnl, setup.side);
      }

      await this.closeSetup(ctx, setup, reason, pnl ? pnl.netPnl : 0);
      logger.info(`Position closed for setup #${setup.id}: ${reason}`);
    } catch (error) {
      logger.error(`Error closing position for setup #${setup.id}:`, error);
      throw error;
    }
  }

  static async closeSetup(ctx, setup, reason, profit = 0) {
    try {
      const closePayload = {
        closed_at: new Date().toISOString(),
        profit: profit
      };

      await ctx.db.updateSetupStatus(setup.id, 'closed', closePayload);

      if (reason === 'exit_condition' && setup.entry_price) {
        let currentPrice = null;
        let pnl = null;
        if (profit !== undefined) {
          const exchangeService = await ctx.getExchangeService(setup.exchange_account_id, setup.exchange, setup.api_key_enc, setup.api_secret_enc, setup.is_testnet);
          const ticker = await exchangeService.getTicker(setup.symbol);
          currentPrice = parseFloat(ticker.lastPrice);
          pnl = { netPnl: profit };
        }

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