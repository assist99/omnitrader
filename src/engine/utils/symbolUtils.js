// Symbol utilities for exchange integration

const logger = require('../logger');

// Normalize symbol to CCXT format (BTC/USDT)
function normalizeSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') {
    return symbol;
  }
  
  // If already in CCXT format, return as is
  if (symbol.includes('/')) {
    return symbol;
  }
  
  // Handle hyphenated symbols first (BTC-USD -> BTC/USD)
  if (symbol.includes('-') && !symbol.includes('/')) {
    const parts = symbol.split('-');
    if (parts.length === 2) {
      return `${parts[0]}/${parts[1]}`;
    }
  }
  
  // Try common conversions
  if (symbol.endsWith('USDT') && !symbol.includes('/') && !symbol.includes('-')) {
    return symbol.replace('USDT', '/USDT');
  }
  
  if (symbol.endsWith('USD') && !symbol.includes('/') && !symbol.includes('-')) {
    return symbol.replace('USD', '/USD');
  }
  
  // If no separator found, return as is (CCXT may handle it)
  return symbol;
}

// Get symbol precision info from CCXT market data
function getSymbolPrecision(marketInfo) {
  if (!marketInfo) {
    return {
      pricePrecision: 2,
      amountPrecision: 4,
      minAmount: 0.001,
      maxAmount: 1000
    };
  }
  
  return {
    pricePrecision: marketInfo.precision?.price || 2,
    amountPrecision: marketInfo.precision?.amount || 4,
    minAmount: marketInfo.limits?.amount?.min || 0.001,
    maxAmount: marketInfo.limits?.amount?.max || 1000,
    minPrice: marketInfo.limits?.price?.min,
    maxPrice: marketInfo.limits?.price?.max,
    minCost: marketInfo.limits?.cost?.min,
    maxCost: marketInfo.limits?.cost?.max
  };
}

// Round price to exchange precision
function roundPrice(price, precision) {
  if (price === null || price === undefined) {
    return price;
  }
  
  const factor = Math.pow(10, precision);
  return Math.round(price * factor) / factor;
}

// Round amount to exchange precision
function roundAmount(amount, precision) {
  if (amount === null || amount === undefined) {
    return amount;
  }
  
  const factor = Math.pow(10, precision);
  return Math.floor(amount * factor) / factor;
}

// Validate symbol for trading
function validateTradingSymbol(symbol, exchangeName, marketInfo) {
  const errors = [];
  
  if (!symbol || symbol.trim() === '') {
    errors.push('Symbol is required');
    return { valid: false, errors };
  }
  
  const normalized = normalizeSymbol(symbol);
  
  // Check format
  if (!normalized.includes('/')) {
    errors.push(`Symbol should be in CCXT format (e.g., BTC/USDT). Got: ${symbol}`);
  }
  
  // Check if market exists
  if (marketInfo) {
    const precision = getSymbolPrecision(marketInfo);
    
    // Check if symbol is active
    if (marketInfo.active === false) {
      errors.push(`Symbol ${symbol} is not active on ${exchangeName}`);
    }
    
    // Check if trading is allowed
    if (marketInfo.info?.status !== 'Trading') {
      errors.push(`Symbol ${symbol} is not available for trading on ${exchangeName}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    normalizedSymbol: normalized
  };
}

// Get common symbols by exchange
function getCommonSymbols(exchangeName) {
  const commonSymbols = {
    bybit: [
      'BTC/USDT',
      'ETH/USDT',
      'SOL/USDT',
      'XRP/USDT',
      'ADA/USDT',
      'DOGE/USDT',
      'DOT/USDT',
      'LINK/USDT',
      'UNI/USDT',
      'MATIC/USDT'
    ],
    hyperliquid: [
      'BTC/USD',
      'ETH/USD',
      'SOL/USD',
      'ARB/USD',
      'OP/USD',
      'SUI/USD',
      'APT/USD',
      'SEI/USD'
    ]
  };
  
  return commonSymbols[exchangeName.toLowerCase()] || [];
}

// Check if symbol is supported by exchange
async function isSymbolSupported(symbol, exchangeService) {
  try {
    const markets = await exchangeService.exchange.fetchMarkets();
    const normalized = normalizeSymbol(symbol);
    const market = markets.find(m => m.symbol === normalized);
    
    return {
      supported: !!market,
      marketInfo: market,
      message: market ? `Symbol ${symbol} is supported` : `Symbol ${symbol} is not supported`
    };
  } catch (error) {
    logger.error(`Error checking symbol support for ${symbol}:`, error);
    return {
      supported: false,
      marketInfo: null,
      message: `Error checking symbol: ${error.message}`
    };
  }
}

module.exports = {
  normalizeSymbol,
  getSymbolPrecision,
  roundPrice,
  roundAmount,
  validateTradingSymbol,
  getCommonSymbols,
  isSymbolSupported
};