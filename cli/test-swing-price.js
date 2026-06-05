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
  const symbol = 'XAU/USDT:USDT';

  const candles = CandleUtils.parseExchangeCandles(await exchange.getCandles(symbol, 'm5', 100));
  
  console.log(`Symbol: ${symbol}`);
  console.log(`Candles: ${candles.length} (5-minute intervals)`);
  console.log(`Time range: ${new Date(candles[0].timestamp).toISOString()} to ${new Date(candles[candles.length - 1].timestamp).toISOString()}`);
  console.log(`Price range: $${Math.min(...candles.map(c => c.low)).toFixed(2)} - $${Math.max(...candles.map(c => c.high)).toFixed(2)}`);
  console.log(`Current price: $${candles[candles.length - 1].close.toFixed(2)}`);

  console.log('\n=== Swing Price Results ===\n');

  const indicators = ['macd'];
  
  for (const indicatorType of indicators) {
    console.log(`\n${indicatorType.toUpperCase().padEnd(12)} | LONG SWING      | SHORT SWING     | UNITS  | DETAILS`);
    console.log('-'.repeat(70));
    
    const defaultParams = IndicatorService.getIndicatorParameters(indicatorType);

    const longResult = IndicatorService.getSwingPrice(indicatorType, candles, 'long', defaultParams);
    const shortResult = IndicatorService.getSwingPrice(indicatorType, candles, 'short', defaultParams);

    const longPrice = longResult.price ? `$${longResult.price.toFixed(2)}` : 'N/A';
    const shortPrice = shortResult.price ? `$${shortResult.price.toFixed(2)}` : 'N/A';
    
    let details = '';
    if (indicatorType === 'supertrend') {
      const stCheck = IndicatorService.checkSuperTrend(candles, defaultParams);
      details = `${stCheck.details?.trend || 'no trend'}`;
    } else if (longResult.sectionType) {
      details = `last: ${longResult.sectionType}`;
    }

    console.log(`${''.padEnd(12)} | ${longPrice.padEnd(15)} | ${shortPrice.padEnd(15)} | ${indicatorType === 'macd' ? 'sections' : 'trend'.padEnd(6)} | ${details}`);
    
    if (longResult.error) {
      console.log(`  Error (long): ${longResult.error}`);
    }
    if (shortResult.error) {
      console.log(`  Error (short): ${shortResult.error}`);
    }
  }


}

main().catch(console.error);