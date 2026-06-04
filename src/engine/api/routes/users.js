const express = require('express');
const router = express.Router();
const Database = require('../../db/database');
const auth = require('../middleware/auth');
const TelegramService = require('../../services/telegramService');

const db = new Database();
db.connect().catch(() => {});
const tg = new TelegramService(db);

// Update telegram chat id for user
router.patch('/telegram', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { telegram_chat_id } = req.body;
    await db.updateUserTelegramChatId(userId, telegram_chat_id || null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send test message to provided chat id
router.post('/telegram/test', auth, async (req, res) => {
  try {
    const { chatId } = req.body || {};
    if (!chatId) return res.status(400).json({ error: 'chatId is required' });

    if (!tg.isAvailable()) return res.status(503).json({ error: 'Telegram service not available' });

    const message = '✅ OmniTrader test notification - your Telegram configuration is working!';
    const ok = await tg.sendDirectNotification(chatId, message);
    if (ok) return res.json({ success: true, message: 'Test notification sent' });
    return res.status(500).json({ error: 'Failed to send test notification' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
