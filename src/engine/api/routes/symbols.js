const express = require('express');
const router = express.Router();

const bybitSymbols = require('../../../config/symbols/bybit.json');
const hyperliquidSymbols = require('../../../config/symbols/hyperliquid.json');

router.get('/', (req, res) => {
  res.json({
    bybit: bybitSymbols,
    hyperliquid: hyperliquidSymbols,
  });
});

router.get('/:exchange', (req, res) => {
  const { exchange } = req.params;

  switch (exchange) {
    case 'bybit':
      return res.json(bybitSymbols);
    case 'hyperliquid':
      return res.json(hyperliquidSymbols);
    default:
      return res.status(404).json({ error: `Unknown exchange: ${exchange}` });
  }
});

module.exports = router;