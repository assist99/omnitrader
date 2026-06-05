const express = require('express');
const router = express.Router();
const Database = require('../../db/database');
const auth = require('../middleware/auth');

const db = new Database();
db.connect().catch(() => {});

router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { enabled = 'true' } = req.query;
    const enabledOnly = String(enabled) !== 'false';
    const items = await db.getScreenerItems(userId, enabledOnly);
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { exchange_account_id, symbol, timeframe, indicator_type, indicator_params } = req.body;

    if (!exchange_account_id || !symbol || !timeframe || !indicator_type) {
      return res.status(400).json({ error: 'Missing required fields: exchange_account_id, symbol, timeframe, indicator_type' });
    }

    const params = indicator_params || {};
    const result = await db.createScreenerItem({
      user_id: userId,
      exchange_account_id,
      symbol,
      timeframe,
      indicator_type,
      indicator_params: params
    });

    res.json({ success: true, data: { id: result.id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    const item = await db.getScreenerItemById(id, userId);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true, data: item });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    const item = await db.getScreenerItemById(id, userId);
    if (!item) return res.status(404).json({ error: 'Not found' });

    const updates = {};
    const allowed = ['symbol', 'timeframe', 'indicator_type', 'indicator_params', 'enabled'];
    for (const [k, v] of Object.entries(req.body || {})) {
      if (allowed.includes(k)) {
        updates[k] = v;
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No updatable fields provided' });
    }

    await db.updateScreenerItem(id, userId, updates);
    const updated = await db.getScreenerItemById(id, userId);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/:id/toggle', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    const item = await db.getScreenerItemById(id, userId);
    if (!item) return res.status(404).json({ error: 'Not found' });

    const newEnabled = !item.enabled;
    await db.updateScreenerItem(id, userId, { enabled: newEnabled ? 1 : 0 });
    const updated = await db.getScreenerItemById(id, userId);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    const item = await db.getScreenerItemById(id, userId);
    if (!item) return res.status(404).json({ error: 'Not found' });

    await db.deleteScreenerItem(id, userId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;