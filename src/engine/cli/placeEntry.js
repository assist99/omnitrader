const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const TradingEngine = require('../tradingEngine');
const EntryService = require('../services/entryService');
const CandleUtils = require('../utils/candleUtils');
const logger = require('../logger');

async function main() {
  const setupId = parseInt(process.argv[2], 10);
  const userId = parseInt(process.argv[3], 10);

  if (!setupId || !userId) {
    console.log('Usage: node cli/placeEntry.js <setup_id> <user_id>');
    console.log('');
    console.log('Places entry order for a triggered setup using live Bybit API and database.');
    console.log('');
    console.log('  setup_id  - ID of the triggered setup in trading_setups table');
    console.log('  user_id   - User ID for notification routing');
    process.exit(1);
  }

  console.log(`\n=== Initializing engine for setup #${setupId}, user #${userId} ===`);
  const engine = new TradingEngine();
  await engine.initialize();

  const setup = await engine.db.getSetupById(setupId);
  if (!setup) {
    console.error(`Setup #${setupId} not found in database`);
    await engine.cleanup();
    process.exit(1);
  }
  setup.user_id = userId;

  console.log(`Setup: ${setup.symbol} ${setup.side}, status=${setup.status}, indicator=${setup.entry_indicator_type} (${setup.entry_indicator_tf})`);

  const bybitService = await engine.getBybitService(
    setup.account_id, setup.api_key_enc, setup.api_secret_enc, setup.is_testnet
  );

  console.log(`\nFetching ${setup.entry_indicator_tf} candles for ${setup.symbol}...`);
  const rawCandles = await bybitService.getCandles(setup.symbol, setup.entry_indicator_tf, 100);
  const parsedCandles = CandleUtils.parseBybitCandles(rawCandles);
  const closedBars = CandleUtils.filterClosedBars(parsedCandles, setup.entry_indicator_tf);

  if (closedBars.length === 0) {
    console.error('No closed bars available');
    await engine.cleanup();
    process.exit(1);
  }

  console.log(`\n=== Placing entry order for setup #${setupId} ===`);
  await EntryService.placeEntryOrder(engine, setup, bybitService, closedBars);

  console.log(`\n=== Done. Stats: ${JSON.stringify(engine.stats)} ===`);
  await engine.cleanup();
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});