const express = require('express');
const router = express.Router();

router.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'trading-engine-api'
  };
  res.json({ success: true, data: health });
});

module.exports = router;
