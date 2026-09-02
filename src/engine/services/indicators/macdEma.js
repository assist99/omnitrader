const { MACD, EMA } = require('technicalindicators');
const logger = require('../../logger');

function checkMACD(candles, params = {}) {
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

    const lastMACD = macd[macd.length - 1];
    const prevMACD = macd[macd.length - 2];

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
        macdAboveSignal: lastMACD.MACD > lastMACD.signal,
        histogramPositive: isHistPositive,
        pastHistogramPositive: wasHistPositive
      }
    };
  } catch (error) {
    logger.error('Error checking MACD:', error);
    return { met: false, error: error.message };
  }
}

function checkEMA(candles, params = {}) {
  try {
    const fastPeriod = params.fastPeriod || 9;
    const slowPeriod = params.slowPeriod || 21;

    const closes = candles.map(c => c.close);

    const fastEMA = EMA.calculate({ period: fastPeriod, values: closes });
    const slowEMA = EMA.calculate({ period: slowPeriod, values: closes });

    if (fastEMA.length < 2 || slowEMA.length < 2) {
      return { met: false, error: 'Insufficient data for EMA calculation' };
    }

    const lastFastEMA = fastEMA[fastEMA.length - 1];
    const prevFastEMA = fastEMA[fastEMA.length - 2];
    const lastSlowEMA = slowEMA[slowEMA.length - 1];
    const prevSlowEMA = slowEMA[slowEMA.length - 2];

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

function getMACDSwingPrice(candles, side, params = {}) {
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

    const candleOffset = candles.length - macd.length;

    const sections = [];
    let currentSection = null;

    for (let mi = 0; mi < macd.length; mi++) {
      const hist = macd[mi].histogram;
      const candleIdx = candleOffset + mi;
      const type = hist >= 0 ? 'positive' : 'negative';

      if (currentSection === null) {
        currentSection = { type, startCandle: candleIdx, endCandle: candleIdx };
      } else if (type !== currentSection.type) {
        currentSection.duration = currentSection.endCandle - currentSection.startCandle + 1;
        sections.push({ ...currentSection });
        currentSection = { type, startCandle: candleIdx, endCandle: candleIdx };
      } else {
        currentSection.endCandle = candleIdx;
      }
    }

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
      targetSection = lastSection.type === 'negative'
        ? lastSection
        : prevSection.type === 'negative' ? prevSection : null;

      if (targetSection) {
        const sectionLows = lows.slice(targetSection.startCandle, targetSection.endCandle + 1);
        swingPrice = Math.min(...sectionLows);
      }
    } else if (side === 'short') {
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

function getEMASwingPrice(candles, side, params = {}) {
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

    const slowOffset = candles.length - slowEMA.length;
    const fastOffset = candles.length - fastEMA.length;

    const sections = [];
    let currentSection = null;

    for (let si = 0; si < slowEMA.length; si++) {
      const candleIdx = slowOffset + si;
      const fi = candleIdx - fastOffset;
      if (fi < 0) continue;

      const type = fastEMA[fi] >= slowEMA[si] ? 'bullish' : 'bearish';

      if (currentSection === null) {
        currentSection = { type, startCandle: candleIdx, endCandle: candleIdx };
      } else if (type !== currentSection.type) {
        currentSection.duration = currentSection.endCandle - currentSection.startCandle + 1;
        sections.push({ ...currentSection });
        currentSection = { type, startCandle: candleIdx, endCandle: candleIdx };
      } else {
        currentSection.endCandle = candleIdx;
      }
    }

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

module.exports = {
  checkMACD,
  checkEMA,
  getMACDSwingPrice,
  getEMASwingPrice,
};