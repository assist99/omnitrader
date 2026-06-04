const ccxt = require('ccxt');
const logger = require('../logger');
const Encryption = require('../utils/encryption');
const { getCcxtConfig } = require('../config/exchanges');

class ExchangeService {
  constructor(exchangeName, apiKeyEnc, apiSecretEnc, isTestnet = true) {
    this.exchangeName = exchangeName.toLowerCase();
    this.apiKey = apiKeyEnc ? Encryption.decrypt(apiKeyEnc).trim() : null;
    this.apiSecret = apiSecretEnc ? Encryption.decrypt(apiSecretEnc).trim() : null;
    this.isTestnet = isTestnet;
    
    // Log for debugging
    logger.info(`ExchangeService initialized for ${this.exchangeName} - key_len=${this.apiKey?.length || 0}, secret_len=${this.apiSecret?.length || 0}, testnet=${isTestnet}`);
    
    // Validate credentials are available
    if (!this.apiKey || !this.apiSecret) {
      logger.warn(`ExchangeService initialized with incomplete credentials for ${this.exchangeName} - key=${!!this.apiKey}, secret=${!!this.apiSecret}`);
    }
    
    // Initialize CCXT exchange instance
    const exchangeClass = ccxt[this.exchangeName];
    if (!exchangeClass) {
      throw new Error(`Unsupported exchange: ${this.exchangeName}`);
    }
    
    // Get CCXT configuration
    const config = getCcxtConfig(this.exchangeName, this.apiKey, this.apiSecret, this.isTestnet);
    
    this.exchange = new exchangeClass(config);
    
    // Set testnet/sandbox mode if supported
    if (this.exchange.setSandboxMode) {
      this.exchange.setSandboxMode(isTestnet);
    }
    
    this.symbolInfoCache = new Map();
  }
  
  // Get symbol info (cached)
async getSymbolInfo(symbol) {
    const normalizedSymbol = symbol;
    const exchangeSymbol = symbol;

    if (this.symbolInfoCache.has(normalizedSymbol)) {
      return this.symbolInfoCache.get(normalizedSymbol);
    }
    
    try {
      const markets = await this.exchange.fetchMarkets();
      const market = markets.find(m => m.symbol === symbol);
      
      if (market) {
        const info = {
          symbol: market.symbol,
          minOrderQty: market.limits?.amount?.min,
          maxOrderQty: market.limits?.amount?.max,
          qtyStep: market.precision?.amount,
          priceScale: market.precision?.price,
          tickSize: market.precision?.price,
          contractType: market.type,
          active: market.active,
          trading: market.info?.status === 'Trading',
        };
        this.symbolInfoCache.set(normalizedSymbol, info);
        return info;
      }
      
      throw new Error(`No market info for ${symbol} (exchange: ${exchangeSymbol}, normalized: ${normalizedSymbol}) on ${this.exchangeName}`);
    } catch (error) {
      logger.apiError('getSymbolInfo', error);
      throw error;
    }
  }
  
  // Get candles/OHLCV data
  async getCandles(symbol, timeframe, limit = 100) {
    try {
      const candles = await this.exchange.fetchOHLCV(symbol, this.timeframeToInterval(timeframe), undefined, limit);
      // Convert to format expected by existing code
      const formattedCandles = candles.map(candle => [
        candle[0].toString(), // timestamp
        candle[1].toString(), // open
        candle[2].toString(), // high
        candle[3].toString(), // low
        candle[4].toString(), // close
        candle[5].toString(), // volume
      ]);
      
      logger.info(`Fetched ${formattedCandles.length} candles for ${symbol} (${symbol}) ${timeframe} on ${this.exchangeName}`);
      return formattedCandles.reverse(); // Oldest to newest
    } catch (error) {
      logger.apiError('getCandles', error);
      throw error;
    }
  }
  
  // Get ticker data
  async getTicker(symbol) {
    try {
      const ticker = await this.exchange.fetchTicker(symbol);
      return {
        symbol: ticker.symbol,
        lastPrice: ticker.last.toString(),
        bidPrice: ticker.bid.toString(),
        askPrice: ticker.ask.toString(),
        volume: ticker.baseVolume.toString(),
        quoteVolume: ticker.quoteVolume.toString(),
        high24h: ticker.high.toString(),
        low24h: ticker.low.toString(),
        change24h: ticker.percentage.toString(),
      };
    } catch (error) {
      logger.apiError('getTicker', error);
      throw error;
    }
  }
  
  // Get account balance
  async getAccountBalance() {
    try {
      const balance = await this.exchange.fetchBalance();
      
      // Find USDT balance
      const usdtBalance = balance.total?.USDT || balance.total?.usdt || 0;
      return parseFloat(usdtBalance);
    } catch (error) {
      logger.apiError('getAccountBalance', error);
      throw error;
    }
  }
  
  // Place an order
  async placeOrder(orderParams) {
    try {
      const symbol = orderParams.symbol;
      const normalizedSymbol = symbol;
      const exchangeSymbol = symbol;
      
      // Convert order parameters to CCXT format
      const params = {
        symbol: orderParams.symbol,
        type: orderParams.orderType.toLowerCase(),
        side: orderParams.side.toLowerCase(),
        amount: parseFloat(orderParams.qty),
      };
      
      // Include price for limit orders
      if (orderParams.orderType.toLowerCase() === 'limit' && orderParams.price) {
        params.price = parseFloat(orderParams.price);
      }
      
      // Include additional parameters
      if (orderParams.timeInForce) {
        params.timeInForce = orderParams.timeInForce;
      }
      
      // Trigger price for conditional orders
      if (orderParams.triggerPrice !== undefined && orderParams.triggerPrice !== null) {
        params.triggerPrice = parseFloat(orderParams.triggerPrice);
      }
      
      // Reduce only flag
      if (orderParams.reduceOnly === true) {
        params.reduceOnly = true;
      }
      
      logger.info(`Placing ${this.exchangeName} order: ${JSON.stringify(params)}`);
      
      const order = await this.exchange.createOrder(
        params.symbol,
        params.type,
        params.side,
        params.amount,
        params.price,
        params
      );
      
      logger.info(`Order placed on ${this.exchangeName}: ${order.id} for ${order.symbol} (${normalizedSymbol})`);
      
      return {
        orderId: order.id,
        symbol: order.symbol,
        side: order.side,
        orderType: order.type,
        price: order.price,
        qty: order.amount,
        status: order.status || 'pending',
      };
    } catch (error) {
      logger.apiError('placeOrder', error);
      throw error;
    }
  }
  
  // Get order status
  async getOrderStatus(orderId, symbol) {
    try {
      const order = await this.exchange.fetchOrder(orderId, symbol);
      return order;
    } catch (error) {
      // Order might not exist
      if (error instanceof ccxt.OrderNotFound) {
        return null;
      }
      logger.apiError('getOrderStatus', error);
      throw error;
    }
  }
  
  // Cancel order
  async cancelOrder(orderId, symbol) {
    try {
      const result = await this.exchange.cancelOrder(orderId, symbol);
      logger.info(`Order cancelled on ${this.exchangeName}: ${orderId} for ${symbol}`);
      return true;
    } catch (error) {
      logger.apiError('cancelOrder', error);
      throw error;
    }
  }
  
  // Get positions
  async getPositions(symbol = undefined) {
    try {
      let positions;
      
      if (symbol) {
        positions = await this.exchange.fetchPositions([symbol]);
      } else {
        positions = await this.exchange.fetchPositions();
      }
      
      // Convert to consistent format
      return positions.map(pos => ({
        symbol: pos.symbol,
        side: pos.side,
        size: parseFloat(pos.contracts || pos.amount || 0),
        entryPrice: parseFloat(pos.entryPrice || 0),
        markPrice: parseFloat(pos.markPrice || 0),
        liqPrice: parseFloat(pos.liquidationPrice || 0),
        unrealisedPnl: parseFloat(pos.unrealizedPnl || 0),
        realisedPnl: parseFloat(pos.realizedPnl || 0),
        leverage: parseFloat(pos.leverage || 1),
      }));
    } catch (error) {
      logger.apiError('getPositions', error);
      throw error;
    }
  }
  
  // Close position (market order in opposite direction)
  async closePosition(symbol, side) {
    try {
      // Get current position
      const positions = await this.getPositions(symbol);
      const position = positions.find(p => {
        // Compare normalized symbols
        return p.symbol === symbol && Math.abs(p.size) > 0;
      });
      
      if (!position) {
        throw new Error(`No open position found for ${symbol} (${symbol})`);
      }
      
      // Determine close side (opposite of current position)
      const closeSide = position.side.toLowerCase() === 'long' ? 'sell' : 'buy';
      const closeAmount = Math.abs(position.size);
      
      // Place market order to close
      const params = {
        symbol: symbol,
        orderType: 'market',
        side: closeSide,
        qty: closeAmount.toString(),
        reduceOnly: true,
      };
      
      const result = await this.placeOrder(params);
      
      logger.info(`Position closed on ${this.exchangeName}: ${symbol} at ${result.price}`);
      return result;
    } catch (error) {
      logger.apiError('closePosition', error);
      throw error;
    }
  }
  
  // Convert timeframe to CCXT format
  timeframeToInterval(timeframe) {
    const intervalMap = {
      'm1': '1m',
      'm5': '5m',
      'm15': '15m',
      'm30': '30m',
      'h1': '1h',
      'h2': '2h',
      'h4': '4h',
      'd1': '1d',
    };
    
    const interval = intervalMap[timeframe];
    if (!interval) {
      throw new Error(`Unsupported timeframe: ${timeframe}`);
    }
    
    return interval;
  }
  
  // Validate credentials by making a simple API call
  async validateCredentials() {
    try {
      if (!this.apiKey || !this.apiSecret) {
        throw new Error(`${this.exchangeName} API credentials not available`);
      }
      
      // Try to fetch account balance as validation
      await this.getAccountBalance();
      logger.info(`${this.exchangeName} credentials validated successfully`);
      return true;
    } catch (error) {
      logger.error(`${this.exchangeName} credentials validation failed:`, error);
      throw error;
    }
  }
  
  // Test connectivity
  async testConnectivity() {
    try {
      await this.exchange.fetchTime();
      return true;
    } catch (error) {
      logger.error(`${this.exchangeName} connectivity test failed:`, error);
      return false;
    }
  }
}

module.exports = ExchangeService;