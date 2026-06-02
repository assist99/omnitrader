const logger = require('../logger');
const TimeUtils = require('./timeUtils');

class CandleUtils {
  static filterClosedBars(candles, timeframe = null) {
    if (!Array.isArray(candles) || candles.length === 0) {
      return [];
    }

    if (!timeframe) {
      const closedBars = candles.slice(0, -1);
      if (closedBars.length === 0) {
        logger.warn('No closed bars available after filtering');
      }
      return closedBars;
    }

    const currentIntervalStart = TimeUtils.getTimeframeStartMillis(timeframe);
    const closedBars = candles.filter(candle => candle.timestamp < currentIntervalStart);

    if (closedBars.length === 0) {
      logger.warn('No closed bars available after filtering');
    }

    return closedBars;
  }

  static getLastCandle(candles) {
    const closedBars = this.filterClosedBars(candles);

    if (closedBars.length === 0) {
      return null;
    }

    return closedBars[closedBars.length - 1];
  }

  static parseBybitCandles(bybitCandles) {
    try {
      if (!Array.isArray(bybitCandles) || bybitCandles.length === 0) {
        return [];
      }
      
      return bybitCandles.map(candle => ({
        timestamp: parseInt(candle[0]),
        open: parseFloat(candle[1]),
        high: parseFloat(candle[2]),
        low: parseFloat(candle[3]),
        close: parseFloat(candle[4]),
        volume: parseFloat(candle[5])
      }));
    } catch (error) {
      logger.error('Error parsing Bybit candles:', error);
      return [];
    }
  }

static timeframeToBybitInterval(timeframe) {
    const intervalMap = {
      'm1': '1',
      'm5': '5',
      'm15': '15',
      'm30': '30',
      'h1': '60',
      'h2': '120',
      'h4': '240',
      'd1': 'D'
    };

    const interval = intervalMap[timeframe];
    if (!interval) {
      throw new Error(`Unsupported timeframe for Bybit: ${timeframe}`);
    }

    return interval;
  }

  static validateCandles(candles, minCount = 20) {
    if (!Array.isArray(candles)) {
      return { valid: false, error: 'Candles must be an array' };
    }
    
    if (candles.length < minCount) {
      return { valid: false, error: `Need at least ${minCount} candles, got ${candles.length}` };
    }
    
    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      
      if (!candle || typeof candle !== 'object') {
        return { valid: false, error: `Candle at index ${i} is not an object` };
      }
      
      const requiredFields = ['open', 'high', 'low', 'close'];
      for (const field of requiredFields) {
        if (typeof candle[field] !== 'number' || !isFinite(candle[field]) || candle[field] <= 0) {
          return { valid: false, error: `Invalid ${field} value at index ${i}: ${candle[field]}` };
        }
      }
      
      // Validate OHLC logic
      if (candle.high < candle.low) {
        return { valid: false, error: `High < Low at index ${i}` };
      }
      
      if (candle.open < candle.low || candle.open > candle.high) {
        return { valid: false, error: `Open outside range at index ${i}` };
      }
      
      if (candle.close < candle.low || candle.close > candle.high) {
        return { valid: false, error: `Close outside range at index ${i}` };
      }
    }
    
    return { valid: true, error: null };
  }

  static calculateCandleStatistics(candles) {
    const closedBars = this.filterClosedBars(candles);
    
    if (closedBars.length === 0) {
      return null;
    }
    
    const closes = closedBars.map(c => c.close);
    const highs = closedBars.map(c => c.high);
    const lows = closedBars.map(c => c.low);
    
    const lastCandle = closedBars[closedBars.length - 1];
    
    return {
      count: closedBars.length,
      currentPrice: lastCandle.close,
      high: Math.max(...highs),
      low: Math.min(...lows),
      avgClose: closes.reduce((sum, val) => sum + val, 0) / closes.length,
      lastCandle: lastCandle
    };
  }

  static isBullishCandle(candle) {
    return candle.close > candle.open;
  }

  static isBearishCandle(candle) {
    return candle.close < candle.open;
  }

  static isDojiCandle(candle, threshold = 0.1) {
    const bodySize = Math.abs(candle.close - candle.open);
    const totalRange = candle.high - candle.low;
    
    if (totalRange === 0) return false;
    
    const bodyRatio = bodySize / totalRange;
    return bodyRatio < threshold;
  }

  static isEngulfingPattern(prevCandle, currentCandle) {
    // Bullish engulfing
    if (this.isBearishCandle(prevCandle) && this.isBullishCandle(currentCandle)) {
      return currentCandle.open < prevCandle.close && currentCandle.close > prevCandle.open;
    }
    
    // Bearish engulfing
    if (this.isBullishCandle(prevCandle) && this.isBearishCandle(currentCandle)) {
      return currentCandle.open > prevCandle.close && currentCandle.close < prevCandle.open;
    }
    
    return false;
  }

  static isPinbarCandle(candle, threshold = 0.7) {
    const bodySize = Math.abs(candle.close - candle.open);
    const upperShadow = candle.high - Math.max(candle.open, candle.close);
    const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
    const totalRange = candle.high - candle.low;
    
    if (totalRange === 0) return false;
    
    // Hammer (bullish pinbar)
    if (lowerShadow > bodySize * 2 && upperShadow < bodySize) {
      return { type: 'hammer', direction: 'bullish' };
    }
    
    // Shooting star (bearish pinbar)
    if (upperShadow > bodySize * 2 && lowerShadow < bodySize) {
      return { type: 'shooting_star', direction: 'bearish' };
    }
    
    return null;
  }
}

module.exports = CandleUtils;