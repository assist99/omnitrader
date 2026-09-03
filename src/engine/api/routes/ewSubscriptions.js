const express = require('express');
const router = express.Router();
const { getDatabaseManager } = require('../../db');
const auth = require('../middleware/auth');

const TF_ORDER = ['m5', 'm15', 'h1', 'h4', 'd1', 'w1'];

router.get('/', auth, async (req, res) => {
  try {
    const db = getDatabaseManager();
    const rows = await db.getEwSubscriptionsByUser(req.user.id);
    const enabledSet = new Set(rows.map(r => r.timeframe));
    const data = TF_ORDER.map(tf => ({
      timeframe: tf,
      enabled: enabledSet.has(tf),
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put('/', auth, async (req, res) => {
  try {
    const { timeframes } = req.body || {};
    if (!Array.isArray(timeframes)) {
      return res.status(400).json({ success: false, error: 'timeframes must be an array' });
    }
    const cleaned = [...new Set(timeframes.filter(tf => typeof tf === 'string' && TF_ORDER.includes(tf)))];
    const db = getDatabaseManager();
    await db.replaceEwSubscriptionsForUser(req.user.id, cleaned);
    const data = TF_ORDER.map(tf => ({
      timeframe: tf,
      enabled: cleaned.includes(tf),
    }));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;