const logger = require('../../logger');

function checkSupplyDemand(candles, params = {}) {
  try {
    const bodyTolerance = params.bodyTolerance || 0.5;
    const minWickOverlapRate = params.minWickOverlapRate || 0.1;
    const checkCandle0Dir = params.checkCandle0Dir !== undefined ? params.checkCandle0Dir : true;
    const checkBreakCandle2 = true;

    if (candles.length < 3) {
      return { met: false, error: 'Need at least 3 candles for supply/demand detection' };
    }

    const c0 = candles[candles.length - 1];
    const c1 = candles[candles.length - 2];
    const c2 = candles[candles.length - 3];

    const o0 = c0.open, c0c = c0.close, h0 = c0.high, l0 = c0.low;
    const o1 = c1.open, c1c = c1.close, h1 = c1.high, l1 = c1.low;
    const o2 = c2.open, c2c = c2.close, h2 = c2.high, l2 = c2.low;

    const isSupTrend = c1c < o1;
    const isDemTrend = c1c > o1;

    const c0SupplyValid = !checkCandle0Dir || (c0c < Math.min(l1, l2));
    const c0DemandValid = !checkCandle0Dir || (c0c > Math.max(h1, h2));

    const maxBody1 = Math.max(o1, c1c);
    const minBody1 = Math.min(o1, c1c);
    const maxBody2 = Math.max(o2, c2c);
    const minBody2 = Math.min(o2, c2c);
    const sizeBody2 = maxBody2 - minBody2;

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
      zoneTf: 'current',
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

module.exports = { checkSupplyDemand };