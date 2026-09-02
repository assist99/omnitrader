const logger = require('../../logger');
const CandleUtils = require('../../utils/candleUtils');

function checkCandlestickPattern(candles, patternType) {
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

module.exports = { checkCandlestickPattern };