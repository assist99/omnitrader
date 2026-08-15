const {
  MACD,
  EMA,
  SMA,
  Stochastic
} = require('technicalindicators');

const logger = require('../logger');
const CandleUtils = require('../utils/candleUtils');

class IndicatorService {
  static checkCondition(indicatorType, candles, params = {}) {
    try {
      // Validate candles first
      const validation = CandleUtils.validateCandles(candles, 20);
      if (!validation.valid) {
        logger.error(`Invalid candles for indicator check: ${validation.error}`);
        return { met: false, error: validation.error };
      }

      const normalizedType = indicatorType.toLowerCase().replace('ewtrading', 'ewt');

      switch (normalizedType) {
        case 'supertrend':
          return this.checkSuperTrend(candles, params);
        case 'rollingsupertrend':
          return this.checkRollingSuperTrend(candles, params);
        case 'ewt':
          return this.checkEWT(candles, params);
        case 'macd':
          return this.checkMACD(candles, params);
        case 'ema':
          return this.checkEMA(candles, params);
        case 'supply_demand':
          return this.checkSupplyDemand(candles, params);
        default:
          return { met: false, error: `Unsupported indicator type: ${indicatorType}` };
      }
    } catch (error) {
      logger.error(`Error checking ${indicatorType} condition:`, error);
      return { met: false, error: error.message };
    }
  }

  static buildSyntheticCandles(candles, rollingPeriod) {
    const result = [];
    for (let i = rollingPeriod - 1; i < candles.length; i++) {
      const group = candles.slice(i - rollingPeriod + 1, i + 1);
      result.push({
        open: group[0].open,
        high: Math.max(...group.map(c => c.high)),
        low: Math.min(...group.map(c => c.low)),
        close: candles[i].close,
      });
    }
    return result;
  }

  static checkRollingSuperTrend(candles, params = {}) {
    try {
      const rollingPeriod = params.rollingPeriod || 4;

      if (candles.length < rollingPeriod + 1) {
        return { met: false, error: 'Insufficient data for Rolling SuperTrend calculation' };
      }

      const syntheticCandles = this.buildSyntheticCandles(candles, rollingPeriod);
      return this.checkSuperTrend(syntheticCandles, params);
    } catch (error) {
      logger.error('Error checking Rolling SuperTrend:', error);
      return { met: false, error: error.message };
    }
  }

  static detectSuperTrendCrossover(superTrend, closes, label) {
    const lastST = superTrend[superTrend.length - 1];
    const prevST = superTrend[superTrend.length - 2];
    const lastClose = closes[closes.length - 1];
    const prevClose = closes[closes.length - 2];

    const wasBullish = prevClose > prevST;
    const isBullish = lastClose > lastST;

    let signal = 'none';
    let met = false;

    if (!wasBullish && isBullish) {
      signal = 'bullish_crossover';
      met = true;
      logger.info(`${label} bullish crossover detected at $${lastClose}`);
    } else if (wasBullish && !isBullish) {
      signal = 'bearish_crossover';
      met = true;
      logger.info(`${label} bearish crossover detected at $${lastClose}`);
    }

    return { met, signal, value: lastST, price: lastClose, wasBullish, isBullish };
  }

  static checkSuperTrend(candles, params = {}) {
    try {
      const period = params.period || 10;
      const multiplier = params.multiplier || 3;
      
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const closes = candles.map(c => c.close);
      
      const superTrend = this.calculateSuperTrend(highs, lows, closes, period, multiplier);
      if (superTrend.length < 2) {
        return { met: false, error: 'Insufficient data for SuperTrend calculation' };
      }

      const result = this.detectSuperTrendCrossover(superTrend, closes, 'SuperTrend');
      logger.info(`SuperTrend check: lastST=${result.value}, lastClose=${result.price}, wasBullish=${result.wasBullish}, isBullish=${result.isBullish}, signal=${result.signal}`);

       return {
        ...result,
        details: {
          period: period,
          multiplier: multiplier,
          trend: result.isBullish ? 'bullish' : 'bearish'
        }
      };
    } catch (error) {
      logger.error('Error checking SuperTrend:', error);
      return { met: false, error: error.message };
    }
  }

  static checkMACD(candles, params = {}) {
    try {
      const fastPeriod = params.fastPeriod || 12;
      const slowPeriod = params.slowPeriod || 26;
      const signalPeriod = params.signalPeriod || 9;
      
      const closes = candles.map(c => c.close);
      
      const input = {
        values: closes,
        fastPeriod: fastPeriod,
        slowPeriod: slowPeriod,
        signalPeriod: signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      };
      
      const macd = MACD.calculate(input);
      
      if (macd.length < 2) {
        return { met: false, error: 'Insufficient data for MACD calculation' };
      }
      
      // Get last two MACD values
      const lastMACD = macd[macd.length - 1];
      const prevMACD = macd[macd.length - 2];
      
      // Check for MACD line crossing signal line
      const wasAbove = prevMACD.MACD > prevMACD.signal;
      const isAbove = lastMACD.MACD > lastMACD.signal;
      
      // Check for histogram turning positive/negative
      const wasHistPositive = prevMACD.histogram > 0;
      const isHistPositive = lastMACD.histogram > 0;
      
      let signal = 'none';
      let met = false;
      if (!wasHistPositive && isHistPositive) {
        signal = 'bullish_crossover';
        met = true;
        logger.info(`MACD bullish crossover detected`);
      } else if (wasHistPositive && !isHistPositive) {
        signal = 'bearish_crossover';
        met = true;
        logger.info(`MACD bearish crossover detected`);
      }
      
      return {
        met: met,
        signal: signal,
        macd: lastMACD.MACD,
        signalLine: lastMACD.signal,
        histogram: lastMACD.histogram,
        price: closes[closes.length - 1],
        details: {
          fastPeriod: fastPeriod,
          slowPeriod: slowPeriod,
          signalPeriod: signalPeriod,
          macdAboveSignal: isAbove,
          histogramPositive: isHistPositive,
          pastHistogramPositive: wasHistPositive
        }
      };
    } catch (error) {
      logger.error('Error checking MACD:', error);
      return { met: false, error: error.message };
    }
  }

  static checkEMA(candles, params = {}) {
    try {
      const fastPeriod = params.fastPeriod || 9;
      const slowPeriod = params.slowPeriod || 21;
      
      const closes = candles.map(c => c.close);
      
      // Calculate EMAs
      const fastEMA = EMA.calculate({ period: fastPeriod, values: closes });
      const slowEMA = EMA.calculate({ period: slowPeriod, values: closes });
      
      if (fastEMA.length < 2 || slowEMA.length < 2) {
        return { met: false, error: 'Insufficient data for EMA calculation' };
      }
      
      // Get last two values for each EMA
      const lastFastEMA = fastEMA[fastEMA.length - 1];
      const prevFastEMA = fastEMA[fastEMA.length - 2];
      const lastSlowEMA = slowEMA[slowEMA.length - 1];
      const prevSlowEMA = slowEMA[slowEMA.length - 2];
      
      // Check for EMA crossover
      const wasAbove = prevFastEMA > prevSlowEMA;
      const isAbove = lastFastEMA > lastSlowEMA;
      
      let signal = 'none';
      let met = false;
      
      if (!wasAbove && isAbove) {
        signal = 'bullish_crossover';
        met = true;
        logger.info(`EMA bullish crossover (${fastPeriod}/${slowPeriod}) detected`);
      } else if (wasAbove && !isAbove) {
        signal = 'bearish_crossover';
        met = true;
        logger.info(`EMA bearish crossover (${fastPeriod}/${slowPeriod}) detected`);
      }
      
      return {
        met: met,
        signal: signal,
        fastEMA: lastFastEMA,
        slowEMA: lastSlowEMA,
        price: closes[closes.length - 1],
        details: {
          fastPeriod: fastPeriod,
          slowPeriod: slowPeriod,
          fastAboveSlow: isAbove,
          spread: Math.abs(lastFastEMA - lastSlowEMA)
        }
      };
    } catch (error) {
      logger.error('Error checking EMA:', error);
      return { met: false, error: error.message };
    }
  }

  // Supply/Demand zone detection based on PineScript algorithm
  static checkSupplyDemand(candles, params = {}) {
    try {
      // Default parameters from PineScript
      const bodyTolerance = params.bodyTolerance || 0.5;
      const minWickOverlapRate = params.minWickOverlapRate || 0.1;
      const checkCandle0Dir = params.checkCandle0Dir !== undefined ? params.checkCandle0Dir : true;
      const checkBreakCandle2 = true; // Always true as per PineScript

      // Need at least 3 candles for detection (candle 0, 1, 2)
      if (candles.length < 3) {
        return { met: false, error: 'Need at least 3 candles for supply/demand detection' };
      }

      // Get last 3 candles
      const c0 = candles[candles.length - 1];
      const c1 = candles[candles.length - 2];
      const c2 = candles[candles.length - 3];

      // Extract values for easier reference
      const o0 = c0.open, c0c = c0.close, h0 = c0.high, l0 = c0.low;
      const o1 = c1.open, c1c = c1.close, h1 = c1.high, l1 = c1.low;
      const o2 = c2.open, c2c = c2.close, h2 = c2.high, l2 = c2.low;

      // Determine trend based on candle 1
      const isSupTrend = c1c < o1; // Supply trend = bearish candle
      const isDemTrend = c1c > o1; // Demand trend = bullish candle

      // Check direction of candle 0 condition (if enabled)
      const c0SupplyValid = !checkCandle0Dir || (c0c < Math.min(l1, l2));
      const c0DemandValid = !checkCandle0Dir || (c0c > Math.max(h1, h2));

      // Calculate body extremes for candles 1 and 2
      const maxBody1 = Math.max(o1, c1c);
      const minBody1 = Math.min(o1, c1c);
      const maxBody2 = Math.max(o2, c2c);
      const minBody2 = Math.min(o2, c2c);
      const sizeBody2 = maxBody2 - minBody2;

      // Supply zone detection logic
      let supplyWicksOverlap = false;
      let supTopWick = Math.max(h2, h1);
      let supBotWick = Math.max(maxBody2, maxBody1);
      let supZoneHeight = supTopWick - supBotWick;

      if (isSupTrend && supZoneHeight > 0) {
        const rule1 = (h2 >= supBotWick) && (h1 >= supBotWick);
        const rule2 = (h2 - supBotWick) >= (supZoneHeight * minWickOverlapRate);
        const rule3 = (h1 - supBotWick) >= (supZoneHeight * minWickOverlapRate);
        if (rule1 && rule2 && rule3) {
          supplyWicksOverlap = true;
        }
      } else if (isSupTrend && minWickOverlapRate === 0.0) {
        supplyWicksOverlap = true;
      }

      // Demand zone detection logic
      let demandWicksOverlap = false;
      let demTopWick = Math.min(minBody2, minBody1);
      let demBotWick = Math.min(l2, l1);
      let demZoneHeight = demTopWick - demBotWick;

      if (isDemTrend && demZoneHeight > 0) {
        const rule1 = (l2 <= demTopWick) && (l1 <= demTopWick);
        const rule2 = (demTopWick - l2) >= (demZoneHeight * minWickOverlapRate);
        const rule3 = (demTopWick - l1) >= (demZoneHeight * minWickOverlapRate);
        if (rule1 && rule2 && rule3) {
          demandWicksOverlap = true;
        }
      } else if (isDemTrend && minWickOverlapRate === 0.0) {
        demandWicksOverlap = true;
      }

      // Final confirmation conditions
      const isSupplyConfirmed = supplyWicksOverlap && isSupTrend && 
                               (!checkBreakCandle2 || (c1c < (maxBody2 - (sizeBody2 * bodyTolerance)))) && 
                               c0SupplyValid;

      const isDemandConfirmed = demandWicksOverlap && isDemTrend && 
                               (!checkBreakCandle2 || (c1c > (minBody2 + (sizeBody2 * bodyTolerance)))) && 
                               c0DemandValid;

      let signal = 'none';
      let met = false;
      let zonePrice = null;
      let zoneTop = null;
      let zoneBottom = null;
      let zoneTf = null;

      if (isSupplyConfirmed) {
        signal = 'supply';
        met = true;
        zoneTop = supTopWick;
        zoneBottom = supBotWick;
        zonePrice = (supTopWick + supBotWick) / 2;
        logger.info(`Supply zone detected: ${zoneBottom} - ${zoneTop} (mid: ${zonePrice})`);
      } else if (isDemandConfirmed) {
        signal = 'demand';
        met = true;
        zoneTop = demTopWick;
        zoneBottom = demBotWick;
        zonePrice = (demTopWick + demBotWick) / 2;
        logger.info(`Demand zone detected: ${zoneBottom} - ${zoneTop} (mid: ${zonePrice})`);
      }

      return {
        met: met,
        signal: signal,
        price: c0c,
        zonePrice: zonePrice,
        zoneTop: zoneTop,
        zoneBottom: zoneBottom,
        zoneTf: 'current', // Single timeframe detection
        details: {
          isSupplyConfirmed: isSupplyConfirmed,
          isDemandConfirmed: isDemandConfirmed,
          bodyTolerance: bodyTolerance,
          minWickOverlapRate: minWickOverlapRate,
          wickOverlaps: { supply: supplyWicksOverlap, demand: demandWicksOverlap }
        }
      };
    } catch (error) {
      logger.error('Error checking supply/demand:', error);
      return { met: false, error: error.message };
    }
  }

  static calculateATR(highs, lows, closes, period) {
    if (closes.length < period) {
      return [];
    }

    const trueRanges = new Array(closes.length).fill(0);
    
    // Calculate True Range for each bar
    for (let i = 0; i < closes.length; i++) {
      if (i === 0) {
        trueRanges[i] = highs[i] - lows[i];
      } else {
        trueRanges[i] = Math.max(
          highs[i] - lows[i],
          Math.abs(highs[i] - closes[i - 1]),
          Math.abs(lows[i] - closes[i - 1])
        );
      }
    }
    
    // Calculate RMA (Recursive Moving Average) as in Pine Script
    return this.calculateRMA(trueRanges, period);
  }

  static calculateRMA(values, period) {
    const alpha = 1 / period;
    const rma = new Array(values.length).fill(null);
    
    for (let i = 0; i < values.length; i++) {
      if (i < period - 1) {
        // Not enough data for RMA yet
        rma[i] = null;
      } else if (i === period - 1) {
        // First RMA value is SMA of first 'period' values
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += values[i - period + 1 + j];
        }
        rma[i] = sum / period;
      } else {
        // Subsequent RMA values use the recursive formula
        rma[i] = alpha * values[i] + (1 - alpha) * rma[i - 1];
      }
    }
    
    return rma;
  }

  

  static calculateSuperTrend(highs, lows, closes, period, multiplier) {
    const atr = this.calculateATR(highs, lows, closes, period);
    if (atr.length === 0) {
      return [];
    }

    const length = closes.length;
    const superTrend = new Array(length).fill(null);
    const direction = new Array(length).fill(0);

    // Track previous values
    let prevUpperBand = null;
    let prevLowerBand = null;
    let prevSuperTrend = null;

    for (let i = 0; i < length; i++) {
      // Skip if no ATR value yet (RMA needs period-1 bars to start)
      if (atr[i] === null) {
        superTrend[i] = null;
        direction[i] = 0;
        continue;
      }

      // Use hl2 (high + low) / 2 as source, matching Pine Script
      const src = (highs[i] + lows[i]) / 2;
      
      // Basic Bands
      const upperBand = src + multiplier * atr[i];
      const lowerBand = src - multiplier * atr[i];

      // Final Upper Band logic (matching Pine Script exactly)
      let finalUpperBand = upperBand;
      if (prevUpperBand !== null && (upperBand < prevUpperBand || closes[i - 1] > prevUpperBand)) {
        finalUpperBand = upperBand;
      } else if (prevUpperBand !== null) {
        finalUpperBand = prevUpperBand;
      }

      // Final Lower Band logic (matching Pine Script exactly)
      let finalLowerBand = lowerBand;
      if (prevLowerBand !== null && (lowerBand > prevLowerBand || closes[i - 1] < prevLowerBand)) {
        finalLowerBand = lowerBand;
      } else if (prevLowerBand !== null) {
        finalLowerBand = prevLowerBand;
      }

      // Determine Direction and Supertrend value (matching Pine Script logic)
      let _direction = 0;
      let superTrendValue = null;

      if (i === 0 || atr[i - 1] === null) {
        // First valid ATR bar
        _direction = 1; // Default to downtrend
      } else if (prevSuperTrend === prevUpperBand) {
        // Previous was upper band (downtrend)
        _direction = closes[i] > finalUpperBand ? -1 : 1;
      } else {
        // Previous was lower band (uptrend)
        _direction = closes[i] < finalLowerBand ? 1 : -1;
      }

      superTrendValue = _direction === -1 ? finalLowerBand : finalUpperBand;
      
      direction[i] = _direction;
      superTrend[i] = superTrendValue;

      // Save current values as previous for next iteration
      prevUpperBand = finalUpperBand;
      prevLowerBand = finalLowerBand;
      prevSuperTrend = superTrendValue;
    }

    // Return only non-null values for backward compatibility
    return superTrend.filter(val => val !== null);
  }

    

  static getSuperTrend(highs, lows, closes, period, multiplier) {
    const superTrend = this.calculateSuperTrend(highs, lows, closes, period, multiplier);
    const startIndex = period - 1;
    const alignedSuperTrend = superTrend.map((st, i) => ({
      index: startIndex + i,
      value: st
    }));
    return alignedSuperTrend;
  }

  static checkCandlestickPattern(candles, patternType) {
    try {
      if (candles.length < 2) {
        return { met: false, error: 'Need at least 2 candles for pattern detection' };
      }
      
      const lastCandle = candles[candles.length - 1];
      const prevCandle = candles[candles.length - 2];
      
      let pattern = null;
      let met = false;
      
      switch (patternType.toLowerCase()) {
        case 'engulfing':
          pattern = CandleUtils.isEngulfingPattern(prevCandle, lastCandle);
          if (pattern) {
            const direction = CandleUtils.isBullishCandle(lastCandle) ? 'bullish' : 'bearish';
            met = true;
            logger.info(`${direction} engulfing pattern detected`);
          }
          break;
          
        case 'pinbar':
          pattern = CandleUtils.isPinbarCandle(lastCandle);
          if (pattern) {
            met = true;
            logger.info(`${pattern.direction} ${pattern.type} detected`);
          }
          break;
          
        case 'doji':
          pattern = CandleUtils.isDojiCandle(lastCandle);
          if (pattern) {
            met = true;
            logger.info('Doji pattern detected');
          }
          break;
          
        default:
          return { met: false, error: `Unsupported candlestick pattern: ${patternType}` };
      }
      
      return {
        met: met,
        pattern: patternType,
        details: pattern
      };
    } catch (error) {
      logger.error(`Error checking ${patternType} pattern:`, error);
      return { met: false, error: error.message };
    }
  }

  static getIndicatorParameters(indicatorType) {
    const defaultParams = {
      'supertrend': { period: 10, multiplier: 3 },
      'rollingsupertrend': { period: 10, multiplier: 3, rollingPeriod: 4 },
      'macd': { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      'ema': { fastPeriod: 9, slowPeriod: 21 },
      'ema_cross': { fastPeriod: 9, slowPeriod: 21 },
      'supply_demand': { bodyTolerance: 0.5, minWickOverlapRate: 0.1, checkCandle0Dir: true },
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
        extMultiplier: 1.27
      }
    };
    
    return defaultParams[this._normalizeType(indicatorType)] || {};
  }

  static _normalizeType(type) {
    return type.toLowerCase().replace('ewtrading', 'ewt');
  }

  static validateIndicatorConfig(indicatorType, timeframe) {
    const validIndicators = ['supertrend', 'rollingsupertrend', 'macd', 'ema', 'supply_demand', 'ewt'];
    const validTimeframes = ['m1', 'm5', 'm15', 'm30', 'h1', 'h2', 'h4', 'd1'];
    
    if (!validIndicators.includes(this._normalizeType(indicatorType))) {
      return { valid: false, error: `Invalid indicator type: ${indicatorType}` };
    }
    
    if (!validTimeframes.includes(timeframe)) {
      return { valid: false, error: `Invalid timeframe: ${timeframe}` };
    }
    
    return { valid: true, error: null };
  }

  static getSwingPrice(indicatorType, candles, side, params = {}) {
    try {
      const validation = CandleUtils.validateCandles(candles, 50);
      if (!validation.valid) {
        logger.error(`Insufficient candles for swing detection: ${validation.error}`);
        return { price: null, error: validation.error };
      }

      switch (this._normalizeType(indicatorType)) {
        case 'macd':
          return this.getMACDSwingPrice(candles, side, params);
        case 'supertrend':
          return this.getSuperTrendSwingPrice(candles, side, params);
        case 'rollingsupertrend':
          return this.getRollingSuperTrendSwingPrice(candles, side, params);
        case 'ema':
          return this.getEMASwingPrice(candles, side, params);
        case 'ewt':
          return this.getEWTSwingPrice(candles, side, params);
        default:
          return { price: null, error: `Unsupported indicator type for swing detection: ${indicatorType}` };
      }
    } catch (error) {
      logger.error(`Error getting swing price for ${indicatorType}:`, error);
      return { price: null, error: error.message };
    }
  }

  static getRollingSuperTrendSwingPrice(candles, side, params = {}) {
    try {
      const rollingPeriod = params.rollingPeriod || 4;
      const syntheticCandles = this.buildSyntheticCandles(candles, rollingPeriod);
      return this.getSuperTrendSwingPrice(syntheticCandles, side, params);
    } catch (error) {
      logger.error('Error getting rolling SuperTrend swing price:', error);
      return { price: null, error: error.message };
    }
  }

  static getMACDSwingPrice(candles, side, params = {}) {
    try {
      const fastPeriod = params.fastPeriod || 12;
      const slowPeriod = params.slowPeriod || 26;
      const signalPeriod = params.signalPeriod || 9;
      
      const closes = candles.map(c => c.close);
      const lows = candles.map(c => c.low);
      const highs = candles.map(c => c.high);
      
      const input = {
        values: closes,
        fastPeriod: fastPeriod,
        slowPeriod: slowPeriod,
        signalPeriod: signalPeriod,
        SimpleMAOscillator: false,
        SimpleMASignal: false
      };
      
      const macd = MACD.calculate(input);
      
      if (macd.length < 2) {
        return { price: null, error: 'Insufficient MACD data for swing detection' };
      }
      
      // MACD output is shorter than candles — the first MACD value corresponds to candle
      // at index (candles.length - macd.length), i.e. the offset needed to align them.
      const candleOffset = candles.length - macd.length;
      
      // Build sections based on histogram sign, tracking candle indices
      const sections = [];
      let currentSection = null;
      
      for (let mi = 0; mi < macd.length; mi++) {
        const hist = macd[mi].histogram;
        const candleIdx = candleOffset + mi;
        const type = hist >= 0 ? 'positive' : 'negative';
        
        if (currentSection === null) {
          currentSection = { type, startCandle: candleIdx, endCandle: candleIdx };
        } else if (type !== currentSection.type) {
          // Section changed — close previous and start new
          currentSection.duration = currentSection.endCandle - currentSection.startCandle + 1;
          sections.push({ ...currentSection });
          currentSection = { type, startCandle: candleIdx, endCandle: candleIdx };
        } else {
          currentSection.endCandle = candleIdx;
        }
      }
      
      // Close the final section
      if (currentSection !== null) {
        currentSection.duration = currentSection.endCandle - currentSection.startCandle + 1;
        sections.push({ ...currentSection });
      }
      
      if (sections.length < 2) {
        return { price: null, error: 'Not enough MACD sections for swing detection' };
      }
      
      const lastSection = sections[sections.length - 1];
      const prevSection = sections[sections.length - 2];
      
      let swingPrice = null;
      let targetSection = null;
      
      if (side === 'long') {
        // For long: find the most recent negative (bearish histogram) section
        // and return its lowest low as the swing low support level
        targetSection = lastSection.type === 'negative'
          ? lastSection
          : prevSection.type === 'negative' ? prevSection : null;
        
        if (targetSection) {
          const sectionLows = lows.slice(targetSection.startCandle, targetSection.endCandle + 1);
          swingPrice = Math.min(...sectionLows);
        }
      } else if (side === 'short') {
        // For short: find the most recent positive (bullish histogram) section
        // and return its highest high as the swing high resistance level
        targetSection = lastSection.type === 'positive'
          ? lastSection
          : prevSection.type === 'positive' ? prevSection : null;
        
        if (targetSection) {
          const sectionHighs = highs.slice(targetSection.startCandle, targetSection.endCandle + 1);
          swingPrice = Math.max(...sectionHighs);
        }
      }
      
      if (swingPrice === null || swingPrice <= 0) {
        return { price: null, error: 'Could not determine swing price from MACD sections' };
      }
      
      logger.info(`MACD swing price for ${side}: $${swingPrice}, sections: ${sections.length}, last type: ${lastSection.type}, target section: [${targetSection.startCandle}-${targetSection.endCandle}]`);
      
      return {
        price: swingPrice,
        sections: sections.length,
        sectionType: lastSection.type,
        details: {
          lastSection: lastSection,
          prevSection: prevSection,
          targetSection: targetSection,
          candleOffset: candleOffset
        }
      };
    } catch (error) {
      logger.error('Error getting MACD swing price:', error);
      return { price: null, error: error.message };
    }
  }

  static getSuperTrendSwingPrice(candles, side, params = {}) {
    try {
      const period = params.period || 10;
      const multiplier = params.multiplier || 4;
      
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const closes = candles.map(c => c.close);
      
      const atr = this.calculateATR(highs, lows, closes, period);
      if (atr.length === 0) {
        return { price: null, error: 'Insufficient data for SuperTrend swing detection' };
      }

      const length = closes.length;
      const direction = new Array(length).fill(0);

      let prevUpperBand = null;
      let prevLowerBand = null;
      let prevSuperTrend = null;

      for (let i = 0; i < length; i++) {
        if (atr[i] === null) {
          direction[i] = 0;
          continue;
        }

        const src = (highs[i] + lows[i]) / 2;
        const upperBand = src + multiplier * atr[i];
        const lowerBand = src - multiplier * atr[i];

        let finalUpperBand = upperBand;
        if (prevUpperBand !== null && (upperBand < prevUpperBand || closes[i - 1] > prevUpperBand)) {
          finalUpperBand = upperBand;
        } else if (prevUpperBand !== null) {
          finalUpperBand = prevUpperBand;
        }

        let finalLowerBand = lowerBand;
        if (prevLowerBand !== null && (lowerBand > prevLowerBand || closes[i - 1] < prevLowerBand)) {
          finalLowerBand = lowerBand;
        } else if (prevLowerBand !== null) {
          finalLowerBand = prevLowerBand;
        }

        let _direction = 0;
        if (i === 0 || atr[i - 1] === null) {
          _direction = 1;
        } else if (prevSuperTrend === prevUpperBand) {
          _direction = closes[i] > finalUpperBand ? -1 : 1;
        } else {
          _direction = closes[i] < finalLowerBand ? 1 : -1;
        }

        const superTrendValue = _direction === -1 ? finalLowerBand : finalUpperBand;
        direction[i] = _direction;
        
        prevUpperBand = finalUpperBand;
        prevLowerBand = finalLowerBand;
        prevSuperTrend = superTrendValue;
      }

      const sections = [];
      let currentSection = null;

      for (let i = 0; i < length; i++) {
        if (direction[i] === 0) continue;
        
        const type = direction[i] === -1 ? 'bullish' : 'bearish';
        
        if (currentSection === null) {
          currentSection = { type, startCandle: i, endCandle: i };
        } else if (type !== currentSection.type) {
          currentSection.duration = currentSection.endCandle - currentSection.startCandle + 1;
          sections.push({ ...currentSection });
          currentSection = { type, startCandle: i, endCandle: i };
        } else {
          currentSection.endCandle = i;
        }
      }

      if (currentSection !== null) {
        currentSection.duration = currentSection.endCandle - currentSection.startCandle + 1;
        sections.push({ ...currentSection });
      }

      if (sections.length < 2) {
        return { price: null, error: 'Not enough SuperTrend sections for swing detection' };
      }

      const lastSection = sections[sections.length - 1];
      const prevSection = sections[sections.length - 2];

      let swingPrice = null;
      let targetSection = null;

      if (side === 'long') {
        targetSection = lastSection.type === 'bearish'
          ? lastSection
          : prevSection.type === 'bearish' ? prevSection : null;
        
        if (targetSection) {
          const sectionLows = lows.slice(targetSection.startCandle, targetSection.endCandle + 1);
          swingPrice = Math.min(...sectionLows);
        }
      } else if (side === 'short') {
        targetSection = lastSection.type === 'bullish'
          ? lastSection
          : prevSection.type === 'bullish' ? prevSection : null;
        
        if (targetSection) {
          const sectionHighs = highs.slice(targetSection.startCandle, targetSection.endCandle + 1);
          swingPrice = Math.max(...sectionHighs);
        }
      }

      if (swingPrice === null || swingPrice <= 0) {
        return { price: null, error: 'Could not determine swing price from SuperTrend sections' };
      }

      logger.info(`SuperTrend swing price for ${side}: $${swingPrice}, sections: ${sections.length}, last type: ${lastSection.type}, target section: [${targetSection.startCandle}-${targetSection.endCandle}]`);

      return {
        price: swingPrice,
        sections: sections.length,
        sectionType: lastSection.type,
        details: {
          lastSection: lastSection,
          prevSection: prevSection,
          targetSection: targetSection
        }
      };
    } catch (error) {
      logger.error('Error getting SuperTrend swing price:', error);
      return { price: null, error: error.message };
    }
  }

  static getEMASwingPrice(candles, side, params = {}) {
    try {
      const fastPeriod = params.fastPeriod || 9;
      const slowPeriod = params.slowPeriod || 21;
      
      const closes = candles.map(c => c.close);
      const lows = candles.map(c => c.low);
      const highs = candles.map(c => c.high);
      
      const fastEMA = EMA.calculate({ period: fastPeriod, values: closes });
      const slowEMA = EMA.calculate({ period: slowPeriod, values: closes });
      
      if (fastEMA.length < 2 || slowEMA.length < 2) {
        return { price: null, error: 'Insufficient EMA data for swing detection' };
      }
      
      // slowEMA is shorter — it defines the overlap window.
      // slowEMA[0] corresponds to candles[candles.length - slowEMA.length].
      // fastEMA[0] corresponds to candles[candles.length - fastEMA.length].
      // We iterate over the slow EMA range (more restrictive) and align both arrays
      // to their shared candle indices.
      const slowOffset = candles.length - slowEMA.length; // candle index of slowEMA[0]
      const fastOffset = candles.length - fastEMA.length; // candle index of fastEMA[0]
      
      const sections = [];
      let currentSection = null;
      
      for (let si = 0; si < slowEMA.length; si++) {
        const candleIdx = slowOffset + si;
        // Align fastEMA: fastEMA index = candleIdx - fastOffset
        const fi = candleIdx - fastOffset;
        if (fi < 0) continue; // fastEMA not yet available at this candle
        
        const type = fastEMA[fi] >= slowEMA[si] ? 'bullish' : 'bearish';
        
        if (currentSection === null) {
          currentSection = { type, startCandle: candleIdx, endCandle: candleIdx };
        } else if (type !== currentSection.type) {
          // Section changed — close previous and start new
          currentSection.duration = currentSection.endCandle - currentSection.startCandle + 1;
          sections.push({ ...currentSection });
          currentSection = { type, startCandle: candleIdx, endCandle: candleIdx };
        } else {
          currentSection.endCandle = candleIdx;
        }
      }
      
      // Close the final section
      if (currentSection !== null) {
        currentSection.duration = currentSection.endCandle - currentSection.startCandle + 1;
        sections.push({ ...currentSection });
      }
      
      if (sections.length < 2) {
        return { price: null, error: 'Not enough EMA sections for swing detection' };
      }
      
      const lastSection = sections[sections.length - 1];
      const prevSection = sections[sections.length - 2];
      
      let swingPrice = null;
      let targetSection = null;
      
      if (side === 'long') {
        // For long: find the most recent bearish section and return its lowest low
        targetSection = lastSection.type === 'bearish'
          ? lastSection
          : prevSection.type === 'bearish' ? prevSection : null;
        
        if (targetSection) {
          const sectionLows = lows.slice(targetSection.startCandle, targetSection.endCandle + 1);
          swingPrice = Math.min(...sectionLows);
        }
      } else if (side === 'short') {
        // For short: find the most recent bullish section and return its highest high
        targetSection = lastSection.type === 'bullish'
          ? lastSection
          : prevSection.type === 'bullish' ? prevSection : null;
        
        if (targetSection) {
          const sectionHighs = highs.slice(targetSection.startCandle, targetSection.endCandle + 1);
          swingPrice = Math.max(...sectionHighs);
        }
      }
      
      if (swingPrice === null || swingPrice <= 0) {
        return { price: null, error: 'Could not determine swing price from EMA sections' };
      }
      
      logger.info(`EMA swing price for ${side}: $${swingPrice}, sections: ${sections.length}, last type: ${lastSection.type}, target section: [${targetSection.startCandle}-${targetSection.endCandle}]`);
      
      return {
        price: swingPrice,
        sections: sections.length,
        sectionType: lastSection.type,
        details: {
          lastSection: lastSection,
          prevSection: prevSection,
          targetSection: targetSection,
          slowOffset: slowOffset
        }
      };
    } catch (error) {
      logger.error('Error getting EMA swing price:', error);
      return { price: null, error: error.message };
    }
  }

  // ─── EWT (Elliott Wave Trading) ──────────────────────────────────────────

  static _calculateSMA(values, period) {
    const result = new Array(values.length).fill(null);
    for (let i = period - 1; i < values.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += values[i - period + 1 + j];
      }
      result[i] = sum / period;
    }
    return result;
  }

  static _calculateStdDev(values, period, mean) {
    const meanArr = mean || this._calculateSMA(values, period);
    const result = new Array(values.length).fill(null);
    for (let i = period - 1; i < values.length; i++) {
      let sumSq = 0;
      for (let j = 0; j < period; j++) {
        const diff = values[i - period + 1 + j] - meanArr[i];
        sumSq += diff * diff;
      }
      result[i] = Math.sqrt(sumSq / period);
    }
    return result;
  }

  static _calculateSuperTrendAligned(highs, lows, closes, period, multiplier) {
    const atr = this.calculateATR(highs, lows, closes, period);
    const length = closes.length;
    const superTrend = new Array(length).fill(null);
    const direction = new Array(length).fill(0);

    let prevUpperBand = null;
    let prevLowerBand = null;
    let prevSuperTrend = null;

    for (let i = 0; i < length; i++) {
      if (atr[i] === null) {
        superTrend[i] = null;
        direction[i] = 0;
        continue;
      }

      const src = (highs[i] + lows[i]) / 2;
      const upperBand = src + multiplier * atr[i];
      const lowerBand = src - multiplier * atr[i];

      let finalUpperBand = upperBand;
      if (prevUpperBand !== null && (upperBand < prevUpperBand || closes[i - 1] > prevUpperBand)) {
        finalUpperBand = upperBand;
      } else if (prevUpperBand !== null) {
        finalUpperBand = prevUpperBand;
      }

      let finalLowerBand = lowerBand;
      if (prevLowerBand !== null && (lowerBand > prevLowerBand || closes[i - 1] < prevLowerBand)) {
        finalLowerBand = lowerBand;
      } else if (prevLowerBand !== null) {
        finalLowerBand = prevLowerBand;
      }

      let _direction = 0;
      if (i === 0 || atr[i - 1] === null) {
        _direction = 1;
      } else if (prevSuperTrend === prevUpperBand) {
        _direction = closes[i] > finalUpperBand ? -1 : 1;
      } else {
        _direction = closes[i] < finalLowerBand ? 1 : -1;
      }

      superTrend[i] = _direction === -1 ? finalLowerBand : finalUpperBand;
      direction[i] = _direction;

      prevUpperBand = finalUpperBand;
      prevLowerBand = finalLowerBand;
      prevSuperTrend = superTrend[i];
    }

    return { superTrend, direction };
  }

  static checkEWT(candles, params = {}) {
    try {
      const {
        barsPerHour = 4,
        macroAtrLen = 10,
        macroMult = 3.0,
        localAtrLen = 10,
        localMult = 3.0,
        zscoreLength = 500,
        zscoreMin = 1.8,
        zscoreMax = 10.0,
        useWickFilter = true,
        maxWickRatio = 0.3
      } = params;

      const minRequired = Math.max(zscoreLength, barsPerHour + macroAtrLen, localAtrLen + 2);
      if (candles.length < minRequired) {
        return { met: false, error: `Insufficient data for EWT calculation, need ${minRequired} bars` };
      }

      const length = candles.length;
      const opens = candles.map(c => c.open);
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const closes = candles.map(c => c.close);

      // ── Step A: Z-Score & Wick Filter ──────────────────────────────────
      const absReturns = new Array(length);
      for (let i = 0; i < length; i++) {
        absReturns[i] = Math.abs(closes[i] - opens[i]);
      }

      const meanReturn = this._calculateSMA(absReturns, zscoreLength);
      const stdReturn = this._calculateStdDev(absReturns, zscoreLength, meanReturn);

      const isHighReturnBars = new Array(length).fill(false);
      for (let i = 0; i < length; i++) {
        let zScore = 0;
        if (meanReturn[i] !== null && stdReturn[i] !== null && stdReturn[i] !== 0) {
          zScore = (absReturns[i] - meanReturn[i]) / stdReturn[i];
        }
        const isZScoreHigh = zScore >= zscoreMin && zScore < zscoreMax;
        const barBody = Math.abs(closes[i] - opens[i]);
        const directionalWick = closes[i] >= opens[i] ? (highs[i] - closes[i]) : (opens[i] - lows[i]);
        const wickRatio = barBody > 0 ? directionalWick / barBody : 0;
        const passWickFilter = !useWickFilter || wickRatio < maxWickRatio;
        isHighReturnBars[i] = isZScoreHigh && passWickFilter;
      }
      const isHighReturnBar = isHighReturnBars[length - 1];

      // ── Step B: Synthetic Macro SuperTrend (HTF) ──────────────────────
      const rollingHighs = new Array(length).fill(null);
      const rollingLows = new Array(length).fill(null);
      const prevRollingCloses = new Array(length).fill(null);

      for (let i = barsPerHour - 1; i < length; i++) {
        let maxH = -Infinity, minL = Infinity;
        const start = i - barsPerHour + 1;
        for (let j = start; j <= i; j++) {
          if (highs[j] > maxH) maxH = highs[j];
          if (lows[j] < minL) minL = lows[j];
        }
        rollingHighs[i] = maxH;
        rollingLows[i] = minL;
        if (i >= barsPerHour) {
          prevRollingCloses[i] = closes[i - barsPerHour];
        }
      }

      const syntheticTR = new Array(length).fill(null);
      for (let i = barsPerHour - 1; i < length; i++) {
        if (prevRollingCloses[i] !== null) {
          syntheticTR[i] = Math.max(
            rollingHighs[i] - rollingLows[i],
            Math.abs(rollingHighs[i] - prevRollingCloses[i]),
            Math.abs(rollingLows[i] - prevRollingCloses[i])
          );
        }
      }

      const syntheticATR = this.calculateRMA(syntheticTR, macroAtrLen);

      let prevSynthUpper = null, prevSynthLower = null, prevSynthST = null;
      let synthDir = 0, prevSynthDir = 0;
      let lastSynthStLine = null;
      let htfChanged = false;

      for (let i = 0; i < length; i++) {
        if (syntheticATR[i] === null || rollingHighs[i] === null) continue;

        const hl2 = (rollingHighs[i] + rollingLows[i]) / 2;
        const upperBand = hl2 + macroMult * syntheticATR[i];
        const lowerBand = hl2 - macroMult * syntheticATR[i];

        let finalUpper = upperBand;
        if (prevSynthUpper !== null) {
          if (upperBand < prevSynthUpper || (i > 0 && closes[i - 1] > prevSynthUpper)) {
            finalUpper = upperBand;
          } else {
            finalUpper = prevSynthUpper;
          }
        }

        let finalLower = lowerBand;
        if (prevSynthLower !== null) {
          if (lowerBand > prevSynthLower || (i > 0 && closes[i - 1] < prevSynthLower)) {
            finalLower = lowerBand;
          } else {
            finalLower = prevSynthLower;
          }
        }

        let dir = 0;
        if (prevSynthST === null) {
          dir = 1;
        } else if (prevSynthST === prevSynthUpper) {
          dir = closes[i] > finalUpper ? -1 : 1;
        } else {
          dir = closes[i] < finalLower ? 1 : -1;
        }

        const stVal = dir === -1 ? finalLower : finalUpper;

        if (i === length - 1) {
          synthDir = dir;
          lastSynthStLine = stVal;
        }

        if (prevSynthDir !== 0 && dir !== prevSynthDir) {
          if (i === length - 1) htfChanged = true;
        }

        prevSynthDir = dir;
        prevSynthUpper = finalUpper;
        prevSynthLower = finalLower;
        prevSynthST = stVal;
      }

      if (prevSynthST !== null && lastSynthStLine === null) {
        lastSynthStLine = prevSynthST;
      }

      const isSynthBullish = synthDir === -1;

      // ── Step C: Local SuperTrend ──────────────────────────────────────
      const { superTrend: localSTArr, direction: localDirArr } =
        this._calculateSuperTrendAligned(highs, lows, closes, localAtrLen, localMult);

      let localDir = 0, localStLine = null, prevLocalDir = 0;
      let prevExtremePrice = null, curExtremePrice = null;

      for (let i = 0; i < length; i++) {
        if (localDirArr[i] === 0 || localDirArr[i] === null) continue;

        const isBull = localDirArr[i] === -1;

        if (i === 0) {
          curExtremePrice = isBull ? highs[i] : lows[i];
        }

        if (prevLocalDir !== 0 && localDirArr[i] !== prevLocalDir) {
          prevExtremePrice = curExtremePrice;
          curExtremePrice = isBull ? highs[i] : lows[i];
        } else {
          if (isBull && (curExtremePrice === null || highs[i] >= curExtremePrice)) {
            curExtremePrice = highs[i];
          } else if (!isBull && (curExtremePrice === null || lows[i] <= curExtremePrice)) {
            curExtremePrice = lows[i];
          }
        }

        if (i === length - 1) {
          localDir = localDirArr[i];
          localStLine = localSTArr[i];
        }

        prevLocalDir = localDirArr[i];
      }

      const isLocalBullish = localDir === -1;
      let localDirChanged = false;
      if (length >= 2) {
        let lastValid = null, secondLastValid = null;
        for (let i = length - 1; i >= 0; i--) {
          if (localDirArr[i] !== null && localDirArr[i] !== 0) {
            if (lastValid === null) {
              lastValid = localDirArr[i];
            } else if (secondLastValid === null) {
              secondLastValid = localDirArr[i];
              break;
            }
          }
        }
        localDirChanged = secondLastValid !== null && lastValid !== secondLastValid;
      }

      // ── Step D: Signal Combination ────────────────────────────────────
      const primaryLong = localDirChanged && isLocalBullish && isSynthBullish && isHighReturnBar;
      const primaryShort = localDirChanged && !isLocalBullish && !isSynthBullish && isHighReturnBar;
      const additionalLong = htfChanged && isSynthBullish && isHighReturnBar;
      const additionalShort = htfChanged && !isSynthBullish && isHighReturnBar;

      let signal = 'none';
      let met = false;
      let sl_price = null;

      if (primaryLong || primaryShort || additionalLong || additionalShort) {
        met = true;
      }

      if (primaryLong) {
        signal = 'bullish_crossover';
        sl_price = localStLine;
      } else if (primaryShort) {
        signal = 'bearish_crossover';
        sl_price = localStLine;
      } else if (additionalLong) {
        signal = 'bullish_crossover';
        sl_price = prevExtremePrice !== null ? prevExtremePrice : lastSynthStLine;
      } else if (additionalShort) {
        signal = 'bearish_crossover';
        sl_price = prevExtremePrice !== null ? prevExtremePrice : lastSynthStLine;
      }

      const result = {
        met,
        signal,
        price: closes[length - 1],
        sl_price,
        details: {
          zScore: meanReturn[length - 1] !== null && stdReturn[length - 1] !== null
            ? (absReturns[length - 1] - meanReturn[length - 1]) / stdReturn[length - 1] : 0,
          isHighReturnBar,
          synthDir,
          localDir,
          htfChanged,
          localDirChanged,
          isSynthBullish,
          isLocalBullish,
          primaryLong,
          primaryShort,
          additionalLong,
          additionalShort,
          prevExtremePrice
        }
      };

      logger.info(`EWT check: signal=${signal}, met=${met}, price=${result.price}, sl=${sl_price}`);
      return result;

    } catch (error) {
      logger.error('Error checking EWT:', error);
      return { met: false, error: error.message };
    }
  }

  static getEWTSwingPrice(candles, side, params = {}) {
    try {
      const localAtrLen = params.localAtrLen || 10;
      const localMult = params.localMult || 3.0;

      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const closes = candles.map(c => c.close);

      const { direction } = this._calculateSuperTrendAligned(highs, lows, closes, localAtrLen, localMult);

      const length = direction.length;
      const sections = [];
      let currentSection = null;

      for (let i = 0; i < length; i++) {
        if (direction[i] === null || direction[i] === 0) continue;
        const type = direction[i] === -1 ? 'bullish' : 'bearish';

        if (currentSection === null) {
          currentSection = { type, startCandle: i, endCandle: i };
        } else if (type !== currentSection.type) {
          currentSection.duration = currentSection.endCandle - currentSection.startCandle + 1;
          sections.push({ ...currentSection });
          currentSection = { type, startCandle: i, endCandle: i };
        } else {
          currentSection.endCandle = i;
        }
      }

      if (currentSection !== null) {
        currentSection.duration = currentSection.endCandle - currentSection.startCandle + 1;
        sections.push({ ...currentSection });
      }

      if (sections.length < 2) {
        return { price: null, error: 'Not enough EWT sections for swing detection' };
      }

      const lastSection = sections[sections.length - 1];
      const prevSection = sections[sections.length - 2];

      let swingPrice = null;
      let targetSection = null;

      if (side === 'long') {
        targetSection = lastSection.type === 'bearish'
          ? lastSection
          : prevSection.type === 'bearish' ? prevSection : null;
        if (targetSection) {
          const sectionLows = lows.slice(targetSection.startCandle, targetSection.endCandle + 1);
          swingPrice = Math.min(...sectionLows);
        }
      } else if (side === 'short') {
        targetSection = lastSection.type === 'bullish'
          ? lastSection
          : prevSection.type === 'bullish' ? prevSection : null;
        if (targetSection) {
          const sectionHighs = highs.slice(targetSection.startCandle, targetSection.endCandle + 1);
          swingPrice = Math.max(...sectionHighs);
        }
      }

      if (swingPrice === null || swingPrice <= 0) {
        return { price: null, error: 'Could not determine swing price from EWT sections' };
      }

      logger.info(`EWT swing price for ${side}: $${swingPrice}`);
      return {
        price: swingPrice,
        sections: sections.length,
        sectionType: lastSection.type,
        details: {
          lastSection,
          prevSection,
          targetSection
        }
      };
    } catch (error) {
      logger.error('Error getting EWT swing price:', error);
      return { price: null, error: error.message };
    }
  }
}

module.exports = IndicatorService;