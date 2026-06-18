// Exchange configuration for CCXT integration

const exchanges = {
  bybit: {
    name: 'Bybit',
    ccxtId: 'bybit',
    supportedTypes: ['spot', 'swap', 'future'],
    defaultType: 'swap',
    testnetFlag: 'sandbox',
    testnetUrls: {
      public: 'https://api-testnet.bybit.com',
      private: 'https://api-testnet.bybit.com'
    },
    mainnetUrls: {
      public: 'https://api.bybit.com',
      private: 'https://api.bybit.com'
    },
    symbolFormat: (symbol) => {
      // Convert BTC/USDT to BTCUSDT for Bybit
      return symbol.replace('/', '');
    },
    parseSymbol: (symbol) => {
      // Convert BTCUSDT to BTC/USDT for CCXT
      if (symbol.includes('/')) return symbol;
      if (symbol.endsWith('USDT')) {
        return symbol.replace('USDT', '/USDT');
      }
      return symbol;
    }
  },
  
  hyperliquid: {
    name: 'Hyperliquid',
    ccxtId: 'hyperliquid',
    supportedTypes: ['spot', 'perpetual'],
    defaultType: 'perpetual',
    testnetFlag: 'testnet',
    testnetUrls: {
      public: 'https://api.hyperliquid-testnet.xyz',
      private: 'https://api.hyperliquid-testnet.xyz'
    },
    mainnetUrls: {
      public: 'https://api.hyperliquid.xyz',
      private: 'https://api.hyperliquid.xyz'
    },
    symbolFormat: (symbol) => {
      // Hyperliquid uses BTC-USD format
      if (symbol.includes('/')) {
        return symbol.replace('/', '-');
      }
      return symbol;
    },
    parseSymbol: (symbol) => {
      // Convert BTC-USD to BTC/USD for CCXT
      if (symbol.includes('-')) {
        return symbol.replace('-', '/');
      }
      return symbol;
    }
  }
};

// Get exchange configuration
function getExchangeConfig(exchangeName) {
  const exchange = exchanges[exchangeName.toLowerCase()];
  if (!exchange) {
    throw new Error(`Unsupported exchange: ${exchangeName}`);
  }
  return exchange;
}

// Get all supported exchanges
function getSupportedExchanges() {
  return Object.keys(exchanges);
}

// Validate symbol for exchange
function validateSymbolForExchange(symbol, exchangeName) {
  const config = getExchangeConfig(exchangeName);
  
  // Basic validation
  if (!symbol || typeof symbol !== 'string') {
    return { valid: false, error: 'Invalid symbol format' };
  }
  
  // Check if symbol contains separator
  if (!symbol.includes('/') && !symbol.includes('-')) {
    // Try to infer format
    if (symbol.endsWith('USDT')) {
      return { valid: true, normalized: symbol.replace('USDT', '/USDT') };
    }
  }
  
  return { valid: true, normalized: symbol };
}

// Convert symbol to exchange format
function toExchangeSymbol(symbol, exchangeName) {
  const config = getExchangeConfig(exchangeName);
  return config.symbolFormat(symbol);
}

// Convert symbol from exchange format to CCXT format
function fromExchangeSymbol(symbol, exchangeName) {
  const config = getExchangeConfig(exchangeName);
  return config.parseSymbol(symbol);
}

// Get CCXT configuration for exchange
function getCcxtConfig(exchangeName, apiKey, apiSecret, isTestnet) {
  const config = getExchangeConfig(exchangeName);
  
  const ccxtConfig = exchangeName=='hyperliquid'?{
    apiKey,
    secret: apiSecret,
    enableRateLimit: true,
    privateKey:apiSecret,
    slippage:0.03,
    walletAddress: '0x673236C3e2ca96c6d3cE787C333a43673958Dc7E'
  }:{
    apiKey,
    secret: apiSecret,
    enableRateLimit: true

  };
  
  // Add URLs if exchange-specific
  if (config.testnetUrls || config.mainnetUrls) {
    ccxtConfig.urls = isTestnet ? config.testnetUrls : config.mainnetUrls;
  }
  
  // Add options
  if (config.defaultType) {
    ccxtConfig.options = {
      defaultType: config.defaultType,
    };
  }
  
  return ccxtConfig;
}

// Check if exchange supports symbol type
function supportsSymbolType(exchangeName, symbolType) {
  const config = getExchangeConfig(exchangeName);
  return config.supportedTypes.includes(symbolType);
}

module.exports = {
  exchanges,
  getExchangeConfig,
  getSupportedExchanges,
  validateSymbolForExchange,
  toExchangeSymbol,
  fromExchangeSymbol,
  getCcxtConfig,
  supportsSymbolType
};