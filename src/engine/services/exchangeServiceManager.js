const ExchangeService = require('./ExchangeService');
const logger = require('../logger');

const cache = new Map();

function getCacheKey(accountId, exchange, isTestnet) {
  return `${accountId}_${exchange}_${isTestnet ? 'test' : 'main'}`;
}

async function getOrCreate(accountId, exchange, apiKeyEnc, apiSecretEnc, isTestnet) {
  const key = getCacheKey(accountId, exchange, isTestnet);

  if (cache.has(key)) {
    return cache.get(key);
  }

  logger.info(`Creating new ExchangeService for ${exchange} account #${accountId} (${isTestnet ? 'testnet' : 'mainnet'})`);
  const service = new ExchangeService(exchange, apiKeyEnc, apiSecretEnc, isTestnet);

  try {
    await service.exchange.fetchMarkets();
    logger.info(`Markets loaded for ${exchange} account #${accountId}`);
  } catch (error) {
    logger.error(`Failed to load markets for ${exchange} account #${accountId}: ${error.message}`);
    throw error;
  }

  cache.set(key, service);
  return service;
}

function getOrCreateFromSetup(setup) {
  return getOrCreate(
    setup.exchange_account_id,
    setup.exchange,
    setup.api_key_enc,
    setup.api_secret_enc,
    setup.is_testnet
  );
}

async function initialize(db) {
  logger.info('Pre-loading exchange accounts from database...');
  let loaded = 0;
  let failed = 0;

  try {
    const accounts = await db.all('SELECT * FROM exchange_accounts');
    logger.info(`Found ${accounts.length} exchange accounts to pre-load`);

    for (const account of accounts) {
      try {
        await getOrCreate(
          account.id,
          account.exchange,
          account.api_key_enc,
          account.api_secret_enc,
          !!account.is_testnet
        );
        loaded++;
      } catch (error) {
        failed++;
        logger.error(`Failed to pre-load exchange account #${account.id} (${account.exchange}): ${error.message}`);
      }
    }

    logger.info(`Exchange account pre-load complete: ${loaded} loaded, ${failed} failed`);
  } catch (error) {
    logger.error(`Failed to query exchange accounts for pre-load: ${error.message}`);
  }
}

function clear() {
  logger.info(`Clearing ${cache.size} cached ExchangeService instances`);
  cache.clear();
}

function size() {
  return cache.size;
}

module.exports = {
  getOrCreate,
  getOrCreateFromSetup,
  initialize,
  clear,
  size
};