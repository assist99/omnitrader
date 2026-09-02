const express = require('express');
const router = express.Router();
const path = require('path');

function loadSymbolsConfig(filename) {
  const dir = __dirname;
  // Dev: ../../../config/ → project_root/src/config/
  // Docker: ../../../../config/ → /app/config/
  try {
    return require(path.resolve(dir, '../../../config/symbols', filename));
  } catch {
    return require(path.resolve(dir, '../../../../config/symbols', filename));
  }
}

const bybitSymbols = loadSymbolsConfig('bybit.json');
const hyperliquidSymbols = loadSymbolsConfig('hyperliquid.json');

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