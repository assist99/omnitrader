const express = require('express');
const router = express.Router();
const Database = require('../../db/database');
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

    // Fallback: return empty list to avoid exposing other users' orders
    return res.json({ success: true, data: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
