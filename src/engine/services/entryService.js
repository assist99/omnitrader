const IndicatorService = require('./indicatorService');
const PriceUtils = require('../utils/priceUtils');
const CandleUtils = require('../utils/candleUtils');
const TimeUtils = require('../utils/timeUtils');
const logger = require('../logger');

class EntryService {
  static async processTriggeredSetup(ctx, setup) {
    logger.info(`Checking triggered setup #${setup.id} for entry conditions`);

    if (!TimeUtils.isTriggerTime(setup.entry_indicator_tf)) {
      logger.info(`Not trigger time for ${setup.entry_indicator_tf}. Skipping setup #${setup.id}`);
      return;
    }

    const bybitService = await ctx.getBybitService(setup.account_id, setup.api_key_enc, setup.api_secret_enc, setup.is_testnet);

    const candles = await bybitService.getCandles(setup.symbol, setup.entry_indicator_tf, 100);
    const parsedCandles = CandleUtils.parseBybitCandles(candles);
    const closedBars = CandleUtils.filterClosedBars(parsedCandles);

    if (closedBars.length === 0) {
      logger.warn(`No closed bars available for setup #${setup.id}`);
      return;
    }

    const indicatorResult = IndicatorService.checkCondition(
      setup.entry_indicator_type,
      closedBars,
      IndicatorService.getIndicatorParameters(setup.entry_indicator_type)
    );

    if (indicatorResult.met) {
      logger.info(`Entry condition met for setup #${setup.id}: ${indicatorResult.signal}`);
      await this.placeEntryOrder(ctx, setup, bybitService, closedBars);
    } else {
      logger.info(`Entry condition not met for setup #${setup.id}: ${indicatorResult.error || 'No signal'}`);
    }
  }

  static async placeEntryOrder(ctx, setup, bybitService, candles) {
    try {
      const lastCandle = candles[candles.length - 1];
      const entryPrice = lastCandle.close;

      const indicatorParams = IndicatorService.getIndicatorParameters(setup.entry_indicator_type);

      let slPrice = setup.sl_price > 0 ? setup.sl_price : null;
      if (!slPrice) {
        slPrice = PriceUtils.calculateSLPrice(
          entryPrice,
          setup.ignore_box_lower,
          setup.ignore_box_upper,
          setup.side,
          setup.entry_indicator_type,
          candles,
          indicatorParams
        );
      }
      console.log(`Calculated SL price for setup #${setup.id}: ${slPrice}`);
      const accountBalance = await bybitService.getAccountBalance();
      const riskType = setup.risk_type || 'percent';
      const positionSize = PriceUtils.calculatePositionSize(
        setup.risk_value,
        accountBalance,
        entryPrice,
        slPrice,
        setup.side,
        riskType
      );
      console.log('place order with params', {
        entryPrice,
        slPrice,
        positionSize,
        accountBalance,
        riskType
      });
      const entryOrder = await bybitService.placeOrder({
        symbol: setup.symbol,
        side: setup.side === 'long' ? 'Buy' : 'Sell',
        orderType: 'Market',
        qty: positionSize,
        timeInForce: 'GTC'
      });

      await ctx.db.createOrder({
        setup_id: setup.id,
        order_type: 'entry',
        side: setup.side === 'long' ? 'buy' : 'sell',
        price: entryPrice,
        qty: positionSize,
        bybit_order_id: entryOrder.orderId,
        status: 'pending'
      });

      const rrRatios = PriceUtils.parseTpPricesJson(setup.tp_prices);
      const tpPrices = PriceUtils.calculateTPPrices(entryPrice, slPrice, rrRatios);

      const slOrder = await bybitService.placeOrder({
        symbol: setup.symbol,
        side: setup.side === 'long' ? 'Sell' : 'Buy',
        orderType: 'Limit',
        qty: positionSize,
        price: slPrice,
        timeInForce: 'GTC'
      });

      await ctx.db.createOrder({
        setup_id: setup.id,
        order_type: 'sl',
        side: setup.side === 'long' ? 'sell' : 'buy',
        price: slPrice,
        qty: positionSize,
        bybit_order_id: slOrder.orderId,
        status: 'pending'
      });

      const tpQtys = [
        positionSize * 0.25,
        positionSize * 0.25,
        positionSize * 0.25,
        positionSize * 0.25
      ];

      for (let i = 0; i < Math.min(tpPrices.length, 4); i++) {
        const tpOrder = await bybitService.placeOrder({
          symbol: setup.symbol,
          side: setup.side === 'long' ? 'Sell' : 'Buy',
          orderType: 'Limit',
          qty: tpQtys[i],
          price: tpPrices[i],
          timeInForce: 'GTC'
        });

        await ctx.db.createOrder({
          setup_id: setup.id,
          order_type: `tp${i + 1}`,
          side: setup.side === 'long' ? 'sell' : 'buy',
          price: tpPrices[i],
          qty: tpQtys[i],
          bybit_order_id: tpOrder.orderId,
          status: 'pending'
        });
      }

      await ctx.db.updateSetupStatus(setup.id, 'active', {
        entry_price: entryPrice,
        entry_qty: positionSize,
        sl_price: slPrice
      });

      ctx.stats.setupsActivated++;
      ctx.stats.ordersPlaced += (2 + Math.min(tpPrices.length, 4));

      await ctx.telegramService.sendNotification(setup.user_id, 'order_placed', {
        setupId: setup.id,
        symbol: setup.symbol,
        orderType: 'entry',
        side: setup.side,
        price: entryPrice,
        quantity: positionSize,
        timestamp: new Date().toISOString()
      });

      logger.orderPlaced(setup.id, 'entry', setup.symbol, entryPrice, positionSize);
    } catch (error) {
      logger.error(`Error placing entry order for setup #${setup.id}:`, error);
      throw error;
    }
  }
}

module.exports = EntryService;