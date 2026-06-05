const crypto = require('crypto');
const ExchangeService = require('../src/engine/services/ExchangeService');
const IndicatorService = require('../src/engine/services/indicatorService');
const CandleUtils = require('../src/engine/utils/candleUtils');
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function encrypt(text, key) {
  const hash = crypto.createHash('sha256').update(key).digest();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, hash, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

async function main() {
  process.env.ENCRYPTION_KEY = 'test-key-for-cli-testing';

  const exchangeName = 'bybit';
  const apiKey = encrypt('Q0IEh5iabcXhQcGQdK', process.env.ENCRYPTION_KEY);
  const apiSecret = encrypt('C9TUtIMlLpS6ho4J6MI1Wtge2ZH9anu2Gwhu', process.env.ENCRYPTION_KEY);
  const isTestnet = false; // livenet

  const exchange = new ExchangeService(exchangeName, apiKey, apiSecret, isTestnet);
  const markets = await exchange.exchange.loadMarkets();

  console.log('=== Testing Bybit ExchangeService (livenet) ===\n');
  const symbol = 'XAU/USDT:USDT';

  const candles = CandleUtils.parseExchangeCandles(await exchange.getCandles(symbol,'m5', 100));  
  console.log('Raw candles (first 5):', JSON.stringify(candles, null, 2));


  const stResult = IndicatorService.checkCondition('supertrend', candles);
  console.log('SuperTrend result:', JSON.stringify(stResult, null, 2));

  const PriceUtils = require('../src/engine/utils/priceUtils');
  const h1Candles = CandleUtils.parseExchangeCandles(await exchange.getCandles(symbol, 'h1', 100));

  const entryPrice = 4481.17;
  const ignoreBoxLower = 0;
  const ignoreBoxUpper = 0;
  const side = 'long';
  const indicatorType = 'supertrend';
  const indicatorParams = { period: 10, multiplier: 3 };

  const slPrice = PriceUtils.calculateSLPrice(entryPrice, ignoreBoxLower, ignoreBoxUpper, side, indicatorType, h1Candles, indicatorParams);
  console.log(`\ncalculateSLPrice result: entry=$${entryPrice}, side=${side}, indicator=${indicatorType}, sl=$${slPrice}`);
}

main().catch(console.error);