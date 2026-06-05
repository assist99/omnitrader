const crypto = require('crypto');
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const ExchangeService = require('../src/engine/services/ExchangeService');
const IndicatorService = require('../src/engine/services/indicatorService');
const CandleUtils = require('../src/engine/utils/candleUtils');
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function encrypt(text, key) {
  const hash = crypto.createHash('sha256').update(key).digest();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, hash, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

async function drawCandlestickChart(candles, superTrendData, symbol) {
  const width = 1200;
  const height = 600;
  const chartCallback = (ChartJS) => {
    ChartJS.defaults.font.family = 'monospace';
    ChartJS.defaults.font.size = 10;
  };
  const pluginRegistration = {};
  const chartJSNodeCanvas = new ChartJSNodeCanvas({
    width, height, chartCallback, plugins: pluginRegistration
  });

  const labels = candles.map((_, i) => i.toString());
  const closes = candles.map(c => c.close);

  const superTrendValues = candles.map((_, i) => {
    const st = superTrendData.find(d => d.index === i);
    return st ? st.value : null;
  });

  const config = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `${symbol} Close`,
          data: closes,
          borderColor: 'rgba(70, 130, 180, 0.7)',
          backgroundColor: 'rgba(70, 130, 180, 0.1)',
          borderWidth: 1,
          pointRadius: 0,
          fill: false
        },
        {
          label: 'SuperTrend',
          data: superTrendValues,
          borderColor: 'rgba(255, 69, 0, 1)',
          borderWidth: 2,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: false,
      plugins: {
        title: {
          display: true,
          text: `${symbol} - Price Chart with SuperTrend (Period: 10, Multiplier: 3)`
        },
        legend: {
          display: true
        }
      },
      scales: {
        x: {
          display: false
        },
        y: {
          position: 'right',
          ticks: {
            callback: (value) => `$${value.toFixed(2)}`
          }
        }
      }
    }
  };

  const buffer = await chartJSNodeCanvas.renderToBuffer(config);
  require('fs').writeFileSync(`chart.png`, buffer);
  console.log(`\nChart saved to: chart.png`);
}

async function main() {
  process.env.ENCRYPTION_KEY = 'test-key-for-cli-testing';

  const exchangeName = 'bybit';
  const apiKey = encrypt('Q0IEh5iabcXhQcGQdK', process.env.ENCRYPTION_KEY);
  const apiSecret = encrypt('C9TUtIMlLpS6ho4J6MI1Wtge2ZH9anu2Gwhu', process.env.ENCRYPTION_KEY);
  const isTestnet = false;

  const exchange = new ExchangeService(exchangeName, apiKey, apiSecret, isTestnet);
  const markets = await exchange.exchange.loadMarkets();

  console.log('=== Testing Bybit ExchangeService (livenet) ===\n');
  const symbol = 'XAU/USDT:USDT';

  const candles = CandleUtils.parseExchangeCandles(await exchange.getCandles(symbol,'m5', 300));
  
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  const superTrendData = IndicatorService.getSuperTrend(highs, lows, closes, 10, 4);
  const superTrendResult = IndicatorService.checkSuperTrend(candles, { period: 10, multiplier: 4 });

  console.log('\nSuperTrend Result:', JSON.stringify(superTrendResult, null, 2));
  console.log('SuperTrend values count:', superTrendData.length);

  await drawCandlestickChart(candles, superTrendData, symbol);
  
  console.log('\nLast 5 SuperTrend values:',superTrendData.slice(-5));
  for (let i = Math.max(0, superTrendData.length - 5); i < superTrendData.length; i++) {
    const idx = superTrendData[i].index;
    console.log(`  Index ${idx}: ST=${superTrendData[i].value.toFixed(2)}, Close=${closes[idx].toFixed(2)}`);
  }
}

main().catch(console.error);