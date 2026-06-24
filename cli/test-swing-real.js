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
  const isTestnet = false;

  const exchange = new ExchangeService(exchangeName, apiKey, apiSecret, isTestnet);
  const markets = await exchange.exchange.loadMarkets();

  console.log('=== Testing getSwingPrice Function with Real Data ===\n');
  const symbol = 'BTC/USDT:USDT';

  const candles = CandleUtils.parseExchangeCandles(await exchange.getCandles(symbol, 'm15', 500));
  
  console.log(`Fetched ${candles.length} candles for ${symbol}`);
  console.log(`First: ${new Date(candles[0].timestamp).toISOString()} - $${candles[0].close}`);
  console.log(`Last: ${new Date(candles[candles.length - 1].timestamp).toISOString()} - $${candles[candles.length - 1].close}`);

  console.log('\n=== Testing Swing Price Detection ===\n');

  const indicators = ['macd', 'supertrend', 'ema'];
  
  for (const indicatorType of indicators) {
    console.log(`\n--- Testing ${indicatorType.toUpperCase()} ---`);
    
    const defaultParams = IndicatorService.getIndicatorParameters(indicatorType);
    console.log(`Parameters:`, defaultParams);

    const longResult = IndicatorService.getSwingPrice(indicatorType, candles, 'long', defaultParams);
    console.log(`Long swing price: ${longResult.price ? `$${longResult.price.toFixed(2)}` : 'null'} ${longResult.error ? `(Error: ${longResult.error})` : ''}`);

    const shortResult = IndicatorService.getSwingPrice(indicatorType, candles, 'short', defaultParams);
    console.log(`Short swing price: ${shortResult.price ? `$${shortResult.price.toFixed(2)}` : 'null'} ${shortResult.error ? `(Error: ${shortResult.error})` : ''}`);

    if (indicatorType === 'supertrend') {
      const stCheck = IndicatorService.checkSuperTrend(candles, defaultParams);
      console.log(`SuperTrend status: ${stCheck.signal || 'no signal'}, value: ${stCheck.value?.toFixed(2) || 'N/A'}, price: $${stCheck.price?.toFixed(2) || 'N/A'}`);
    }
  }

  console.log('\n=== Test Complete ===');
}

main().catch(console.error);