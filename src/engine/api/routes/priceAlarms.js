const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { getDatabaseManager } = require('../../db');
const auth = require('../middleware/auth');

const TF_ORDER = ['m5', 'm15', 'h1', 'h4', 'd1', 'w1'];
const VALID_DIRECTIONS = ['cross_above', 'cross_below'];

function loadBybitSymbols() {
  const candidates = [
    path.resolve(__dirname, '../../../config/symbols/bybit.json'),
    path.resolve(__dirname, '../../../../config/symbols/bybit.json'),
  ];
  for (const p of candidates) {
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch {}
  }
  return { symbols: [] };
}

const bybitConfig = loadBybitSymbols();
const VALID_SYMBOLS = new Set(bybitConfig.symbols.map(s => s.symbol));

function validateAlarmPayload(body) {
  const errors = [];
  const { symbol, timeframe, direction, price_level } = body || {};

  if (!symbol || !VALID_SYMBOLS.has(symbol)) errors.push('symbol is invalid or not supported on Bybit');
  if (!timeframe || !TF_ORDER.includes(timeframe)) errors.push(`timeframe must be one of ${TF_ORDER.join(', ')}`);
  if (!direction || !VALID_DIRECTIONS.includes(direction)) errors.push(`direction must be one of ${VALID_DIRECTIONS.join(', ')}`);

  const level = Number(price_level);
  if (!Number.isFinite(level) || level <= 0) errors.push('price_level must be a positive number');

  return { errors, value: { symbol, timeframe, direction, price_level: level } };
}

router.get('/', auth, async (req, res) => {
  try {
    const db = getDatabaseManager();
    const rows = await db.getPriceAlarmsByUser(req.user.id);
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { errors, value } = validateAlarmPayload(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors.join('; ') });
    }
    const db = getDatabaseManager();
    const created = await db.createPriceAlarm(req.user.id, value);
    res.json({ success: true, data: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/', auth, async (req, res) => {
  try {
    const db = getDatabaseManager();
    await db.deleteAllPriceAlarmsByUser(req.user.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    const db = getDatabaseManager();
    const result = await db.deletePriceAlarm(id, req.user.id);
    if (!result || result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;