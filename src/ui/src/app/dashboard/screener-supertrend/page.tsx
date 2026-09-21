'use client';

import { useEffect, useState, useCallback } from 'react';
import engineFetch from '@/lib/api';
import { Bell, BellOff, Save } from 'lucide-react';

const TF_ORDER = ['m15', 'h1', 'h4', 'd1', 'w1'];

function SignalDot({ signal }: { signal: string | null }) {
  if (!signal) {
    return <span className="inline-flex items-center justify-center w-3 h-3 rounded-full bg-slate-800/50 text-slate-500 text-[8px]">—</span>;
  }
  const isBullish = signal.startsWith('bullish');
  return (
    <span
      className={`inline-flex items-center justify-center w-3 h-3 rounded-full ${isBullish ? 'bg-green-800/40' : 'bg-red-800/40'} border ${isBullish ? 'border-green-600/30' : 'border-red-600/30'}`}
      title={signal}
    />
  );
}

export default function SuperTrendScreenerPage() {
  const [data, setData] = useState<Record<string, Record<string, string | null>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tfSubs, setTfSubs] = useState<Record<string, boolean>>({});
  const [assetSubs, setAssetSubs] = useState<Record<string, boolean>>({});
  const [subsLoaded, setSubsLoaded] = useState(false);
  const [subsSaving, setSubsSaving] = useState(false);
  const [subsMessage, setSubsMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await engineFetch('/api/screener-status/supertrend');
      if (!res.success) throw new Error(res.error || 'Failed to fetch');
      const rows: { symbol: string; timeframe: string; signal: string | null }[] = res.data || [];
      const matrix: Record<string, Record<string, string | null>> = {};
      for (const row of rows) {
        if (!matrix[row.symbol]) matrix[row.symbol] = {};
        matrix[row.symbol][row.timeframe] = row.signal;
      }
      setData(matrix);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSubs = useCallback(async () => {
    try {
      const res = await engineFetch('/api/supertrend-subscriptions');
      if (res.success && res.data) {
        const subscriptions = res.data as Record<string, Record<string, boolean>>;
        const timeframes: Record<string, boolean> = {};
        const assetMap: Record<string, boolean> = {};
        for (const symbol in subscriptions) {
          for (const tf in subscriptions[symbol]) {
            if (subscriptions[symbol][tf]) {
              timeframes[tf] = true;
              assetMap[symbol] = true;
            }
          }
        }
        setTfSubs(timeframes);
        setAssetSubs(assetMap);
        console.log('[SuperTrend] Subscriptions loaded:', subscriptions);
      } else {
        console.warn('[SuperTrend] Failed to load subscriptions:', res);
      }
    } catch (err) {
      console.error('[SuperTrend] Error loading subscriptions:', err);
    }
    setSubsLoaded(true);
  }, []);

  useEffect(() => {
    fetchData();
    fetchSubs();
    const interval = setInterval(fetchData, 120000);
    return () => clearInterval(interval);
  }, [fetchData, fetchSubs]);

  async function saveSubs() {
    setSubsSaving(true);
    setSubsMessage(null);
    try {
      const enabledTimeframes = TF_ORDER.filter(tf => tfSubs[tf]);
      const enabledSymbols = Object.keys(assetSubs).filter(s => assetSubs[s]);
      const subscriptions: Record<string, Record<string, boolean>> = {};
      for (const symbol of enabledSymbols) {
        subscriptions[symbol] = {};
        for (const tf of enabledTimeframes) {
          subscriptions[symbol][tf] = true;
        }
      }

      console.log('[SuperTrend] Saving subscriptions:', subscriptions);

      const res = await engineFetch('/api/supertrend-subscriptions', {
        method: 'PUT',
        body: JSON.stringify({ subscriptions }),
      });
      if (!res.success) throw new Error(res.error || 'Failed to save');

      console.log('[SuperTrend] Save response:', res);

      const updatedSubs = res.data as Record<string, Record<string, boolean>>;
      const timeframes: Record<string, boolean> = {};
      const assetMap: Record<string, boolean> = {};
      for (const symbol in updatedSubs) {
        for (const tf in updatedSubs[symbol]) {
          if (updatedSubs[symbol][tf]) {
            timeframes[tf] = true;
            assetMap[symbol] = true;
          }
        }
      }
      setTfSubs(timeframes);
      setAssetSubs(assetMap);

      setSubsMessage('Saved');
    } catch (err: unknown) {
      console.error('[SuperTrend] Save error:', err);
      setSubsMessage(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubsSaving(false);
    }
  }

  const allSymbolsSorted = Object.keys(data).sort();
  const anySubscribed = Object.values(tfSubs).some(Boolean) && Object.values(assetSubs).some(Boolean);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-slate-400 text-lg">Loading SuperTrend signals...</div>
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
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          SuperTrend Screener
          {anySubscribed ? (
            <Bell className="h-4 w-4 text-blue-400" aria-label="Telegram alerts enabled" />
          ) : (
            <BellOff className="h-4 w-4 text-slate-500" aria-label="Telegram alerts disabled" />
          )}
        </h1>
        <button
          onClick={fetchData}
          className="px-3 py-1.5 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="mb-4 rounded-xl border border-slate-700/50 bg-slate-800 p-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="text-sm font-medium text-white">Telegram alert settings</div>
            <div className="text-xs text-slate-400">Select timeframes and assets to receive alerts.</div>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Timeframes:</span>
              {TF_ORDER.map(tf => (
                <label key={tf} className="flex items-center gap-1.5 text-sm text-slate-300 select-none">
                  <input
                    type="checkbox"
                    checked={!!tfSubs[tf]}
                    onChange={(e) => setTfSubs({ ...tfSubs, [tf]: e.target.checked })}
                    disabled={!subsLoaded}
                    className="rounded border-slate-600"
                  />
                  <span className="uppercase font-mono text-xs">{tf}</span>
                </label>
              ))}
            </div>
            <button
              onClick={saveSubs}
              disabled={subsSaving || !subsLoaded}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {subsSaving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
        {subsMessage && (
          <div className={`mt-2 text-xs ${subsMessage === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>
            {subsMessage}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-slate-700/50">
              <th className="sticky left-0 bg-slate-900 z-10 px-3 py-2 text-slate-400 font-medium">Symbol</th>
              {TF_ORDER.map((tf) => (
                <th key={tf} className="px-3 py-2 text-slate-400 font-medium text-center uppercase">{tf}</th>
              ))}
              <th className="sticky right-0 bg-slate-900 z-10 px-3 py-2 text-slate-400 font-medium text-center">Alert</th>
            </tr>
          </thead>
          <tbody>
            {allSymbolsSorted.map((symbol) => {
              const display = symbol.replace('/USDT:USDT', '');
              return (
                <tr key={symbol} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="sticky left-0 bg-slate-900 z-10 px-3 py-2 text-white font-mono text-xs">{display}</td>
                  {TF_ORDER.map((tf) => (
                    <td key={tf} className="px-3 py-2 text-center">
                      <SignalDot signal={data[symbol]?.[tf] ?? null} />
                    </td>
                  ))}
                  <td className="sticky right-0 bg-slate-900 z-10 px-3 py-2 text-center">
                    <label className="flex items-center justify-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!assetSubs[symbol]}
                        onChange={(e) => setAssetSubs({ ...assetSubs, [symbol]: e.target.checked })}
                        disabled={!subsLoaded}
                        className="h-4 w-4 rounded border-slate-600"
                        title={`Alert for ${display}`}
                      />
                    </label>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}