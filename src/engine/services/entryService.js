const IndicatorService = require('./indicatorService');
const PriceUtils = require('../utils/priceUtils');
const CandleUtils = require('../utils/candleUtils');
const TimeUtils = require('../utils/timeUtils');
const PendingSetupService = require('./pendingSetupService');
const logger = require('../logger');

class EntryService {
  static async processTriggeredSetup(ctx, setup) {
    logger.info(`Checking triggered setup #${setup.id} for entry conditions`);

    if (!TimeUtils.isTriggerTime(setup.entry_indicator_tf)) {
      logger.info(`Not trigger time for ${setup.entry_indicator_tf}. Skipping setup #${setup.id}`);
      return;
    }

    const exchangeService = await ctx.getExchangeService(setup.exchange_account_id, setup.exchange, setup.api_key_enc, setup.api_secret_enc, setup.is_testnet);

    const candles = await exchangeService.getCandles(setup.symbol, setup.entry_indicator_tf, 100);
    const parsedCandles = CandleUtils.parseExchangeCandles(candles);
    const closedBars = CandleUtils.filterClosedBars(parsedCandles, setup.entry_indicator_tf);

    if (closedBars.length === 0) {
      logger.warn(`No closed bars available for setup #${setup.id}`);
      return;
    }

    const lastCandle = closedBars[closedBars.length - 1];
    const ignoreBoxCheck = TimeUtils.isWithinIgnoreBox(lastCandle, setup.ignore_box_lower, setup.ignore_box_upper);
    if (!ignoreBoxCheck.within) {
      logger.info(`Triggered setup #${setup.id} cancelled: ${ignoreBoxCheck.reason}`);
      await PendingSetupService.cancelSetup(ctx, setup, ignoreBoxCheck.reason);
      return;
    }

    const indicatorResult = IndicatorService.checkCondition(
      setup.entry_indicator_type,
      closedBars,
      IndicatorService.getIndicatorParameters(setup.entry_indicator_type)
    );

    if (indicatorResult.met) {
      const isValidDirection = (setup.side === 'long' && indicatorResult.signal === 'bullish_crossover') ||
                             (setup.side === 'short' && indicatorResult.signal === 'bearish_crossover');

      if (!isValidDirection) {
        logger.info(`Signal direction mismatch for setup #${setup.id}: expected ${setup.side} but got ${indicatorResult.signal}`);
        return;
      }

      logger.info(`Entry condition met for setup #${setup.id}: ${indicatorResult.signal}`);
      await this.placeEntryOrder(ctx, setup, exchangeService, closedBars);
    } else {
      logger.info(`Entry condition not met for setup #${setup.id}: ${indicatorResult.error || 'No signal'}`);
    }
  }

  static async placeEntryOrder(ctx, setup, exchangeService, candles) {
    try {
      const lastCandle = candles[candles.length - 1];
      const entryPrice = lastCandle.close;

      const indicatorParams = IndicatorService.getIndicatorParameters(setup.entry_indicator_type);

      let slPrice = setup.sl_price > 0 ? setup.sl_price : null;
      if (!slPrice) {
        slPrice = PriceUtils.calculateSLPrice(
          entryPrice,
          0,
          0,
          setup.side,
          setup.entry_indicator_type,
          candles,
          indicatorParams
        );
      }
      const symbolInfo = await exchangeService.getSymbolInfo(setup.symbol);
      const tickSize = parseFloat(symbolInfo.priceFilter?.tickSize) || 0.01;
      const qtyStepSize = parseFloat(symbolInfo.lotSizeFilter?.qtyStep) || 0.001;

      slPrice = PriceUtils.roundToTickSize(slPrice, tickSize);
      console.log(`Calculated and rounded SL price for setup #${setup.id}: ${slPrice}`);

      const accountBalance = await exchangeService.getAccountBalance();
      console.log(`Account balance for setup #${setup.id}: ${accountBalance}`);
      const riskType = setup.risk_type || 'percent';
      const positionSize = PriceUtils.calculatePositionSize(
        setup.risk_value,
        accountBalance,
        entryPrice,
        slPrice,
        setup.side,
        riskType
      );
      const roundedPositionSize = PriceUtils.roundQuantity(positionSize, qtyStepSize);
      if (roundedPositionSize <= 0) {
        throw new Error(`Calculated position size for setup #${setup.id} is too small after rounding`);
      }
      const rrRatios = PriceUtils.parseTpPricesJson(setup.tp_prices);
      const tpPrices = PriceUtils.calculateTPPrices(entryPrice, slPrice, rrRatios)
        .map(price => PriceUtils.roundToTickSize(price, tickSize));
      const tpQtys = PriceUtils.splitQuantity(
        roundedPositionSize,
        tpPrices.length,
        qtyStepSize
      );

        console.log('place order with params', {
        entryPrice,
        slPrice,
        positionSize,
        roundedPositionSize,
        accountBalance,
        riskType,
        tickSize,
        qtyStepSize
      });

      const entryOrder = await exchangeService.placeOrder({
        symbol: setup.symbol,
        side: setup.side === 'long' ? 'buy' : 'sell',
        orderType: 'Market',
        qty: roundedPositionSize,
        timeInForce: 'GTC'
      });

      await ctx.db.createOrder({
        setup_id: setup.id,
        order_type: 'entry',
        side: setup.side === 'long' ? 'buy' : 'sell',
        price: entryPrice,
        qty: roundedPositionSize,
        exchange_order_id: entryOrder.orderId,
        status: 'pending'
      });

      // Wait a moment for entry order to be confirmed on exchange before placing SL
      await new Promise(resolve => setTimeout(resolve, 500));

      const slOrder = await exchangeService.placeOrder({
        symbol: setup.symbol,
        side: setup.side === 'long' ? 'sell' : 'buy',
        orderType: 'Market',
        qty: roundedPositionSize,
        triggerPrice: slPrice,
        triggerDirection: setup.side === 'long' ? 'descending' : 'ascending', // 2 = price falls below (for Sell), 1 = price rises above (for Buy)
        triggerBy: 'MarkPrice',
        reduceOnly: true
      });

      await ctx.db.createOrder({
        setup_id: setup.id,
        order_type: 'sl',
        side: setup.side === 'long' ? 'sell' : 'buy',
        price: slPrice,
        qty: roundedPositionSize,
        exchange_order_id: slOrder.orderId,
        status: 'pending'
      });


      for (let i = 0; i < tpPrices.length; i++) {
        const tpOrder = await exchangeService.exchange.createOrder(
          setup.symbol,
          'limit',
          setup.side === 'long' ? 'sell' : 'buy',
          tpQtys[i],
          tpPrices[i],
          {
              reduceOnly: true,
              positionIdx: 0
          }
        );
        console.log(`Placed TP${i + 1} order for setup #${setup.id}`,JSON.stringify(tpOrder,null,2));
        await ctx.db.createOrder({
          setup_id: setup.id,
          order_type: `tp${i + 1}`,
          side: setup.side === 'long' ? 'sell' : 'buy',
          price: tpPrices[i],
          qty: tpQtys[i],
          exchange_order_id: tpOrder.id,
          status: 'pending'
        });
      }

      await ctx.db.updateSetupStatus(setup.id, 'active', {
        entry_price: entryPrice,
        entry_qty: roundedPositionSize,
        sl_price: slPrice
      });

      ctx.stats.setupsActivated++;
      ctx.stats.ordersPlaced += (2 + tpPrices.length);

      await ctx.telegramService.sendNotification(setup.user_id, 'order_placed', {
        setupId: setup.id,
        symbol: setup.symbol,
        orderType: 'entry',
        side: setup.side,
        price: entryPrice,
        quantity: roundedPositionSize,
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