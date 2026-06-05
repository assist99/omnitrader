const crypto = require('crypto');
const ExchangeService = require('../src/engine/services/ExchangeService');

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

  const orderParams = {
          symbol: symbol,
          side: 'sell',
          orderType: 'limit',
          qty: '0.05',
          price: '5000',
          timeInForce: 'GTC',
          reduceOnly: true,
          positionIdx: 0
  }
  // const orderResult = await exchange.exchange.createOrder(
  //   'XAU/USDT:USDT',
  //   'limit',
  //   'sell',
  //   0.05,
  //   5000,
  //   {
  //       reduceOnly: true,
  //       positionIdx: 0
  //   }
  // );
  const orderResult = await exchange.placeOrder(orderParams);
  console.log('Order Result:', orderResult);
  // console.log(await exchange.getPositions('XAU/USDT:USDT'));  
  // console.log(await exchange.getOrderStatus('860bd935-c78a-4383-93bc-4eead85163bd','XAU/USDT:USDT'));
}

main().catch(console.error);