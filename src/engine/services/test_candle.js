const CandleProvider = require('./candleProvider.js');

const testProvider = new CandleProvider({
  exchange: 'bybit',
  symbols: ['BTC/USDT:USDT', 'ETH/USDT:USDT'],
  timeframes: ['m5'],
  limit: 100,
  onUpdate: (symbol, timeframe, candle) => {
    console.log(`[CLOSED] ${symbol} ${timeframe} | O:${candle[1]} H:${candle[2]} L:${candle[3]} C:${candle[4]} V:${candle[5]}`);
  },
  onScreenerUpdate: (symbol, timeframe, closedBars) => {
    console.log(`[SCREENER] ${symbol} ${timeframe} | ${closedBars.length} bars`);
  },
  isTestnet: false
});

testProvider.start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

// Stop after 30 seconds
setTimeout(() => {
  console.log('Stopping after 30 seconds...');
  testProvider.stop().then(() => {
    console.log('Stopped');
    process.exit(0);
  }).catch(err => {
    console.error('Error stopping:', err);
    process.exit(1);
  });
}, 30000);