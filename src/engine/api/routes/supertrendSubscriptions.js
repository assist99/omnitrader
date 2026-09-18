const express = require('express');
const router = express.Router();
const { getDatabaseManager } = require('../../db');
const auth = require('../middleware/auth');
const AllAssetsScreenerService = require('../../services/allAssetsScreenerService');
const path = require('path');
const fs = require('fs');

const TF_ORDER = ['m15', 'h1', 'h4', 'd1', 'w1'];

// Load valid symbols from config
let VALID_SYMBOLS = null;
function getValidSymbols() {
  if (!VALID_SYMBOLS) {
    try {
      const configPath = path.resolve(__dirname, '../../../config/symbols/bybit.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      VALID_SYMBOLS = new Set(config.symbols.map(s => s.symbol));
    } catch (err) {
      console.error('Failed to load symbols config:', err);
      VALID_SYMBOLS = new Set();
    }
  }
  return VALID_SYMBOLS;
}

router.get('/', auth, async (req, res) => {
  try {
    const db = getDatabaseManager();
    const rows = await db.getSupertrendSubscriptionsByUser(req.user.id);
    
    // Convert rows array to nested object format: {symbol: {timeframe: enabled}}
    const subscriptions = {};
    for (const row of rows) {
      if (!subscriptions[row.symbol]) {
        subscriptions[row.symbol] = {};
      }
      subscriptions[row.symbol][row.timeframe] = true;
    }
    
    res.json({ success: true, data: subscriptions });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/', auth, async (req, res) => {
  try {
    const { subscriptions } = req.body || {};
    if (!subscriptions || typeof subscriptions !== 'object') {
      return res.status(400).json({ success: false, error: 'subscriptions must be an object' });
    }
    
    const validSymbols = getValidSymbols();
    
    // Validate and flatten subscriptions
    const flatSubs = [];
    for (const symbol in subscriptions) {
      if (typeof subscriptions[symbol] !== 'object') continue;
      
      // Validate symbol exists in config
      if (!validSymbols.has(symbol)) {
        continue; // Skip invalid symbols silently
      }
      
      for (const timeframe in subscriptions[symbol]) {
        if (!TF_ORDER.includes(timeframe)) continue;
        
        if (subscriptions[symbol][timeframe]) {
          flatSubs.push({ symbol, timeframe });
        }
      }
    }
    
    const db = getDatabaseManager();
    await db.replaceSupertrendSubscriptionsForUser(req.user.id, flatSubs);
    
    // Invalidate cache
    if (AllAssetsScreenerService.invalidateSupertrendSubscribersCache) {
      AllAssetsScreenerService.invalidateSupertrendSubscribersCache();
    }
    
    // Return current state
    const rows = await db.getSupertrendSubscriptionsByUser(req.user.id);
    const result = {};
    for (const row of rows) {
      if (!result[row.symbol]) {
        result[row.symbol] = {};
      }
      result[row.symbol][row.timeframe] = true;
    }
    
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;