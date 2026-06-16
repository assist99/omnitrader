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
  { symbol: 'XAU/USDT:USDT', display: 'XAUUSDT.P' },
  { symbol: 'XAG/USDT:USDT', display: 'XAGUSDT.P' },
  { symbol: 'PXAG/USDT:USDT', display: 'PAGUSDT.P' }
];

export const HYPERLIQUID_SYMBOLS: SymbolOption[] = [];

export const SYMBOLS: Record<string, SymbolOption[]> = {
  bybit: BYBIT_SYMBOLS,
  hyperliquid: HYPERLIQUID_SYMBOLS,
};

export function getSymbols(exchange: string): SymbolOption[] {
  return SYMBOLS[exchange] || [];
}
