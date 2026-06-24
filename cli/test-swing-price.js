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
  await exchange.exchange.loadMarkets();

  console.log('=== Comprehensive Swing Price Test ===\n');
  const symbol = 'BTC/USDT:USDT';

  let candles = CandleUtils.parseExchangeCandles(await exchange.getCandles(symbol, 'm15', 100));
  candles = candles.slice(0,candles.length - 1)
  console.log(`Symbol: ${symbol}`);
  console.log(`Candles: ${candles.length} (5-minute intervals)`);
  console.log(`Time range: ${new Date(candles[0].timestamp).toISOString()} to ${new Date(candles[candles.length - 1].timestamp).toISOString()}`);
  console.log(`Price range: $${Math.min(...candles.map(c => c.low)).toFixed(2)} - $${Math.max(...candles.map(c => c.high)).toFixed(2)}`);
  console.log(`Current price: $${candles[candles.length - 1].close.toFixed(2)}`);

  console.log('\n=== Swing Price Results ===\n');

  const indicators = ['supertrend'];
  
  for (const indicatorType of indicators) {
    
    const defaultParams = IndicatorService.getIndicatorParameters(indicatorType);
    console.log({defaultParams})
    let details = '';
    if (indicatorType === 'supertrend') {
      const stCheck = IndicatorService.checkSuperTrend(candles, defaultParams);
      details = `${stCheck.details?.trend || 'no trend'}`;
    }
  }


}

main().catch(console.error);