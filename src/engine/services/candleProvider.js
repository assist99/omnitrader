const ccxt = require('ccxt');
const logger = require('../logger');
const { getCcxtConfig } = require('../config/exchanges');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

function getCcxtInterval(timeframe) {
  const map = { m1: '1m', m5: '5m', m15: '15m', m30: '30m', h1: '1h', h2: '2h', h4: '4h', d1: '1d' };
  if (!map[timeframe]) throw new Error(`Unsupported timeframe: ${timeframe}`);
  return map[timeframe];
}

function getBybitInterval(timeframe) {
  const map = { m1: '1', m5: '5', m15: '15', m30: '30', h1: '60', h2: '120', h4: '240', d1: 'D' };
  if (!map[timeframe]) throw new Error(`Unsupported timeframe: ${timeframe}`);
  return map[timeframe];
}

function ccxtToBybitSymbol(symbol) {
  return symbol.replace(':USDT', '').replace('/', '');
}

function bybitToCcxtSymbol(bybitSymbol) {
  return bybitSymbol.replace(/([A-Z0-9]+)(USDT)/, '$1/$2:$2');
}

class BybitWS {
  constructor({ symbols, timeframes, onCandle, onError, isTestnet = true }) {
    this.symbols = symbols;
    this.timeframes = timeframes;
    this.onCandle = onCandle;
    this.onError = onError;
    this.isTestnet = isTestnet;

    this.ws = null;
    this.isRunning = false;
    this.retryDelay = 1000;
    this.maxDelay = 30000;
    this.pingInterval = null;
  }

  getUrl() {
    const base = this.isTestnet ? 'stream-testnet.bybit.com' : 'stream.bybit.com';
    return `wss://${base}/v5/public/linear`;
  }

  getTopics() {
    const topics = [];
    for (const symbol of this.symbols) {
      const bybitSymbol = ccxtToBybitSymbol(symbol);
      for (const timeframe of this.timeframes) {
        const interval = getBybitInterval(timeframe);
        topics.push(`kline.${interval}.${bybitSymbol}`);
      }
    }
    return topics;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = this.getUrl();
      this.ws = new WebSocket(url, { handshakeTimeout: 10000 });

      this.ws.on('open', () => {
        logger.info(`Bybit WS connected: ${url}`);
        this.retryDelay = 1000;
        this.startHeartbeat();
        this.subscribe();
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data);
      });

      this.ws.on('error', (err) => {
        logger.error(`Bybit WS error: ${err.message}`);
        if (this.onError) this.onError(err);
      });

      this.ws.on('close', (code, reason) => {
        logger.warn(`Bybit WS closed: code=${code}, reason=${reason}`);
        this.stopHeartbeat();
        if (this.isRunning) {
          this.reconnect();
        }
      });
    });
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.ping();
      }
    }, 15000);
  }

  stopHeartbeat() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  subscribe() {
    const topics = this.getTopics();
    const msg = JSON.stringify({ op: 'subscribe', args: topics });
    this.ws.send(msg);
    logger.info(`Bybit WS subscribed to ${topics.length} topics`);
  }

  handleMessage(data) {
    try {
      const msg = JSON.parse(data.toString());
      this.onMessage(msg);
    } catch (err) {
      logger.error('Failed to parse WS message:', err.message);
    }
  }

  onMessage(msg) {
    if (msg.topic && msg.topic.startsWith('kline.')) {
      if (msg.type === 'snapshot' || msg.type === 'delta') {
        const klines = msg.data;
        if (!Array.isArray(klines)) return;
        for (const k of klines) {
          const raw = [
            parseInt(k.start),
            parseFloat(k.open),
            parseFloat(k.high),
            parseFloat(k.low),
            parseFloat(k.close),
            parseFloat(k.volume)
          ];
          this.onCandle(msg.topic, raw, k.confirm);
        }
      }
    }
  }

  async reconnect() {
    if (!this.isRunning) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(this.retryDelay * 2, this.maxDelay);
    logger.info(`Reconnecting Bybit WS in ${delay}ms...`);
    await new Promise(r => setTimeout(r, delay));
    if (this.isRunning) {
      try {
        await this.connect();
      } catch (err) {
        logger.error('Reconnect failed:', err.message);
        if (this.isRunning) this.reconnect();
      }
    }
  }

  async start() {
    this.isRunning = true;
    await this.connect();
    return new Promise((resolve, reject) => {
      if (!this.isRunning) return reject(new Error('stopped'));
      this._resolution = { resolve, reject };
    });
  }

  async stop() {
    this.isRunning = false;
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (e) {
        // ignore
      }
    }
  }
}

class CandleProvider {
  constructor({ exchange = 'bybit', symbols = [], timeframes = [], limit = 100, onUpdate, onScreenerUpdate, isTestnet = true }) {
    this.exchangeName = exchange.toLowerCase();
    this.symbols = symbols;
    this.timeframes = timeframes;
    this.limit = limit;
    this.onUpdate = onUpdate;
    this.onScreenerUpdate = onScreenerUpdate;
    this.isTestnet = isTestnet;

    this.store = new Map();
    this.currentCandles = new Map();
    this.exchange = null;
    this.isRunning = false;
    this.tasks = [];
    this.wsTimeout = null;
  }

  async start() {
    try {
      const config = getCcxtConfig(this.exchangeName, undefined, undefined, this.isTestnet);
      const ExchangeClass = ccxt[this.exchangeName];
      if (!ExchangeClass) {
        throw new Error(`Unsupported exchange: ${this.exchangeName}`);
      }

      this.exchange = new ExchangeClass(config);

      if (this.exchange.setSandboxMode) {
        this.exchange.setSandboxMode(this.isTestnet);
      }

      await this.filterPerpSymbols();
      await this.fetchHistorical();
      await this.startWebSocket();

      this.isRunning = true;
      const combos = this.symbols.length * this.timeframes.length;
      logger.info(`CandleProvider started: ${this.symbols.length} symbols x ${this.timeframes.length} timeframes (${combos} channels), limit=${this.limit}, testnet=${this.isTestnet}`);
    } catch (error) {
      logger.error('CandleProvider failed to start:', error);
      throw error;
    }
  }

  async filterPerpSymbols() {
    try {
      const markets = await this.exchange.fetchMarkets();
      const validSymbols = new Set();
      for (const market of Object.values(markets)) {
        if (market.type === 'swap' && market.linear === true && market.settle === 'USDT') {
          validSymbols.add(market.symbol);
        }
      }
      const originalCount = this.symbols.length;
      this.symbols = this.symbols.filter(s => validSymbols.has(s));
      if (this.symbols.length < originalCount) {
        const removed = originalCount - this.symbols.length;
        logger.warn(`Filtered out ${removed} non-perp symbols. ${this.symbols.length}/${originalCount} remaining.`);
        logger.warn(`Remaining symbols: ${this.symbols.join(', ')}`);
      }
    } catch (error) {
      logger.error('Failed to filter perp symbols:', error);
    }
  }

  sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  async fetchHistorical() {
    const errors = [];
    for (const symbol of this.symbols) {
      for (const timeframe of this.timeframes) {
        const key = `${symbol}:${timeframe}`;
        try {
          const candles = await this.exchange.fetchOHLCV(symbol, getCcxtInterval(timeframe), undefined, this.limit);
          const ordered = candles.slice(0, candles.length - 1);
          this.store.set(key, ordered);
          const last = ordered[ordered.length - 1];
          this.currentCandles.set(key, last ? [...last] : null);
          await this.sleep(200);
        } catch (error) {
          logger.error(`Historical fetch failed for ${key}:`, error.message);
          console.error(`Historical fetch failed for ${key}:`, error);
          errors.push({ symbol, timeframe, error: error.message });
        }
      }
    }
    if (errors.length > 0) {
      logger.warn(`Historical fetch completed with ${errors.length} errors`);
    }
  }

  async startWebSocket() {
    const ws = new BybitWS({
      symbols: this.symbols,
      timeframes: this.timeframes,
      onCandle: (topic, raw, confirm) => this.handleWsCandle(topic, raw, confirm),
      onError: (err) => logger.error('Bybit WS error:', err.message),
      isTestnet: this.isTestnet,
    });
    this.ws = ws;
    ws.start();
  }

  handleWsCandle(topic, raw,confirm) {
    if (!confirm) return; // Only process confirmed candles
    const parts = topic.split('.');
    const interval = parts[1];
    const bybitSymbol = parts[2];
    const symbol = bybitToCcxtSymbol(bybitSymbol);
    

    const timeframe = this.timeframes.find(tf => getBybitInterval(tf) === interval);
    if (!timeframe) return;

    const key = `${symbol}:${timeframe}`;
    const current = this.currentCandles.get(key);

    if (!current) {
      this.currentCandles.set(key, raw);
      return;
    }
    if (raw[0] > current[0]) {
      const arr = this.store.get(key) || [];
      arr.push(raw);
      while (arr.length > this.limit) arr.shift();
      this.store.set(key, arr);
      this.currentCandles.set(key, raw);
      if (typeof this.onUpdate === 'function') {
        this.onUpdate(symbol, timeframe, current);
      }
      if (typeof this.onScreenerUpdate === 'function') {
        const closedBars = this.getClosedCandles(symbol, timeframe);
        this.onScreenerUpdate(symbol, timeframe, closedBars);
      }
    } else if (raw[0] === current[0]) {
      console.log('not new bar',symbol,timeframe)
      this.currentCandles.set(key, raw);
    }
  }

  getClosedCandles(symbol, timeframe) {
    const key = `${symbol}:${timeframe}`;
    const arr = this.store.get(key);
    return arr ? arr.slice() : [];
  }

  getAllClosedCandles() {
    const result = new Map();
    for (const [key, arr] of this.store.entries()) {
      result.set(key, arr.slice());
    }
    return result;
  }

  async stop() {
    this.isRunning = false;
    if (this.ws) {
      try {
        await this.ws.stop();
      } catch (error) {
        logger.error('Error stopping WS:', error.message);
      }
    }
    if (this.exchange) {
      try {
        await this.exchange.close();
      } catch (error) {
        logger.warn('Error closing exchange:', error.message);
      }
    }
    this.store.clear();
    this.currentCandles.clear();
    this.tasks = [];
    logger.info('CandleProvider stopped');
  }
}

if (require.main === module) {
  const symbolsConfigPath = path.resolve(__dirname, '../../../config/symbols/bybit.json');
  const symbolsConfig = JSON.parse(fs.readFileSync(symbolsConfigPath, 'utf8'));
  const symbols = symbolsConfig.symbols.map(s => s.symbol);
  const provider = new CandleProvider({
    exchange: 'bybit',
    symbols,
    timeframes: symbolsConfig.intervals,
    limit: 100,
    onUpdate: (symbol, timeframe, candle) => {
      console.log(`[CLOSED] ${symbol} ${timeframe} | O:${candle[1]} H:${candle[2]} L:${candle[3]} C:${candle[4]} V:${candle[5]}`);
    },
    isTestnet: false
  });
  provider.start().catch(console.error);
  process.on('SIGINT', () => {
    provider.stop().then(() => process.exit(0)).catch(() => process.exit(1));
  });
}

module.exports = CandleProvider;
