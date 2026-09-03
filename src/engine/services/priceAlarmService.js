const logger = require('../logger');

class PriceAlarmService {
  static db = null;
  static telegramService = null;
  static cache = new Map();
  static CACHE_TTL_MS = 60 * 1000;
  static lastTelegramWarnAt = 0;
  static WARN_INTERVAL_MS = 60 * 1000;

  static setDeps(db, telegramService) {
    this.db = db;
    this.telegramService = telegramService;
  }

  static _extractClose(candle) {
    if (candle == null) return null;
    if (typeof candle === 'object' && !Array.isArray(candle)) {
      const n = parseFloat(candle.close);
      return Number.isFinite(n) ? n : null;
    }
    if (Array.isArray(candle) && candle.length >= 5) {
      const n = parseFloat(candle[4]);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  static _extractTimestamp(candle) {
    if (candle == null) return new Date().toISOString();
    if (typeof candle === 'object' && !Array.isArray(candle)) {
      return candle.timestamp ? new Date(candle.timestamp).toISOString() : new Date().toISOString();
    }
    if (Array.isArray(candle) && candle.length >= 1) {
      return new Date(parseInt(candle[0])).toISOString();
    }
    return new Date().toISOString();
  }

  static async processClosedCandle(symbol, timeframe, closedBars) {
    if (!this.db || !this.telegramService) return;
    if (!Array.isArray(closedBars) || closedBars.length < 1) return;

    const curr = closedBars[closedBars.length - 1];
    if (!curr) return;

    const currClose = this._extractClose(curr);
    if (currClose === null) {
      logger.warn(`PriceAlarmService ${symbol} ${timeframe}: invalid close value curr=${currClose}`);
      return;
    }

    const alarms = await this._getAlarmsForSymbolTimeframe(symbol, timeframe);
    if (!alarms || alarms.length === 0) return;

    for (const alarm of alarms) {
      const level = Number(alarm.price_level);
      if (!Number.isFinite(level)) continue;

      let crossed = false;
      if (alarm.direction === 'cross_above') {
        crossed = currClose > level;
      } else if (alarm.direction === 'cross_below') {
        crossed = currClose < level;
      }

      logger.info(
        `PriceAlarm check ${symbol} ${timeframe} dir=${alarm.direction} level=${level} ` +
        `currClose=${currClose} crossed=${crossed} (alarm ${alarm.id}, user ${alarm.user_id})`
      );

      if (!crossed) continue;

      try {
        await this.telegramService.sendNotification(alarm.user_id, 'price_alarm', {
          symbol,
          timeframe,
          direction: alarm.direction,
          price_level: level,
          close: currClose,
          timestamp: this._extractTimestamp(curr),
        });

        await this.db.deletePriceAlarm(alarm.id, alarm.user_id);
        this.cache.delete(`${symbol}:${timeframe}`);
        logger.info(`Price alarm fired and deleted: ${symbol} ${timeframe} ${alarm.direction} ${level} (user ${alarm.user_id})`);
      } catch (err) {
        logger.error(`Failed to handle price alarm ${alarm.id}:`, err.message);
      }
    }
  }

  static async _getAlarmsForSymbolTimeframe(symbol, timeframe) {
    const key = `${symbol}:${timeframe}`;
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && now - cached.ts < this.CACHE_TTL_MS) {
      return cached.rows;
    }
    try {
      const all = await this.db.getActivePriceAlarms();
      const filtered = all.filter(a => a.symbol === symbol && a.timeframe === timeframe);
      this.cache.set(key, { ts: now, rows: filtered });
      logger.debug(`PriceAlarmService loaded ${filtered.length} alarm(s) for ${symbol} ${timeframe}`);
      return filtered;
    } catch (err) {
      logger.error('PriceAlarmService failed to load alarms:', err.message);
      return [];
    }
  }

  static invalidateCache() {
    this.cache.clear();
  }
}

module.exports = PriceAlarmService;