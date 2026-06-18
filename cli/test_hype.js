const crypto = require('crypto');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
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

  const exchangeName = 'hyperliquid';
  const apiKey = encrypt('0x1697459cd51ff8E967d4D07C7A87519538Ad56ac', process.env.ENCRYPTION_KEY);
  const apiSecret = encrypt('0xa4a7cc8f5e5f7589f9cc38cbb110ed838f21299d3cda84c1f6f5f8cea283f7ff', process.env.ENCRYPTION_KEY);
  const isTestnet = false;

  const exchange = new ExchangeService(exchangeName, apiKey, apiSecret, isTestnet);

  const symbol = 'AVAX/USDC:USDC';


      console.log(await exchange.placeOrder({
        symbol,
        side: 'sell',
        orderType: 'STOP_MARKET',
        qty: 3,
        triggerPrice: 6.190,
        price: 6.190,
        triggerDirection: 'ascending',
        triggerBy: 'MarkPrice'
      }));

// console.log(await exchange.cancelOrder('473211657111',symbol))
// console.log(await exchange.getOrderStatus('473211657111',symbol))

  
}

main().catch(console.error);