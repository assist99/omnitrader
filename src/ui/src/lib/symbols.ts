import { engineFetch } from './api';

export interface SymbolOption {
  symbol: string;
  display: string;
}

export interface SymbolsMap {
  [exchange: string]: {
    symbols: SymbolOption[];
    intervals: string[];
  };
}

let cachedSymbols: SymbolsMap | null = null;

async function getSymbolsMap(): Promise<SymbolsMap> {
  if (!cachedSymbols) {
    cachedSymbols = await engineFetch('/api/symbols');
  }
  return cachedSymbols;
}

export async function getSymbols(exchange: string): Promise<SymbolOption[]> {
  const map = await getSymbolsMap();
  return map[exchange]?.symbols || [];
}

export async function getExchanges(): Promise<string[]> {
  const map = await getSymbolsMap();
  return Object.keys(map);
}