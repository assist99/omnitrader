const { SMA } = require('technicalindicators');
const logger = require('../../logger');

function buildSyntheticCandles(candles, rollingPeriod) {
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

function detectSuperTrendCrossover(superTrend, closes, label) {
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

function calculateATR(highs, lows, closes, period) {
  if (closes.length < period) {
    return [];
  }

  const trueRanges = new Array(closes.length).fill(0);

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

  return calculateRMA(trueRanges, period);
}

function calculateRMA(values, period) {
  const alpha = 1 / period;
  const rma = new Array(values.length).fill(null);

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      rma[i] = null;
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += values[i - period + 1 + j];
      }
      rma[i] = sum / period;
    } else {
      rma[i] = alpha * values[i] + (1 - alpha) * rma[i - 1];
    }
  }

  return rma;
}

function calculateSuperTrend(highs, lows, closes, period, multiplier) {
  const atr = calculateATR(highs, lows, closes, period);
  if (atr.length === 0) {
    return [];
  }

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
    let superTrendValue = null;

    if (i === 0 || atr[i - 1] === null) {
      _direction = 1;
    } else if (prevSuperTrend === prevUpperBand) {
      _direction = closes[i] > finalUpperBand ? -1 : 1;
    } else {
      _direction = closes[i] < finalLowerBand ? 1 : -1;
    }

    superTrendValue = _direction === -1 ? finalLowerBand : finalUpperBand;

    direction[i] = _direction;
    superTrend[i] = superTrendValue;

    prevUpperBand = finalUpperBand;
    prevLowerBand = finalLowerBand;
    prevSuperTrend = superTrendValue;
  }

  return superTrend.filter(val => val !== null);
}

function getSuperTrend(highs, lows, closes, period, multiplier) {
  const superTrend = calculateSuperTrend(highs, lows, closes, period, multiplier);
  const startIndex = period - 1;
  const alignedSuperTrend = superTrend.map((st, i) => ({
    index: startIndex + i,
    value: st
  }));
  return alignedSuperTrend;
}

function _calculateSMA(values, period) {
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

function _calculateStdDev(values, period, mean) {
  const meanArr = mean || _calculateSMA(values, period);
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

function _calculateSuperTrendAligned(highs, lows, closes, period, multiplier) {
  const atr = calculateATR(highs, lows, closes, period);
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

module.exports = {
  buildSyntheticCandles,
  detectSuperTrendCrossover,
  calculateATR,
  calculateRMA,
  calculateSuperTrend,
  getSuperTrend,
  _calculateSMA,
  _calculateStdDev,
  _calculateSuperTrendAligned,
};