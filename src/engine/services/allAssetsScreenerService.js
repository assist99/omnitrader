const logger = require('../logger');
const IndicatorService = require('./indicatorService');
const CandleUtils = require('../utils/candleUtils');
const { _calculateSuperTrendAligned } = require('./indicators/helpers');

class AllAssetsScreenerService {
  static db = null;
  static telegramService = null;
  static lastEWSignals = new Map();
  static lastSTWritten = new Map();
  static ewSubscribersCache = null;
  static ewSubscribersCacheTs = 0;
  static EW_SUBSCRIBERS_CACHE_MS = 30 * 1000;

  static setDeps(db, telegramService) {
    this.db = db;
    this.telegramService = telegramService;
    this.ewSubscribersCache = null;
    this.ewSubscribersCacheTs = 0;
  }

  static _stMinTimeframes = new Set(['m15', 'm30', 'h1', 'h2', 'h4', 'd1', 'w1']);

  static async processClosedCandle(symbol, timeframe, closedBars) {
    if (closedBars.length < 20) return;

    const parsedBars = CandleUtils.parseExchangeCandles(closedBars);
    if (parsedBars.length < 20) return;

    try {
      if (this._stMinTimeframes.has(timeframe)) {
        await this._updateSTDirection(symbol, timeframe, parsedBars);
      }
      setImmediate(() => {
        this._computeEW(symbol, timeframe, parsedBars).catch(err => {
          logger.error(`EW computation error for ${symbol} ${timeframe}:`, err.message);
        });
      });
    } catch (error) {
      logger.error(`AllAssetsScreenerService error for ${symbol} ${timeframe}:`, error.message);
    }
  }

  static async _getSubscribersForTimeframe(timeframe) {
    if (!this.db) return { userIds: [], hasAnySubscriptions: false };
    const now = Date.now();
    if (!this.ewSubscribersCache || now - this.ewSubscribersCacheTs > this.EW_SUBSCRIBERS_CACHE_MS) {
      try {
        const rows = await this.db.getEnabledEwSubscribers();
        this.ewSubscribersCache = rows;
        this.ewSubscribersCacheTs = now;
      } catch (err) {
        logger.error('Failed to load EW subscribers:', err.message);
        return { userIds: [], hasAnySubscriptions: false };
      }
    }
    const userIds = new Set();
    let hasAny = false;
    for (const row of this.ewSubscribersCache) {
      hasAny = true;
      if (row.timeframe === timeframe) userIds.add(row.user_id);
    }
    return { userIds: Array.from(userIds), hasAnySubscriptions: hasAny };
  }

  static async _updateSTDirection(symbol, timeframe, bars) {
    const highs = bars.map(c => c.high);
    const lows = bars.map(c => c.low);
    const closes = bars.map(c => c.close);

    const { direction } = _calculateSuperTrendAligned(highs, lows, closes, 10, 3);
    let lastDir = 0;
    for (let i = direction.length - 1; i >= 0; i--) {
      if (direction[i] !== 0) { lastDir = direction[i]; break; }
    }
    const trend = lastDir === -1 ? 'bullish' : lastDir === 1 ? 'bearish' : null;

    const key = `${symbol}:${timeframe}`;
    const lastWritten = this.lastSTWritten.get(key);

    if (trend !== lastWritten) {
      await this.db.upsertScreenerSnapshot(symbol, timeframe, 'supertrend', trend);
      this.lastSTWritten.set(key, trend);
    }
  }

  static async _computeEW(symbol, timeframe, bars) {
    if (bars.length < 500) return;

    const ewParams = {
      barsPerHour: 4,
      barsPerHour2: 16,
      macroAtrLen: 10,
      macroMult: 3.0,
      localAtrLen: 10,
      localMult: 3.0,
      zscoreLength: 500,
      zscoreMin: 1.8,
      zscoreMax: 10.0,
      useWickFilter: true,
      maxWickRatio: 0.3,
      maxLegsAllowed: 5,
      useExtFilter: true,
      extMultiplier: 1.27,
      tradeMode: 'First Change Only'
    };

    const ewResult = IndicatorService.checkCondition('ewt', bars, ewParams);

    if (ewResult.signal && ewResult.signal !== 'none' && ewResult.met === true) {
      await this.db.upsertScreenerSnapshot(
        symbol,
        timeframe,
        'ewt',
        ewResult.signal
      );

      const key = `${symbol}:${timeframe}`;
      const lastEWSignal = this.lastEWSignals.get(key);

      if (ewResult.signal !== lastEWSignal) {
        const lastBar = bars[bars.length - 1];
        const price = lastBar ? lastBar.close : 0;
        const timestamp = lastBar && lastBar.timestamp ? lastBar.timestamp : new Date().toISOString();

        const { userIds: subscribers, hasAnySubscriptions } = await this._getSubscribersForTimeframe(timeframe);
        const payload = {
          symbol,
          timeframe,
          indicatorType: 'EW',
          signal: ewResult.signal,
          price,
          exchange: 'bybit',
          isTestnet: false,
          timestamp,
        };

        if (subscribers.length > 0) {
          for (const userId of subscribers) {
            await this.telegramService.sendNotification(userId, 'screener_reversal', payload);
          }
        } else if (!hasAnySubscriptions) {
          await this.telegramService.sendNotification(null, 'screener_reversal', payload);
        }

        this.lastEWSignals.set(key, ewResult.signal);
      }
    }
  }

  static async populateInitialSnapshot(candleProvider) {
    const allCandles = candleProvider.getAllClosedCandles();
    let count = 0;

    for (const [key, candles] of allCandles.entries()) {
      if (candles.length < 20) continue;
      const parsed = CandleUtils.parseExchangeCandles(candles);
      if (parsed.length < 20) continue;

      const colonIdx = key.lastIndexOf(':');
      const symbol = key.slice(0, colonIdx);
      const timeframe = key.slice(colonIdx + 1);

      await this._updateSTDirection(symbol, timeframe, parsed);
      count++;
    }

    logger.info(`Initialized SuperTrend directions for ${count} symbol/timeframe combinations`);

    await this._populateEWNulls();
  }

  static async _populateEWNulls() {
    if (!this.db) return;

    try {
      const existing = await this.db.getScreenerSnapshots('ewt');
      if (existing && existing.length > 0) {
        logger.info('EW snapshot already populated, skipping');
        return;
      }

      const path = require('path');
      const fs = require('fs');
      const { getProjectRoot } = require('../config');
      const symbolsConfigPath = path.resolve(getProjectRoot(), 'config/symbols/bybit.json');
      const symbolsConfig = JSON.parse(fs.readFileSync(symbolsConfigPath, 'utf8'));
      const intervals = symbolsConfig.intervals;
      const symbols = symbolsConfig.symbols.map(s => s.symbol);

      logger.info(`Populating initial EW snapshot for ${symbols.length} symbols x ${intervals.length} timeframes...`);

      for (const symbol of symbols) {
        for (const timeframe of intervals) {
          await this.db.upsertScreenerSnapshot(symbol, timeframe, 'ewt', null);
        }
      }

      logger.info('Initial EW snapshot populated');
    } catch (error) {
      logger.error('Failed to populate initial EW snapshot:', error.message);
    }
  }
}

module.exports = AllAssetsScreenerService;