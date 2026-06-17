'use client';

import { RefreshCw } from 'lucide-react';

interface MarketHeaderProps {
  onRefresh: () => void;
  refreshing: boolean;
}

export default function MarketHeader({ onRefresh, refreshing }: MarketHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
      <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
        Supply/Demand Market
      </h1>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        className="flex items-center justify-center rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700 border border-slate-700/50"
        title="Refresh"
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}