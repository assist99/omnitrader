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

      switch (indicatorType.toLowerCase()) {
        case 'supertrend':
          return this.checkSuperTrend(candles, params);
        case 'macd':
          return this.checkMACD(candles, params);
        case 'ema':
          return this.checkEMA(candles, params);
        default:
          return { met: false, error: `Unsupported indicator type: ${indicatorType}` };
      }
    } catch (error) {
      logger.error(`Error checking ${indicatorType} condition:`, error);
      return { met: false, error: error.message };
    }
  }

  static checkSuperTrend(candles, params = {}) {
    try {
      const period = params.period || 10;
      const multiplier = params.multiplier || 4;
      
      const highs = candles.map(c => c.high);
      const lows = candles.map(c => c.low);
      const closes = candles.map(c => c.close);
      
      const superTrend = this.calculateSuperTrend(highs, lows, closes, period, multiplier);
      if (superTrend.length < 2) {
        return { met: false, error: 'Insufficient data for SuperTrend calculation' };
      }
      // Get last two SuperTrend values
      const lastST = superTrend[superTrend.length - 1];
      const prevST = superTrend[superTrend.length - 2];
      const lastClose = closes[closes.length - 1];
      console.log(`SuperTrend values: last=${lastST}, previous=${prevST}, close=${lastClose}`);
      
      // Check for trend change
      const wasBullish = prevST > closes[closes.length - 2];
      const isBullish = lastST > lastClose;
      
      let signal = 'none';
      let met = false;
      
      if (!wasBullish && isBullish) {
        signal = 'bullish_crossover';
        met = true;
        logger.info(`SuperTrend bullish crossover detected at $${lastClose}`);
      } else if (wasBullish && !isBullish) {
        signal = 'bearish_crossover';
        met = true;
        logger.info(`SuperTrend bearish crossover detected at $${lastClose}`);
      }
      
      return {
        met: met,
        signal: signal,
        value: lastST,
        price: lastClose,
        details: {
          period: period,
          multiplier: multiplier,
          trend: isBullish ? 'bullish' : 'bearish'
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
      
      if (!wasAbove && isAbove && !wasHistPositive && isHistPositive) {
        signal = 'bullish_crossover';
        met = true;
        logger.info(`MACD bullish crossover detected`);
      } else if (wasAbove && !isAbove && wasHistPositive && !isHistPositive) {
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
        details: {
          fastPeriod: fastPeriod,
          slowPeriod: slowPeriod,
          signalPeriod: signalPeriod,
          macdAboveSignal: isAbove,
          histogramPositive: isHistPositive
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
      'supertrend': { period: 10, multiplier: 4 },
      'macd': { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
      'ema': { fastPeriod: 9, slowPeriod: 21 },
      'ema_cross': { fastPeriod: 9, slowPeriod: 21 }
    };
    
    return defaultParams[indicatorType.toLowerCase()] || {};
  }

  static validateIndicatorConfig(indicatorType, timeframe) {
    const validIndicators = ['supertrend', 'macd', 'ema'];
    const validTimeframes = ['m1', 'm5', 'm15', 'm30', 'h1', 'h2', 'h4', 'd1'];
    
    if (!validIndicators.includes(indicatorType.toLowerCase())) {
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

      switch (indicatorType.toLowerCase()) {
        case 'macd':
          return this.getMACDSwingPrice(candles, side, params);
        case 'supertrend':
          return this.getSuperTrendSwingPrice(candles, side, params);
        case 'ema':
          return this.getEMASwingPrice(candles, side, params);
        default:
          return { price: null, error: `Unsupported indicator type for swing detection: ${indicatorType}` };
      }
    } catch (error) {
      logger.error(`Error getting swing price for ${indicatorType}:`, error);
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
      
      if (macd.length < 50) {
        return { price: null, error: 'Insufficient MACD data for swing detection' };
      }
      
      const histograms = macd.map(m => m.histogram);
      
      let sections = [];
      let currentSection = { start: 0, type: null };
      
      for (let i = 1; i < histograms.length; i++) {
        const prevHist = histograms[i - 1];
        const currHist = histograms[i];
        
        if (currentSection.type === null) {
          currentSection.type = prevHist >= 0 ? 'positive' : 'negative';
          currentSection.start = i - 1;
        }
        
        const sectionChanged = (prevHist >= 0 && currHist < 0) || (prevHist < 0 && currHist >= 0);
        
        if (sectionChanged) {
          currentSection.end = i - 1;
          currentSection.duration = currentSection.end - currentSection.start + 1;
          sections.push({ ...currentSection });
          
          currentSection = { start: i, type: currHist >= 0 ? 'positive' : 'negative' };
        }
        
        if (i === histograms.length - 1 && currentSection.type !== null) {
          currentSection.end = i;
          currentSection.duration = currentSection.end - currentSection.start + 1;
          sections.push({ ...currentSection });
        }
      }
      
      if (sections.length < 2) {
        return { price: null, error: 'Not enough MACD sections for swing detection' };
      }
      
      const lastSection = sections[sections.length - 1];
      const prevSection = sections[sections.length - 2];
      
      let swingPrice = null;
      
      if (side === 'long') {
        const bearishSection = lastSection.type === 'negative' ? lastSection : prevSection.type === 'negative' ? prevSection : null;
        
        if (bearishSection) {
          const sectionLows = lows.slice(bearishSection.start, bearishSection.end + 1);
          swingPrice = Math.min(...sectionLows);
        }
      } else if (side === 'short') {
        const bullishSection = lastSection.type === 'positive' ? lastSection : prevSection.type === 'positive' ? prevSection : null;
        
        if (bullishSection) {
          const sectionHighs = highs.slice(bullishSection.start, bullishSection.end + 1);
          swingPrice = Math.max(...sectionHighs);
        }
      }
      
      if (swingPrice === null || swingPrice <= 0) {
        return { price: null, error: 'Could not determine swing price from MACD sections' };
      }
      
      logger.info(`MACD swing price for ${side}: $${swingPrice}, sections: ${sections.length}, last type: ${lastSection.type}`);
      
      return {
        price: swingPrice,
        sections: sections.length,
        sectionType: lastSection.type,
        details: {
          lastSection: lastSection,
          prevSection: prevSection
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
      
      const superTrend = this.calculateSuperTrend(highs, lows, closes, period, multiplier);
      
      if (superTrend.length < 50) {
        return { price: null, error: 'Insufficient SuperTrend data for swing detection' };
      }
      
      let sections = [];
      let currentSection = { start: 0, type: null };
      
      for (let i = 1; i < superTrend.length; i++) {
        const prevST = superTrend[i - 1];
        const currST = superTrend[i];
        const prevClose = closes[i - 1];
        const currClose = closes[i];
        
        const wasBullish = prevST > prevClose;
        const isBullish = currST > currClose;
        
        if (currentSection.type === null) {
          currentSection.type = wasBullish ? 'bearish' : 'bullish';
          currentSection.start = i - 1;
        }
        
        const sectionChanged = (wasBullish && !isBullish) || (!wasBullish && isBullish);
        
        if (sectionChanged) {
          currentSection.end = i - 1;
          currentSection.duration = currentSection.end - currentSection.start + 1;
          sections.push({ ...currentSection });
          
          currentSection = { start: i, type: isBullish ? 'bearish' : 'bullish' };
        }
        
        if (i === superTrend.length - 1 && currentSection.type !== null) {
          currentSection.end = i;
          currentSection.duration = currentSection.end - currentSection.start + 1;
          sections.push({ ...currentSection });
        }
      }
      
      if (sections.length < 2) {
        return { price: null, error: 'Not enough SuperTrend sections for swing detection' };
      }
      
      const lastSection = sections[sections.length - 1];
      const prevSection = sections[sections.length - 2];
      
      let swingPrice = null;
      
      if (side === 'long') {
        const bearishSection = lastSection.type === 'bearish' ? lastSection : prevSection.type === 'bearish' ? prevSection : null;
        
        if (bearishSection) {
          const sectionLows = lows.slice(bearishSection.start, bearishSection.end + 1);
          swingPrice = Math.min(...sectionLows);
        }
      } else if (side === 'short') {
        const bullishSection = lastSection.type === 'bullish' ? lastSection : prevSection.type === 'bullish' ? prevSection : null;
        
        if (bullishSection) {
          const sectionHighs = highs.slice(bullishSection.start, bullishSection.end + 1);
          swingPrice = Math.max(...sectionHighs);
        }
      }
      
      if (swingPrice === null || swingPrice <= 0) {
        return { price: null, error: 'Could not determine swing price from SuperTrend sections' };
      }
      
      logger.info(`SuperTrend swing price for ${side}: $${swingPrice}, sections: ${sections.length}, last type: ${lastSection.type}`);
      
      return {
        price: swingPrice,
        sections: sections.length,
        sectionType: lastSection.type,
        details: {
          lastSection: lastSection,
          prevSection: prevSection
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
      
      if (fastEMA.length < 50 || slowEMA.length < 50) {
        return { price: null, error: 'Insufficient EMA data for swing detection' };
      }
      
      let sections = [];
      let currentSection = { start: 0, type: null };
      
      const startIdx = Math.min(fastEMA.length, slowEMA.length) - 50;
      
      for (let i = startIdx + 1; i < Math.min(fastEMA.length, slowEMA.length); i++) {
        const prevFast = fastEMA[i - 1];
        const prevSlow = slowEMA[i - 1];
        const currFast = fastEMA[i];
        const currSlow = slowEMA[i];
        
        const wasAbove = prevFast > prevSlow;
        const isAbove = currFast > currSlow;
        
        if (currentSection.type === null) {
          currentSection.type = wasAbove ? 'bullish' : 'bearish';
          currentSection.start = i - 1;
        }
        
        const sectionChanged = (wasAbove && !isAbove) || (!wasAbove && isAbove);
        
        if (sectionChanged) {
          currentSection.end = i - 1;
          currentSection.duration = currentSection.end - currentSection.start + 1;
          sections.push({ ...currentSection });
          
          currentSection = { start: i, type: isAbove ? 'bullish' : 'bearish' };
        }
        
        if (i === Math.min(fastEMA.length, slowEMA.length) - 1 && currentSection.type !== null) {
          currentSection.end = i;
          currentSection.duration = currentSection.end - currentSection.start + 1;
          sections.push({ ...currentSection });
        }
      }
      
      if (sections.length < 2) {
        return { price: null, error: 'Not enough EMA sections for swing detection' };
      }
      
      const lastSection = sections[sections.length - 1];
      const prevSection = sections[sections.length - 2];
      
      let swingPrice = null;
      
      if (side === 'long') {
        const bearishSection = lastSection.type === 'bearish' ? lastSection : prevSection.type === 'bearish' ? prevSection : null;
        
        if (bearishSection) {
          const sectionLows = lows.slice(bearishSection.start, bearishSection.end + 1);
          swingPrice = Math.min(...sectionLows);
        }
      } else if (side === 'short') {
        const bullishSection = lastSection.type === 'bullish' ? lastSection : prevSection.type === 'bullish' ? prevSection : null;
        
        if (bullishSection) {
          const sectionHighs = highs.slice(bullishSection.start, bullishSection.end + 1);
          swingPrice = Math.max(...sectionHighs);
        }
      }
      
      if (swingPrice === null || swingPrice <= 0) {
        return { price: null, error: 'Could not determine swing price from EMA sections' };
      }
      
      logger.info(`EMA swing price for ${side}: $${swingPrice}, sections: ${sections.length}, last type: ${lastSection.type}`);
      
      return {
        price: swingPrice,
        sections: sections.length,
        sectionType: lastSection.type,
        details: {
          lastSection: lastSection,
          prevSection: prevSection
        }
      };
    } catch (error) {
      logger.error('Error getting EMA swing price:', error);
      return { price: null, error: error.message };
    }
  }
}

module.exports = IndicatorService;