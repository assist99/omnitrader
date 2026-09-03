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

  static async processClosedCandle(symbol, timeframe, closedBars) {
    if (!this.db || !this.telegramService) return;
    if (!Array.isArray(closedBars) || closedBars.length < 2) return;

    const prev = closedBars[closedBars.length - 2];
    const curr = closedBars[closedBars.length - 1];
    if (!prev || !curr) return;
    if (typeof prev.close !== 'number' || typeof curr.close !== 'number') return;

    const alarms = await this._getAlarmsForSymbolTimeframe(symbol, timeframe);
    if (!alarms || alarms.length === 0) return;

    for (const alarm of alarms) {
      const crossed = alarm.direction === 'cross_above'
        ? (prev.close <= alarm.price_level && curr.close > alarm.price_level)
        : (prev.close >= alarm.price_level && curr.close < alarm.price_level);

      if (!crossed) continue;

      try {
        await this.telegramService.sendNotification(alarm.user_id, 'price_alarm', {
          symbol,
          timeframe,
          direction: alarm.direction,
          price_level: alarm.price_level,
          close: curr.close,
          timestamp: curr.timestamp || new Date().toISOString(),
        });

        await this.db.deletePriceAlarm(alarm.id, alarm.user_id);
        this.cache.delete(`${symbol}:${timeframe}`);
        logger.info(`Price alarm fired and deleted: ${symbol} ${timeframe} ${alarm.direction} ${alarm.price_level} (user ${alarm.user_id})`);
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