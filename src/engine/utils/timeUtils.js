const logger = require('../logger');

class TimeUtils {
static timeframeToMinutes(tf) {
    const tfMap = {
      'm1': 1,
      'm5': 5,
      'm15': 15,
      'm30': 30,
      'h1': 60,
      'h2': 120,
      'h4': 240,
      'd1': 1440
    };

    const minutes = tfMap[tf];
    if (!minutes) {
      throw new Error(`Invalid timeframe: ${tf}`);
    }

    return minutes;
  }

static isTriggerTime(timeframe) {
    try {
      const minutes = this.timeframeToMinutes(timeframe);
      const now = new Date();
      const currentMinute = now.getUTCMinutes();
      const currentSeconds = now.getUTCSeconds();

      if (minutes === 1) {
        return currentSeconds < 5;
      }

      return currentMinute % minutes === 0 && currentSeconds < 5;
    } catch (error) {
      logger.error(`Error checking trigger time for timeframe ${timeframe}:`, error);
      return false;
    }
  }

static getNextScheduleTime() {
    const now = new Date();
    const nextTime = new Date(now);
    nextTime.setUTCSeconds(0);
    nextTime.setUTCMilliseconds(0);
    nextTime.setUTCMinutes(now.getUTCMinutes() + 1);

    return nextTime;
  }

  static getSchedulePattern() {
    return '* * * * *';
  }

  static getCurrentUTCTimestamp() {
    return new Date().toISOString();
  }

  static formatUTCDate(date) {
    return date.toISOString().replace('T', ' ').substring(0, 19);
  }

  static getSchedulePattern() {
    // Returns cron pattern for 15-minute intervals: 0,15,30,45 * * * *
    return '0,15,30,45 * * * *';
  }

  static isWithinIgnoreBox(price, lower, upper) {
    if (lower > 0 && price <= lower) {
      return { within: false, reason: `Price ${price} ≤ ignore box lower ${lower}` };
    }
    
    if (upper > 0 && price >= upper) {
      return { within: false, reason: `Price ${price} ≥ ignore box upper ${upper}` };
    }
    
    return { within: true, reason: '' };
  }

  static shouldActivate(side, lastCandle, activationPrice) {
    if (activationPrice <= 0) {
      return { shouldActivate: true, reason: 'Auto-trigger (no activation price)' };
    }
    
    if (side === 'long') {
      if (lastCandle.low <= activationPrice) {
        return { shouldActivate: true, reason: `Long: last low ${lastCandle.low} ≤ activation ${activationPrice}` };
      }
    } else if (side === 'short') {
      if (lastCandle.high >= activationPrice) {
        return { shouldActivate: true, reason: `Short: last high ${lastCandle.high} ≥ activation ${activationPrice}` };
      }
    }
    
    return { shouldActivate: false, reason: 'Activation price not reached' };
  }

  static calculateTimeframeStart(timeframe, count = 100) {
    const minutes = this.timeframeToMinutes(timeframe);
    const now = new Date();
    const startTime = new Date(now);
    startTime.setUTCMinutes(now.getUTCMinutes() - (minutes * count));
    return Math.floor(startTime.getTime() / 1000);
  }
}

module.exports = TimeUtils;