const express = require('express');
const router = express.Router();
const Database = require('../../db/database');
const Encryption = require('../../utils/encryption');
const auth = require('../middleware/auth');

const db = new Database();
db.connect().catch(() => {});

// List accounts for authenticated user
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const rows = await db.all('SELECT id, exchange, label, is_testnet, created_at, updated_at FROM exchange_accounts WHERE user_id = ?', [userId]);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create account
router.post('/', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { exchange, label, api_key, api_secret, is_testnet } = req.body;
    if (!exchange || !label || !api_key || !api_secret) return res.status(400).json({ error: 'Missing fields' });
    
    // Validate exchange
    const supportedExchanges = ['bybit', 'hyperliquid'];
    if (!supportedExchanges.includes(exchange.toLowerCase())) {
      return res.status(400).json({ error: `Unsupported exchange. Supported: ${supportedExchanges.join(', ')}` });
    }

    const apiKeyEnc = Encryption.encrypt(api_key);
    const apiSecretEnc = Encryption.encrypt(api_secret);

    const sql = `INSERT INTO exchange_accounts (user_id, exchange, label, api_key_enc, api_secret_enc, is_testnet, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;
    const result = await db.run(sql, [userId, exchange.toLowerCase(), label, apiKeyEnc, apiSecretEnc, is_testnet ? 1 : 0]);
    res.json({ success: true, data: { id: result.lastID, exchange, label, is_testnet: !!is_testnet } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update account
router.put('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);
    const { exchange, label, api_key, api_secret, is_testnet } = req.body;

    const updates = [];
    const params = [];

    if (exchange !== undefined) { 
      // Validate exchange
      const supportedExchanges = ['bybit', 'hyperliquid'];
      if (!supportedExchanges.includes(exchange.toLowerCase())) {
        return res.status(400).json({ error: `Unsupported exchange. Supported: ${supportedExchanges.join(', ')}` });
      }
      updates.push('exchange = ?'); 
      params.push(exchange.toLowerCase()); 
    }
    if (label !== undefined) { updates.push('label = ?'); params.push(label); }
    if (is_testnet !== undefined) { updates.push('is_testnet = ?'); params.push(is_testnet ? 1 : 0); }
    if (api_key) { updates.push('api_key_enc = ?'); params.push(Encryption.encrypt(api_key)); }
    if (api_secret) { updates.push('api_secret_enc = ?'); params.push(Encryption.encrypt(api_secret)); }

    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    // Append updated_at, id and userId for the WHERE clause
    params.push(new Date().toISOString());
    params.push(id);
    params.push(userId);

    const sql = `UPDATE exchange_accounts SET ${updates.join(', ')}, updated_at = ? WHERE id = ? AND user_id = ?`;
    await db.run(sql, params);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete account (and associated setups/orders)
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const id = Number(req.params.id);

    // Delete orders for setups that belong to this account
    await db.run('DELETE FROM orders WHERE setup_id IN (SELECT id FROM trading_setups WHERE exchange_account_id = ?)', [id]);
    // Delete setups
    await db.run('DELETE FROM trading_setups WHERE exchange_account_id = ?', [id]);
    // Delete account
    await db.run('DELETE FROM exchange_accounts WHERE id = ? AND user_id = ?', [id, userId]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
