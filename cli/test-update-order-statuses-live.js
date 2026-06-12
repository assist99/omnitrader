const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../src/engine/.env') });

const Database = require('../src/engine/db/database');
const PriceUtils = require('../src/engine/utils/priceUtils');
const ActiveSetupService = require('../src/engine/services/activeSetupService');
const ExchangeService = require('../src/engine/services/ExchangeService');
const TelegramService = require('../src/engine/services/telegramService');

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

class MockTelegramService {
  async sendNotification(userId, type, data) {
    console.log(`[TELEGRAM] ${type} for user ${userId}:`, JSON.stringify(data, null, 2));
  }
}

async function main() {
  process.env.ENCRYPTION_KEY = 'bybitsecret';

  const db = new Database();
  await db.connect();

  const exchangeName = 'bybit';
  const apiKey = encrypt('Q0IEh5iabcXhQcGQdK', process.env.ENCRYPTION_KEY);
  const apiSecret = encrypt('C9TUtIMlLpS6ho4J6MI1Wtge2ZH9anu2Gwhu', process.env.ENCRYPTION_KEY);
  const isTestnet = false;

  const exchange = new ExchangeService(exchangeName, apiKey, apiSecret, isTestnet);
  const telegramService = new MockTelegramService();

  const setup = await db.get(`SELECT * FROM trading_setups WHERE id = 33`);
  if (!setup) {
    console.error('Setup #33 not found in database');
    process.exit(1);
  }

  console.log('=== Live Test: updateOrderStatuses for Setup #33 ===\n');
  console.log(`Found setup #33: ${setup.symbol} ${setup.side} | status: ${setup.status}`);
  console.log(`  entry_price: ${setup.entry_price}, entry_qty: ${setup.entry_qty}`);

  const orders = await db.all(`SELECT * FROM orders WHERE setup_id = 33 ORDER BY id`);
  console.log(`\nOrders for setup #33 (${orders.length}):`);
  for (const order of orders) {
    console.log(`  [${order.order_type}] id=${order.id} status=${order.status} exchange_id=${order.exchange_order_id} price=${order.price}`);
  }

  const ctx = {
    db,
    telegramService,
    getExchangeService: async () => exchange
  };

  console.log('\n--- Calling updateOrderStatuses ---\n');

  await ActiveSetupService.updateOrderStatuses(ctx, setup, exchange);

  console.log('\n--- Orders after updateOrderStatuses ---');
  const updatedOrders = await db.all(`SELECT * FROM orders WHERE setup_id = 33 ORDER BY id`);
  for (const order of updatedOrders) {
    console.log(`  [${order.order_type}] id=${order.id} status=${order.status} exchange_id=${order.exchange_order_id}`);
  }

  const updatedSetup = await db.get(`SELECT * FROM trading_setups WHERE id = 33`);
  console.log(`\nSetup #33 status after: ${updatedSetup.status}`);
  if (updatedSetup.profit !== undefined) {
    console.log(`Setup #33 profit: ${updatedSetup.profit}`);
  }

  await db.disconnect();
  console.log('\n=== Test Complete ===');
}

main().catch((err) => {
  console.error('\n=== Test Failed ===');
  console.error(err);
  process.exit(1);
});
