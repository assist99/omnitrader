const logger = require('../logger');
const IndicatorService = require('./indicatorService');

class AllAssetsScreenerService {
  static db = null;
  static telegramService = null;
  static lastEWSignals = new Map();

  static setDeps(db, telegramService) {
    this.db = db;
    this.telegramService = telegramService;
  }

  static async processClosedCandle(symbol, timeframe, closedBars) {
    if (closedBars.length < 20) return;

    try {
      await this._computeSuperTrend(symbol, timeframe, closedBars);
      // Defer EWT to avoid blocking the WS message handler
      // EWT is CPU-intensive (zscoreLength=500, multiple passes over all candles)
      setImmediate(() => {
        this._computeEW(symbol, timeframe, closedBars).catch(err => {
          logger.error(`EW computation error for ${symbol} ${timeframe}:`, err.message);
        });
      });
    } catch (error) {
      logger.error(`AllAssetsScreenerService error for ${symbol} ${timeframe}:`, error.message);
    }
  }

  static async _computeSuperTrend(symbol, timeframe, closedBars) {
    const stParams = { period: 10, multiplier: 3 };
    const stResult = IndicatorService.checkCondition('supertrend', closedBars, stParams);

    await this.db.upsertScreenerSnapshot(
      symbol,
      timeframe,
      'supertrend',
      stResult.signal || null
    );
  }

  static async _computeEW(symbol, timeframe, closedBars) {
    if (closedBars.length < 500) return;

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

    const ewResult = IndicatorService.checkCondition('ewt', closedBars, ewParams);

    await this.db.upsertScreenerSnapshot(
      symbol,
      timeframe,
      'ewt',
      ewResult.signal || null
    );

    if (ewResult.signal) {
      const key = `${symbol}:${timeframe}`;
      const lastEWSignal = this.lastEWSignals.get(key);

      if (ewResult.signal !== lastEWSignal) {
        const lastBar = closedBars[closedBars.length - 1];
        const price = lastBar ? lastBar.close : 0;

        await this.telegramService.sendNotification(null, 'screener_reversal', {
          symbol,
          timeframe,
          indicatorType: 'EW',
          signal: ewResult.signal,
          price,
          exchange: 'bybit',
          isTestnet: false
        });

        this.lastEWSignals.set(key, ewResult.signal);
      }
    }
  }

  static async populateInitialSnapshot() {
    if (!this.db) return;

    const { getDatabaseManager } = require('../db');
    const db = getDatabaseManager();

    try {
      const existing = await db.getScreenerSnapshots('supertrend');
      if (existing && existing.length > 0) {
        logger.info('Screener snapshot already populated, skipping initial population');
        return;
      }

      const symbolsConfigPath = require('path').resolve(
        require('../config').getProjectRoot(),
        'config/symbols/bybit.json'
      );
      const symbolsConfig = JSON.parse(require('fs').readFileSync(symbolsConfigPath, 'utf8'));
      const intervals = symbolsConfig.intervals;
      const symbols = symbolsConfig.symbols.map(s => s.symbol);

      logger.info(`Populating initial screener snapshot for ${symbols.length} symbols x ${intervals.length} timeframes...`);

      for (const symbol of symbols) {
        for (const timeframe of intervals) {
          await db.upsertScreenerSnapshot(symbol, timeframe, 'supertrend', null);
          await db.upsertScreenerSnapshot(symbol, timeframe, 'ewt', null);
        }
      }

      logger.info('Initial screener snapshot populated');
    } catch (error) {
      logger.error('Failed to populate initial screener snapshot:', error.message);
    }
  }
}

module.exports = AllAssetsScreenerService;