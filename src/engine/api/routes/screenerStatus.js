const express = require('express');
const router = express.Router();
const { getDatabaseManager } = require('../../db');
const logger = require('../../logger');

router.get('/supertrend', async (req, res) => {
  try {
    const db = getDatabaseManager();
    const rows = await db.getScreenerSnapshots('supertrend');
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Failed to fetch supertrend directions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/ew', async (req, res) => {
  try {
    const db = getDatabaseManager();
    const rows = await db.getScreenerSnapshots('ewt');
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Failed to fetch EW snapshots:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/mazscore', async (req, res) => {
  try {
    const db = getDatabaseManager();
    const rows = await db.getScreenerSnapshots('mazscore');
    res.json({ success: true, data: rows });
  } catch (error) {
    logger.error('Failed to fetch MA Z-Score snapshots:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/mazscore-extreme', (req, res) => {
  try {
    const AllAssetsScreenerService = require('../../services/allAssetsScreenerService');
    const entries = {};
    for (const [key, value] of AllAssetsScreenerService.lastMAZScoreExtreme.entries()) {
      entries[key] = value;
    }
    res.json({ success: true, data: entries, avgExtreme: AllAssetsScreenerService.lastMAZScoreAvgExtreme });
  } catch (error) {
    logger.error('Failed to fetch MA Z-Score extremes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;