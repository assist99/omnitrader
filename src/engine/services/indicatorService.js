const CandleUtils = require('../utils/candleUtils');
const logger = require('../logger');
const SuperTrend = require('./indicators/superTrend');
const MacdEma = require('./indicators/macdEma');
const Candlestick = require('./indicators/candlestick');
const EWT = require('./indicators/ewt');
const Helpers = require('./indicators/helpers');

class IndicatorService {
  static checkCondition(indicatorType, candles, params = {}) {
    try {
      const validation = CandleUtils.validateCandles(candles, 20);
      if (!validation.valid) {
        logger.error(`Invalid candles for indicator check: ${validation.error}`);
        return { met: false, error: validation.error };
      }

      const normalizedType = this._normalizeType(indicatorType);

      switch (normalizedType) {
        case 'supertrend':
          return SuperTrend.checkSuperTrend(candles, params);
        case 'rollingsupertrend':
          return SuperTrend.checkRollingSuperTrend(candles, params);
        case 'ewt':
          return EWT.checkEWT(candles, params);
        case 'macd':
          return MacdEma.checkMACD(candles, params);
        case 'ema':
          return MacdEma.checkEMA(candles, params);
        case 'candlestick':
          return Candlestick.checkCandlestickPattern(candles, params.patternType);
        default:
          return { met: false, error: `Unsupported indicator type: ${indicatorType}` };
      }
    } catch (error) {
      logger.error(`Error checking ${indicatorType} condition:`, error);
      return { met: false, error: error.message };
    }
  }

  static getSwingPrice(indicatorType, candles, side, params = {}) {
    try {
      const validation = CandleUtils.validateCandles(candles, 50);
      if (!validation.valid) {
        logger.error(`Insufficient candles for swing detection: ${validation.error}`);
        return { price: null, error: validation.error };
      }

      const normalizedType = this._normalizeType(indicatorType);

      switch (normalizedType) {
        case 'supertrend':
          return SuperTrend.getSuperTrendSwingPrice(candles, side, params);
        case 'rollingsupertrend':
          return SuperTrend.getRollingSuperTrendSwingPrice(candles, side, params);
        case 'ewt':
          return EWT.getEWTSwingPrice(candles, side, params);
        case 'macd':
          return MacdEma.getMACDSwingPrice(candles, side, params);
        case 'ema':
          return MacdEma.getEMASwingPrice(candles, side, params);
        default:
          return { price: null, error: `Unsupported indicator type for swing detection: ${indicatorType}` };
      }
    } catch (error) {
      logger.error(`Error getting swing price for ${indicatorType}:`, error);
      return { price: null, error: error.message };
    }
  }

  static getIndicatorParameters(indicatorType) {
    const defaultParams = {
      'supertrend': { period: 10, multiplier: 3 },
      'rollingsupertrend': { period: 10, multiplier: 3, rollingPeriod: 4 },
      'macd': { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      'ema': { fastPeriod: 9, slowPeriod: 21 },
      'ema_cross': { fastPeriod: 9, slowPeriod: 21 },
      'ewt': {
        barsPerHour: 4,
        barsPerHour2: 16,
        macroAtrLen: 10,
        macroMult: 3.0,
        localAtrLen: 10,
        localMult: 3.0,
        zscoreLength: 500,
        zscoreMin: 1.8,
        zscoreMax: 10.0,
        useWickFilter: true,
        maxWickRatio: 0.3,
        maxLegsAllowed: 5,
        useExtFilter: true,
        extMultiplier: 1.27,
        tradeMode: 'First Change Only',
      },
    };

    return defaultParams[this._normalizeType(indicatorType)] || {};
  }

  static validateIndicatorConfig(indicatorType, timeframe) {
    const validIndicators = ['supertrend', 'rollingsupertrend', 'macd', 'ema', 'ewt'];
    const validTimeframes = ['m1', 'm5', 'm15', 'm30', 'h1', 'h2', 'h4', 'd1', 'w1'];

    if (!validIndicators.includes(this._normalizeType(indicatorType))) {
      return { valid: false, error: `Invalid indicator type: ${indicatorType}` };
    }

    if (!validTimeframes.includes(timeframe)) {
      return { valid: false, error: `Invalid timeframe: ${timeframe}` };
    }

    return { valid: true, error: null };
  }

  static _normalizeType(type) {
    return type.toLowerCase().replace('ewtrading', 'ewt');
  }

  static checkCandlestickPattern(candles, patternType) {
    return Candlestick.checkCandlestickPattern(candles, patternType);
  }

  // Backward compat re-exports for CLI scripts
  static checkSuperTrend(...args) {
    return SuperTrend.checkSuperTrend(...args);
  }

  static getSuperTrend(...args) {
    return Helpers.getSuperTrend(...args);
  }

  static calculateSuperTrend(...args) {
    return Helpers.calculateSuperTrend(...args);
  }
}

module.exports = IndicatorService;