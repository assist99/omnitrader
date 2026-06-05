'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import engineFetch from '@/lib/api';
import { TIMEFRAMES, INDICATORS } from '@/lib/constants';
import type { ExchangeAccount, ScreenerFormData, Timeframe, ScreenerIndicatorType } from '@/lib/types';

export default function NewScreenerPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [formData, setFormData] = useState<ScreenerFormData>({
    exchange_account_id: 0,
    symbol: '',
    timeframe: 'h1',
    indicator_type: 'supertrend',
    indicator_params: {}
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

  function updateField<K extends keyof ScreenerFormData>(key: K, value: ScreenerFormData[K]) {
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
      indicator_type: formData.indicator_type,
      indicator_params: formData.indicator_params
    };

    const data = await engineFetch('/api/screener', { method: 'POST', body: JSON.stringify(payload) });
    setSubmitting(false);

    if (data.success) {
      router.push('/dashboard/screener');
    } else {
      setError(data.error || 'Failed to create screener');
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

      <h1 className="text-2xl font-bold text-white mb-6">New Screener Item</h1>

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
              <input
                type="text"
                value={formData.symbol}
                onChange={(e) => updateField('symbol', e.target.value.toUpperCase())}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2.5 text-white placeholder-slate-500 outline-none focus:border-blue-500"
                placeholder="BTCUSDT"
                required
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
              <label className="mb-1 block text-sm text-slate-400">Indicator</label>
              <select
                value={formData.indicator_type}
                onChange={(e) => updateField('indicator_type', e.target.value as ScreenerIndicatorType)}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2.5 text-white outline-none focus:border-blue-500"
              >
                {INDICATORS.map((ind) => (
                  <option key={ind.value} value={ind.value}>{ind.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="submit"
            disabled={submitting || accounts.length === 0}
            className="rounded-lg bg-blue-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50 w-full sm:w-auto"
          >
            {submitting ? 'Creating...' : 'Create Screener'}
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