'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import engineFetch from '@/lib/api';
import { TIMEFRAMES } from '@/lib/constants';
import type { ExchangeAccount, SupplyDemandFormData, SupplyDemandIndicatorParams, Timeframe } from '@/lib/types';
import SymbolPicker from '@/components/SymbolPicker';

export default function NewSupplyDemandScreenerPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<SupplyDemandFormData>({
    exchange_account_id: 0,
    symbol: '',
    timeframe: 'h1',
    indicator_params: {
      bodyTolerance: 0.2,
      minWickOverlapRate: 0.1,
      checkCandle0Dir: true
    }
  });

  useEffect(() => {
    (async () => {
      try {
        const data = await engineFetch('/api/accounts');
        if (data.success) {
          setAccounts(data.data);
          if (data.data.length > 0 && formData.exchange_account_id === 0) {
            updateField('exchange_account_id', data.data[0].id);
          }
        }
      } catch {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField<K extends keyof SupplyDemandFormData>(key: K, value: SupplyDemandFormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    const payload = {
      exchange_account_id: formData.exchange_account_id,
      symbol: formData.symbol.toUpperCase(),
      timeframe: formData.timeframe,
      // indicator_type is fixed to 'supply_demand'
      indicator_params: formData.indicator_params
    };

    const data = await engineFetch('/api/supply-demand', { method: 'POST', body: JSON.stringify(payload) });
    setSubmitting(false);

    if (data.success) {
      router.push('/dashboard/supply-demand-screener');
    } else {
      setError(data.error || 'Failed to create supply/demand screener');
    }
  }

  return (
    <div>
      <button
        onClick={() => router.back()}
        className="mb-4 flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      <h1 className="text-2xl font-bold text-white mb-6">New Supply/Demand Screener Item</h1>

      {error && (
        <div className="rounded-lg bg-red-900/30 border border-red-800 px-4 py-3 text-sm text-red-400 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800 p-4 sm:p-6">
          <h2 className="mb-4 font-semibold text-white flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">1</span>
            Screener Settings
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-slate-400">Account</label>
              <select
                value={formData.exchange_account_id}
                onChange={(e) => updateField('exchange_account_id', Number(e.target.value))}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2.5 text-white outline-none focus:border-blue-500"
                required
              >
                <option value={0} disabled>Select account</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.label} ({acc.is_testnet ? 'Testnet' : 'Mainnet'})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Symbol</label>
              <SymbolPicker
                value={formData.symbol}
                onChange={(val) => updateField('symbol', val.toUpperCase())}
                exchange={accounts.find(a => a.id === formData.exchange_account_id)?.exchange || 'bybit'}
                placeholder="Select symbol..."
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Timeframe</label>
              <select
                value={formData.timeframe}
                onChange={(e) => updateField('timeframe', e.target.value as Timeframe)}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2.5 text-white outline-none focus:border-blue-500"
              >
                {TIMEFRAMES.map((tf) => (
                  <option key={tf.value} value={tf.value}>{tf.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Indicator Type</label>
              <div className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2.5 text-slate-300">
                Supply/Demand Zone Detection
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Uses PineScript algorithm to detect supply/demand zones based on wick overlap patterns.
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800 p-4 sm:p-6">
          <h2 className="mb-4 font-semibold text-white flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs text-white">2</span>
            Advanced Parameters (Optional)
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm text-slate-400">Body Tolerance</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="5"
                value={formData.indicator_params?.bodyTolerance || 0.5}
                onChange={(e) => {
                  const params = { ...formData.indicator_params, bodyTolerance: parseFloat(e.target.value) };
                  updateField('indicator_params', params);
                }}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2.5 text-white outline-none focus:border-blue-500"
                placeholder="0.5"
              />
              <p className="mt-1 text-xs text-slate-500">Breakout body magnitude multiplier</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">Min Wick Overlap Rate</label>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                value={formData.indicator_params?.minWickOverlapRate || 0.1}
                onChange={(e) => {
                  const params = { ...formData.indicator_params, minWickOverlapRate: parseFloat(e.target.value) };
                  updateField('indicator_params', params);
                }}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2.5 text-white outline-none focus:border-blue-500"
                placeholder="0.1"
              />
              <p className="mt-1 text-xs text-slate-500">Minimum wick overlap rate (0.0 - 1.0)</p>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400 flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.indicator_params?.checkCandle0Dir !== false}
                  onChange={(e) => {
                    const params = { ...formData.indicator_params, checkCandle0Dir: e.target.checked };
                    updateField('indicator_params', params);
                  }}
                  className="h-4 w-4"
                />
                Check Direction of Candle 0
              </label>
              <p className="mt-1 text-xs text-slate-500">
                Verify that candle 0 closes beyond the wicks of candles 1 & 2
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={submitting || accounts.length === 0}
            className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 w-full sm:w-auto"
          >
            {submitting ? 'Creating...' : 'Create Supply/Demand Screener'}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-slate-600 px-6 py-2.5 font-medium text-slate-300 transition-colors hover:bg-slate-700 w-full sm:w-auto"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}