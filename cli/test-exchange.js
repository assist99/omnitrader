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

  console.log('=== Testing Bybit ExchangeService (livenet) ===\n');

  // Test 1: Get candles (using BTC/USDT as XAG/USDT may not exist)
  console.log('1. Testing get candles for XAG/USDT, timeframe 5m...');
  try {
    const symbol = 'XAG/USDT:USDT';
    const timeframe = '5m';
    const candles = await exchange.getCandles(symbol, timeframe, 10);
    console.log('Candles result (first 3):', candles.slice(0, 3));
  } catch (error) {
    console.error('Get candles error:', error.message);
  }

  console.log('\n---\n');

  // Test 2: Get account balance
  console.log('2. Testing get account balance...');
  try {
    const balance = await exchange.getAccountBalance();
    console.log('Account balance (USDT):', balance);
  } catch (error) {
    console.error('Get account balance error:', error.message);
  }
}

main().catch(console.error);