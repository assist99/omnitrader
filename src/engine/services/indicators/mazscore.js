const logger = require('../../logger');

function ema(values, length) {
  const result = new Array(values.length).fill(null);
  const k = 2 / (length + 1);
  let sum = 0;
  for (let i = 0; i < length && i < values.length; i++) {
    sum += values[i];
    result[i] = sum / (i + 1);
  }
  if (values.length > length) {
    result[length - 1] = sum / length;
    for (let i = length; i < values.length; i++) {
      result[i] = (values[i] - result[i - 1]) * k + result[i - 1];
    }
  }
  return result;
}

function sma(values, length) {
  const result = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= length - 1) {
      result[i] = sum / length;
      sum -= values[i - length + 1];
    }
  }
  return result;
}

function atr(bars, length) {
  const tr = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      tr[i] = bars[i].high - bars[i].low;
    } else {
      tr[i] = Math.max(
        bars[i].high - bars[i].low,
        Math.abs(bars[i].high - bars[i - 1].close),
        Math.abs(bars[i].low - bars[i - 1].close)
      );
    }
  }
  const result = new Array(tr.length).fill(null);
  let sum = 0;
  for (let i = 0; i < tr.length; i++) {
    sum += tr[i];
    if (i === length - 1) {
      result[i] = sum / length;
    } else if (i > length - 1) {
      result[i] = (result[i - 1] * (length - 1) + tr[i]) / length;
    }
  }
  return result;
}

function stddev(values, length) {
  const result = new Array(values.length).fill(null);
  for (let i = length - 1; i < values.length; i++) {
    let sum = 0;
    for (let j = 0; j < length; j++) {
      sum += values[i - length + 1 + j];
    }
    const mean = sum / length;
    let sumSq = 0;
    for (let j = 0; j < length; j++) {
      const diff = values[i - length + 1 + j] - mean;
      sumSq += diff * diff;
    }
    result[i] = Math.sqrt(sumSq / length);
  }
  return result;
}

function checkMAZScore(bars, params = {}) {
  try {
    const emaLength = params.emaLength || 50;
    const atrLength = params.atrLength || 14;
    const lookbackLength = params.lookbackLength || 200;

    const minBars = emaLength + lookbackLength + 2;
    if (bars.length < minBars) {
      return { met: false, error: `Insufficient data for MA Z-Score calculation, need ${minBars} bars`, signal: 'none', zScore: null };
    }

    const closes = bars.map(b => b.close);

    const emaVals = ema(closes, emaLength);
    const atrVals = atr(bars, atrLength);

    const rawIdx = new Array(closes.length).fill(null);
    for (let i = 0; i < closes.length; i++) {
      if (emaVals[i] !== null && atrVals[i] !== null && atrVals[i] !== 0) {
        rawIdx[i] = (closes[i] - emaVals[i]) / atrVals[i];
      } else {
        rawIdx[i] = 0;
      }
    }

    const smaIdx = sma(rawIdx, lookbackLength);
    const stdIdx = stddev(rawIdx, lookbackLength);

    const zScores = new Array(closes.length).fill(null);
    for (let i = 0; i < closes.length; i++) {
      if (smaIdx[i] !== null && stdIdx[i] !== null && stdIdx[i] !== 0) {
        zScores[i] = (rawIdx[i] - smaIdx[i]) / stdIdx[i];
      } else {
        zScores[i] = 0;
      }
    }

    const latestZScore = zScores[zScores.length - 1];
    const n = zScores.length;

    return {
      met: latestZScore !== null && !isNaN(latestZScore),
      signal: String(latestZScore),
      zScore: latestZScore,
      details: {
        emaLength,
        atrLength,
        lookbackLength,
        close: closes[n - 1],
        ema: emaVals[n - 1],
        atr: atrVals[n - 1],
        rawIdx: rawIdx[n - 1],
        smaIdx: smaIdx[n - 1],
        stdIdx: stdIdx[n - 1],
      }
    };
  } catch (error) {
    logger.error('Error checking MA Z-Score:', error);
    return { met: false, error: error.message, signal: 'none', zScore: null };
  }
}

module.exports = {
  checkMAZScore,
};