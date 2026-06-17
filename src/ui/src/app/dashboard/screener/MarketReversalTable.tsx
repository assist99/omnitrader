'use client';

import React from 'react';
import type { ScreenerItem } from '@/lib/types';

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

function buildDedupMap(items: ScreenerItem[]): Map<string, ScreenerItem> {
  const map = new Map<string, ScreenerItem>();

  for (const item of items) {
    if (!isWhitelistedTf(item.timeframe)) continue;
    if (item.enabled !== 1) continue;
    if (item.indicator_type !== 'macd' && item.indicator_type !== 'supertrend') continue;

    const key = `${item.symbol}|${item.timeframe}|${item.indicator_type}`;
    const existing = map.get(key);
    const currentChecked = item.last_checked_at ?? '';
    const existingChecked = existing ? existing.last_checked_at ?? '' : '';

    if (!existing || currentChecked > existingChecked) {
      map.set(key, item);
    }
  }

  return map;
}

function getSymbols(dedupMap: Map<string, ScreenerItem>): string[] {
  const symbols = new Set<string>();
  for (const key of dedupMap.keys()) {
    symbols.add(key.split('|')[0]);
  }
  return Array.from(symbols).sort((a, b) => a.localeCompare(b));
}

export function MarketReversalTable({ items }: { items: ScreenerItem[] }) {
  const dedupMap = buildDedupMap(items);
  const symbols = getSymbols(dedupMap);

  if (symbols.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-xs text-slate-500">
        No enabled screener items found
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
              <th key={tf} colSpan={2} className="px-2 py-1 font-medium text-center whitespace-nowrap">
                {TF_LABELS[tf]}
              </th>
            ))}
          </tr>
          <tr className="border-b border-slate-700/30 text-left text-slate-600">
            <th className="sticky left-0 z-10 bg-slate-900 px-2 py-0.5" />
            {tfs.map((tf) => (
              <React.Fragment key={tf}>
                <th className="px-1 py-0.5 text-center font-normal">M</th>
                <th className="px-1 py-0.5 text-center font-normal">ST</th>
              </React.Fragment>
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
                const macdItem = dedupMap.get(`${symbol}|${tf}|macd`);
                const stItem = dedupMap.get(`${symbol}|${tf}|supertrend`);
                return (
                  <React.Fragment key={tf}>
                    <td className="px-2 py-1 text-center"><SignalDot signal={macdItem?.last_signal ?? null} /></td>
                    <td className="px-2 py-1 text-center"><SignalDot signal={stItem?.last_signal ?? null} /></td>
                  </React.Fragment>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SignalDot({ signal }: { signal: string | null }) {
  if (signal === 'bullish_crossover') {
    return <span className="inline-block h-2 w-2 rounded-full bg-green-500" />;
  }
  if (signal === 'bearish_crossover') {
    return <span className="inline-block h-2 w-2 rounded-full bg-red-500" />;
  }
  return <span className="text-slate-700">-</span>;
}
