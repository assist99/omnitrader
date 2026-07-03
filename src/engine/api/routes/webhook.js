const express = require('express');
const router = express.Router();
const Database = require('../../db/database');
const EntryService = require('../../services/entryService');
const TelegramService = require('../../services/telegramService');
const logger = require('../../logger');

const db = new Database();
let telegramService = null;

db.connect().catch(() => {});
Promise.resolve().then(async () => {
  try {
    telegramService = new TelegramService(db);
  } catch (err) {
    logger.warn(`TelegramService not available for webhook: ${err.message}`);
  }
});

router.post('/trade', async (req, res) => {
  try {
    const payload = req.body;

    if (!payload || !payload.asset || !payload.entry_price || !payload.side) {
      return res.status(400).json({ error: 'Missing required fields: asset, entry_price, side' });
    }

    if (!payload.features || !payload.features.signal_count || payload.features.signal_count <= 0) {
      return res.status(400).json({ error: 'signal_count must be > 0' });
    }

    if (payload.side !== 1 && payload.side !== -1) {
      return res.status(400).json({ error: 'side must be 1 (long) or -1 (short)' });
    }

    if (!EntryService.db) {
      EntryService.setDeps(db, telegramService);
    }

    const result = await EntryService.webhookPlaceOrder(payload, db, telegramService);

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error(`Webhook trade error:`, error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;