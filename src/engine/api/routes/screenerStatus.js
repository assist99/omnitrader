const express = require('express');
const router = express.Router();
const AllAssetsScreenerService = require('../../services/allAssetsScreenerService');
const { getDatabaseManager } = require('../../db');
const logger = require('../../logger');

router.get('/supertrend', async (req, res) => {
  try {
    const data = AllAssetsScreenerService.getAllSTDirections();
    res.json({ success: true, data });
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

module.exports = router;