export interface SymbolOption {
  symbol: string;
  display: string;
}

export const BYBIT_SYMBOLS: SymbolOption[] = [
  { symbol: 'BTC/USDT:USDT', display: 'BTCUSDT.P' },
  { symbol: 'ETH/USDT:USDT', display: 'ETHUSDT.P' },
  { symbol: 'BNB/USDT:USDT', display: 'BNBUSDT.P' },
  { symbol: 'LINK/USDT:USDT', display: 'LINKUSDT.P' },
  { symbol: 'SOL/USDT:USDT', display: 'SOLUSDT.P' },
  { symbol: 'AVAX/USDT:USDT', display: 'AVAXUSDT.P' },
  { symbol: 'GRT/USDT:USDT', display: 'GRTUSDT.P' },
  { symbol: 'NEAR/USDT:USDT', display: 'NEARUSDT.P' },
  { symbol: 'AAVE/USDT:USDT', display: 'AAVEUSDT.P' },
  { symbol: 'INJ/USDT:USDT', display: 'INJUSDT.P' },
  { symbol: 'ADA/USDT:USDT', display: 'ADAUSDT.P' },
  { symbol: 'TRX/USDT:USDT', display: 'TRXUSDT.P' },
  { symbol: 'DOGE/USDT:USDT', display: 'DOGEUSDT.P' },
  { symbol: 'ATOM/USDT:USDT', display: 'ATOMUSDT.P' },
  { symbol: 'LTC/USDT:USDT', display: 'LTCUSDT.P' },
  { symbol: 'SUI/USDT:USDT', display: 'SUIUSDT.P' },
  { symbol: 'ARB/USDT:USDT', display: 'ARBUSDT.P' },
  { symbol: 'DOT/USDT:USDT', display: 'DOTUSDT.P' },
  { symbol: 'XRP/USDT:USDT', display: 'XRPUSDT.P' },
  { symbol: 'XAU/USDT:USDT', display: 'XAUUSDT.P' },
  { symbol: 'XAG/USDT:USDT', display: 'XAGUSDT.P' },
  { symbol: 'PAXG/USDT:USDT', display: 'PAXGUSDT.P' }
];

export const HYPERLIQUID_SYMBOLS: SymbolOption[] = [
  {
    "symbol": "BTC/USDC:USDC",
    "display": "BTCUSDC.P"
  },
  {
    "symbol": "ETH/USDC:USDC",
    "display": "ETHUSDC.P"
  },
  {
    "symbol": "BNB/USDC:USDC",
    "display": "BNBUSDC.P"
  },
  {
    "symbol": "LINK/USDC:USDC",
    "display": "LINKUSDC.P"
  },
  {
    "symbol": "SOL/USDC:USDC",
    "display": "SOLUSDC.P"
  },
  {
    "symbol": "GRT/USDC:USDC",
    "display": "GRTUSDC.P"
  },
  {
    "symbol": "NEAR/USDC:USDC",
    "display": "NEARUSDC.P"
  },
  {
    "symbol": "AAVE/USDC:USDC",
    "display": "AAVEUSDC.P"
  },
  {
    "symbol": "INJ/USDC:USDC",
    "display": "INJUSDC.P"
  },
  {
    "symbol": "ADA/USDC:USDC",
    "display": "ADAUSDC.P"
  },
  {
    "symbol": "TRX/USDC:USDC",
    "display": "TRXUSDC.P"
  },
  {
    "symbol": "DOGE/USDC:USDC",
    "display": "DOGEUSDC.P"
  },
  {
    "symbol": "ATOM/USDC:USDC",
    "display": "ATOMUSDC.P"
  },
  {
    "symbol": "LTC/USDC:USDC",
    "display": "LTCUSDC.P"
  },
  {
    "symbol": "SUI/USDC:USDC",
    "display": "SUIUSDC.P"
  },
  {
    "symbol": "ARB/USDC:USDC",
    "display": "ARBUSDC.P"
  },
  {
    "symbol": "DOT/USDC:USDC",
    "display": "DOTUSDC.P"
  },
  {
    "symbol": "XAU/USDC:USDC",
    "display": "XAUUSDC.P"
  },
  {
    "symbol": "XAG/USDC:USDC",
    "display": "XAGUSDC.P"
  },
  {
    "symbol": "PAXG/USDC:USDC",
    "display": "PAXGUSDC.P"
  },
  {
    "symbol": "AVAX/USDC:USDC",
    "display": "AVAXUSDC.P"
  },
  {
    "symbol": "XRP/USDC:USDC",
    "display": "XRPUSDC.P"
  }

];

export const SYMBOLS: Record<string, SymbolOption[]> = {
  bybit: BYBIT_SYMBOLS,
  hyperliquid: HYPERLIQUID_SYMBOLS,
};

export function getSymbols(exchange: string): SymbolOption[] {
  return SYMBOLS[exchange] || [];
}
