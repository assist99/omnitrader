const logger = require('../../logger');

function checkMAZScore(bars, params = {}) {
  try {
    const maLength = params.maLength || 20;
    if (bars.length < maLength) {
      return { met: false, error: `Insufficient data for MA Z-Score calculation, need ${maLength} bars`, signal: 'none', zScore: null };
    }

    const closes = bars.map(b => b.close);
    const n = closes.length;

    const ma = new Array(n).fill(null);
    for (let i = maLength - 1; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < maLength; j++) {
        sum += closes[i - maLength + 1 + j];
      }
      ma[i] = sum / maLength;
    }

    const deviations = new Array(n).fill(null);
    for (let i = maLength - 1; i < n; i++) {
      deviations[i] = closes[i] - ma[i];
    }

    const std = new Array(n).fill(null);
    for (let i = maLength - 1; i < n; i++) {
      let sumSq = 0;
      for (let j = 0; j < maLength; j++) {
        const diff = deviations[i - maLength + 1 + j];
        sumSq += diff * diff;
      }
      std[i] = Math.sqrt(sumSq / maLength);
    }

    const zScores = new Array(n).fill(null);
    for (let i = maLength - 1; i < n; i++) {
      if (std[i] !== null && std[i] !== 0) {
        zScores[i] = deviations[i] / std[i];
      } else {
        zScores[i] = 0;
      }
    }

    const latestZScore = zScores[n - 1];

    logger.info(`MA Z-Score check: close=${closes[n-1]}, ma=${ma[n-1]}, deviation=${deviations[n-1]}, std=${std[n-1]}, zScore=${latestZScore}`);

    return {
      met: true,
      signal: String(latestZScore),
      zScore: latestZScore,
      details: {
        maLength,
        close: closes[n - 1],
        ma: ma[n - 1],
        deviation: deviations[n - 1],
        std: std[n - 1],
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
