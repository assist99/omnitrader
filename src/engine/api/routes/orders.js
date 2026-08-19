const express = require('express');
const router = express.Router();
const Database = require('../../db/database');
const EntryService = require('../../services/entryService');
const auth = require('../middleware/auth');

const db = new Database();
db.connect().catch(() => {});

// Get orders by setup id (or all for user)
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const setupId = req.query.setup_id ? Number(req.query.setup_id) : null;

    if (setupId) {
      const setup = await db.getSetupById(setupId);
      if (!setup) return res.status(404).json({ error: 'Setup not found' });
      if (setup.user_id !== userId) return res.status(403).json({ error: 'Forbidden' });
      const orders = await db.getOrdersBySetupId(setupId);
      return res.json({ success: true, data: orders });
    }

    return res.json({ success: true, data: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Place manual order (immediate entry without indicator signals)
router.post('/place', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const payload = req.body || {};

    if (!payload.sl_price || payload.sl_price <= 0) {
      return res.status(400).json({ error: 'Stop Loss price is mandatory and must be greater than 0' });
    }

    if (!payload.risk_value || payload.risk_value <= 0) {
      return res.status(400).json({ error: 'Risk value must be greater than 0' });
    }

    if (!payload.exchange_account_id) {
      return res.status(400).json({ error: 'Exchange account is required' });
    }

    if (!payload.symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    const sql = `INSERT INTO trading_setups (
      user_id, exchange_account_id, symbol, side, memo,
      activation_price, ignore_box_upper, ignore_box_lower,
      entry_indicator_type, entry_indicator_tf,
      risk_type, risk_value, sl_price, tp_prices,
      be_enabled, be_trigger_price,
      exit_indicator_type, exit_indicator_tf,
      status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?,
      0, 0, 0,
      'manual', 'manual',
      ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      'triggered', datetime('now'), datetime('now'))`;

    const params = [
      userId,
      payload.exchange_account_id || null,
      payload.symbol || null,
      payload.side || 'long',
      payload.memo || null,
      payload.risk_type || null,
      payload.risk_value || 0,
      payload.sl_price || 0,
      JSON.stringify(payload.tp_prices || []),
      payload.be_enabled ? 1 : 0,
      payload.be_trigger_price || 0,
      payload.exit_indicator_type || null,
      payload.exit_indicator_tf || null,
    ];

    const result = await db.run(sql, params);
    const setupId = result.lastID;
    const setup = await db.getSetupById(setupId);

    if (!setup) {
      await db.run('DELETE FROM trading_setups WHERE id = ?', [setupId]);
      return res.status(500).json({ error: 'Failed to retrieve created setup' });
    }

    try {
      const orderResult = await EntryService.placeManualOrder(setup);
      return res.json({
        success: true,
        data: {
          id: setupId,
          entryPrice: orderResult.entryPrice,
          slPrice: orderResult.slPrice,
          positionSize: orderResult.positionSize,
          tpPrices: orderResult.tpPrices
        }
      });
    } catch (orderError) {
      await db.run('DELETE FROM orders WHERE setup_id = ?', [setupId]);
      await db.run('DELETE FROM trading_setups WHERE id = ?', [setupId]);
      return res.status(500).json({ error: orderError.message || 'Failed to place order' });
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;