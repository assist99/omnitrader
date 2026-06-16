'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { PlusCircle, Trash2, ToggleLeft, ToggleRight, Search, Pencil } from 'lucide-react';
import engineFetch from '@/lib/api';
import type { SupplyDemandItem } from '@/lib/types';

const TIMEFRAME_LABELS: Record<string, string> = {
  m1: '1 Min',
  m5: '5 Min',
  m15: '15 Min',
  m30: '30 Min',
  h1: '1 H',
  h2: '2 H',
  h4: '4 H',
  d1: '1 D'
};

type TabType = 'enabled' | 'disabled';

export default function SupplyDemandScreenerPage() {
  const [items, setItems] = useState<SupplyDemandItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabType>('enabled');

  async function fetchItems() {
    setLoading(true);
    try {
      const enabledParam = tab === 'enabled' ? 'true' : 'false';
      const data = await engineFetch(`/api/supply-demand?enabled=${enabledParam}`);
      if (data.success) setItems(data.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }

  useEffect(() => {
    (async () => {
      await fetchItems();
    })();
  }, [tab]);

  const handleToggle = useCallback(async (id: number) => {
    const data = await engineFetch(`/api/supply-demand/${id}/toggle`, { method: 'PATCH' });
    if (data.success) fetchItems();
  }, [tab]);

  const handleDelete = useCallback(async (id: number) => {
    if (!confirm('Delete this supply/demand screener item?')) return;
    const data = await engineFetch(`/api/supply-demand/${id}`, { method: 'DELETE' });
    if (data.success) fetchItems();
  }, [tab]);

  const getSignalColor = (signal: string | null) => {
    if (signal === 'supply') return 'text-red-400';
    if (signal === 'demand') return 'text-green-400';
    return 'text-slate-500';
  };

  const getSignalLabel = (signal: string | null) => {
    if (signal === 'supply') return 'Supply';
    if (signal === 'demand') return 'Demand';
    return '-';
  };

  const getTimeframeLabel = (tf: string) => {
    return TIMEFRAME_LABELS[tf] || tf;
  };

  const formatZoneRange = (item: SupplyDemandItem) => {
    if (item.last_zone_bottom && item.last_zone_top) {
      return `$${item.last_zone_bottom} - $${item.last_zone_top}`;
    }
    return '-';
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
          <Search className="h-6 w-6" />
          Supply/Demand Screener
        </h1>
        <Link href="/dashboard/supply-demand-screener/new"
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 w-full sm:w-auto">
          <PlusCircle className="h-4 w-4" />
          Add Supply/Demand Screener
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-1 border-b border-slate-700/50 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        {(['enabled', 'disabled'] as TabType[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`whitespace-nowrap px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium transition-colors border-b-2 ${
              tab === t ? 'border-blue-500 text-blue-400' : 'border-transparent text-slate-500 hover:text-slate-300'
            }`}>
            {t === 'enabled' ? 'Enabled' : 'Disabled'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <p className="text-lg">No supply/demand screener items found</p>
          <Link href="/dashboard/supply-demand-screener/new" className="mt-2 text-sm text-blue-400 hover:text-blue-300">
            Create your first supply/demand screener
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-slate-700/50 bg-slate-800 px-3 py-2 sm:px-4 sm:py-2 transition-colors hover:border-slate-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 sm:gap-3 text-sm">
                  <span className="font-semibold text-white">{item.symbol}</span>
                  <span className="text-xs text-slate-500">{getTimeframeLabel(item.timeframe)}</span>
                  <span className="text-xs text-slate-600">|</span>
                  <span className={`text-xs font-medium ${getSignalColor(item.last_signal)}`}>
                    {getSignalLabel(item.last_signal)}
                  </span>
                  <span className="hidden sm:inline text-xs text-slate-600">|</span>
                  <span className="hidden sm:inline text-xs text-slate-500">{formatZoneRange(item)}</span>
                  <span className="hidden sm:inline text-xs text-slate-600">|</span>
                  <span className="hidden sm:inline text-xs text-slate-500">{item.exchange_account_label || `Acc #${item.exchange_account_id}`}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Link href={`/dashboard/supply-demand-screener/${item.id}/edit`}
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                    title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  <button onClick={() => handleToggle(item.id)}
                    className="p-1 text-slate-400 hover:text-white transition-colors"
                    title={item.enabled === 1 ? 'Disable' : 'Enable'}>
                    {item.enabled === 1 ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                  </button>
                  <button onClick={() => handleDelete(item.id)}
                    className="p-1 text-red-400 hover:text-red-300 transition-colors"
                    title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}