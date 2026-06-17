'use client';

import type { SupplyDemandItem } from '@/lib/types';
import SignalCell from './signal-cell';

const TF_WHITELIST = ['m15', 'm30', 'h1', 'h2', 'h4'] as const;
type WhitelistedTf = (typeof TF_WHITELIST)[number];

const TF_LABELS: Record<WhitelistedTf, string> = {
  m15: '15 Min',
  m30: '30 Min',
  h1: '1 H',
  h2: '2 H',
  h4: '4 H',
};

function isWhitelistedTf(tf: string): tf is WhitelistedTf {
  return (TF_WHITELIST as readonly string[]).includes(tf);
}

function buildGroupedMap(items: SupplyDemandItem[]): Map<string, Map<string, SupplyDemandItem>> {
  const grouped = new Map<string, Map<string, SupplyDemandItem>>();

  for (const item of items) {
    if (!isWhitelistedTf(item.timeframe)) continue;
    if (item.enabled !== 1) continue;

    const symbolMap = grouped.get(item.symbol) || new Map<string, SupplyDemandItem>();
    symbolMap.set(item.timeframe, item);
    grouped.set(item.symbol, symbolMap);
  }

  return grouped;
}

function getSymbols(groupedMap: Map<string, Map<string, SupplyDemandItem>>): string[] {
  const symbols = Array.from(groupedMap.keys());
  return symbols.sort((a, b) => a.localeCompare(b));
}

export default function MarketTable({ items }: { items: SupplyDemandItem[] }) {
  const grouped = buildGroupedMap(items);
  const symbols = getSymbols(grouped);

  if (symbols.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-xs text-slate-500">
        No enabled supply/demand items found
      </div>
    );
  }

  const tfs = TF_WHITELIST;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-slate-700/50 text-left text-slate-500">
            <th className="sticky left-0 z-10 bg-slate-900 px-2 py-1 font-medium text-white">
              Symbol
            </th>
            {tfs.map((tf) => (
              <th key={tf} className="px-2 py-1 font-medium text-center whitespace-nowrap">
                {TF_LABELS[tf]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {symbols.map((symbol) => (
            <tr key={symbol} className="border-b border-slate-700/30 hover:bg-slate-800/50">
              <td className="sticky left-0 z-10 bg-slate-900 px-2 py-1 font-medium text-white whitespace-nowrap">
                {symbol}
              </td>
              {tfs.map((tf) => {
                const item = grouped.get(symbol)?.get(tf);
                return (
                  <td key={tf} className="px-2 py-1 text-center align-middle">
                    <SignalCell item={item} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}