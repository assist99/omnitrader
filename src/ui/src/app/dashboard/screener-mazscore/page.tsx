'use client';

import { useEffect, useState, useCallback } from 'react';
import engineFetch from '@/lib/api';

const TF_ORDER = ['m15', 'h1', 'h4', 'd1', 'w1'];

const METAL_SYMBOLS = new Set([
  'PAXG/USDT:USDT',
  'XAU/USDT:USDT',
  'XAG/USDT:USDT',
  'XAUT/USDT:USDT',
  'XAGUSD/USD:USD',
  'GOLD/USDT:USDT',
]);

function ZScoreCell({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-slate-500 text-xs font-mono">—</span>;
  }
  const absVal = Math.abs(value);
  let color = 'text-slate-400';
  if (absVal >= 1.5) color = value > 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold';
  else if (absVal >= 1.0) color = value > 0 ? 'text-green-300' : 'text-red-300';
  else if (absVal >= 0.5) color = value > 0 ? 'text-green-200/70' : 'text-red-200/70';
  const bg = value > 0 ? (absVal >= 1.5 ? 'bg-green-500/10' : absVal >= 1.0 ? 'bg-green-500/5' : 'bg-green-500/[0.02]') : value < 0 ? (absVal >= 1.5 ? 'bg-red-500/10' : absVal >= 1.0 ? 'bg-red-500/5' : 'bg-red-500/[0.02]') : '';
  return (
    <span className={`${color} ${bg} text-xs font-mono px-1 py-0.5 rounded inline-block min-w-[3rem] text-center`}>
      {value.toFixed(2)}
    </span>
  );
}

function SortIcon({ active, direction }: { active: boolean; direction: 'asc' | 'desc' | null }) {
  if (!active) return <span className="text-slate-600 ml-1">⇅</span>;
  return direction === 'asc' ? <span className="text-blue-400 ml-1">↑</span> : <span className="text-blue-400 ml-1">↓</span>;
}

function SectionRow({ label, values, bgColor, textColor }: { label: string; values: Record<string, number | null>; bgColor: string; textColor: string }) {
  return (
    <tr className="border-b border-slate-700/50">
      <td className={`sticky left-0 z-10 px-3 py-2 font-bold text-xs uppercase tracking-wider ${textColor}`} style={{ backgroundColor: bgColor }}>{label}</td>
      {TF_ORDER.map((tf) => {
        const val = values[tf];
        return (
          <td key={tf} className="px-3 py-2 text-center" style={{ backgroundColor: bgColor }}>
            <ZScoreCell value={val ?? null} />
          </td>
        );
      })}
    </tr>
  );
}

export default function MAZScoreScreenerPage() {
  const [data, setData] = useState<Record<string, Record<string, number | null>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<string>('d1');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchData = useCallback(async () => {
    try {
      const res = await engineFetch('/api/screener-status/mazscore');
      if (!res.success) throw new Error(res.error || 'Failed to fetch');
      const rows: { symbol: string; timeframe: string; signal: string | null }[] = res.data || [];
      const matrix: Record<string, Record<string, number | null>> = {};
      for (const row of rows) {
        if (!matrix[row.symbol]) matrix[row.symbol] = {};
        matrix[row.symbol][row.timeframe] = row.signal !== null ? parseFloat(row.signal) : null;
      }
      setData(matrix);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleSort = (tf: string) => {
    if (sortBy === tf) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    } else {
      setSortBy(tf);
      setSortDir('desc');
    }
  };

  const cryptoSymbols = Object.keys(data)
    .filter(s => !METAL_SYMBOLS.has(s))
    .sort((a, b) => {
      const aVal = data[a]?.[sortBy];
      const bVal = data[b]?.[sortBy];
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });

  const metalSymbols = Object.keys(data)
    .filter(s => METAL_SYMBOLS.has(s))
    .sort((a, b) => {
      const aVal = data[a]?.[sortBy];
      const bVal = data[b]?.[sortBy];
      if (aVal === null && bVal === null) return 0;
      if (aVal === null) return 1;
      if (bVal === null) return -1;
      return sortDir === 'desc' ? bVal - aVal : aVal - bVal;
    });

  const cryptoAvg = TF_ORDER.reduce<Record<string, number | null>>((acc, tf) => {
    const vals = cryptoSymbols.map(s => data[s]?.[tf]).filter((v): v is number => v !== null);
    acc[tf] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return acc;
  }, {});

  const metalAvg = TF_ORDER.reduce<Record<string, number | null>>((acc, tf) => {
    const vals = metalSymbols.map(s => data[s]?.[tf]).filter((v): v is number => v !== null);
    acc[tf] = vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">Loading MA Z-Score signals...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-400 text-lg">Error: {error}</div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white">MA Z-Score Screener</h1>
        <button
          onClick={fetchData}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Refresh
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="sticky left-0 bg-slate-900 z-10 px-3 py-2 text-slate-400 font-medium">Symbol</th>
              {TF_ORDER.map((tf) => (
                <th
                  key={tf}
                  onClick={() => handleSort(tf)}
                  className={`px-3 py-2 text-slate-400 font-medium text-center uppercase cursor-pointer select-none hover:text-white transition-colors ${sortBy === tf ? 'text-white' : ''}`}
                >
                  {tf}
                  <SortIcon active={sortBy === tf} direction={sortDir} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SectionRow label="-- CRYPTO --" values={cryptoAvg} bgColor="bg-orange-500/20" textColor="text-orange-200" />
            {cryptoSymbols.map((symbol) => {
              const display = symbol.replace('/USDT:USDT', '');
              return (
                <tr key={symbol} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="sticky left-0 bg-slate-900 z-10 px-3 py-2 text-white font-mono text-xs">{display}</td>
                  {TF_ORDER.map((tf) => (
                    <td key={tf} className="px-3 py-2 text-center">
                      <ZScoreCell value={data[symbol]?.[tf] ?? null} />
                    </td>
                  ))}
                </tr>
              );
            })}
            <SectionRow label="-- METALS --" values={metalAvg} bgColor="bg-teal-500/20" textColor="text-teal-200" />
            {metalSymbols.map((symbol) => {
              const display = symbol.replace('/USDT:USDT', '');
              return (
                <tr key={symbol} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="sticky left-0 bg-slate-900 z-10 px-3 py-2 text-white font-mono text-xs">{display}</td>
                  {TF_ORDER.map((tf) => (
                    <td key={tf} className="px-3 py-2 text-center">
                      <ZScoreCell value={data[symbol]?.[tf] ?? null} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
