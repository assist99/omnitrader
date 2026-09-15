const express = require('express');
const router = express.Router();
const { getDatabaseManager } = require('../../db');
const auth = require('../middleware/auth');
const AllAssetsScreenerService = require('../../services/allAssetsScreenerService');

const TF_ORDER = ['m5', 'm15', 'h1', 'h4', 'd1', 'w1'];

router.get('/', auth, async (req, res) => {
  try {
    const db = getDatabaseManager();
    const tfRows = await db.getMazscoreTfSubscriptionsByUser(req.user.id);
    const assetRows = await db.getMazscoreAssetSubscriptionsByUser(req.user.id);
    const tfEnabledSet = new Set(tfRows.map(r => r.timeframe));
    const data = {
      timeframes: TF_ORDER.map(tf => ({
        timeframe: tf,
        enabled: tfEnabledSet.has(tf),
      })),
      symbols: assetRows.map(r => ({
        symbol: r.symbol,
        enabled: true,
      })),
    };
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/', auth, async (req, res) => {
  try {
    const { timeframes, symbols } = req.body || {};
    if (!Array.isArray(timeframes) || !Array.isArray(symbols)) {
      return res.status(400).json({ success: false, error: 'timeframes and symbols must be arrays' });
    }
    const cleanedTf = [...new Set(timeframes.filter(tf => typeof tf === 'string' && TF_ORDER.includes(tf)))];
    const cleanedSyms = [...new Set(symbols.filter(s => typeof s === 'string'))];
    const db = getDatabaseManager();
    await db.replaceMazscoreTfSubscriptionsForUser(req.user.id, cleanedTf);
    await db.replaceMazscoreAssetSubscriptionsForUser(req.user.id, cleanedSyms);
    AllAssetsScreenerService.invalidateMazscoreCaches();
    const data = {
      timeframes: TF_ORDER.map(tf => ({
        timeframe: tf,
        enabled: cleanedTf.includes(tf),
      })),
      symbols: cleanedSyms.map(s => ({
        symbol: s,
        enabled: true,
      })),
    };
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;