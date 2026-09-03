'use client';

import { useEffect, useState, useCallback } from 'react';
import { Bell, Plus, Trash2, Check, X } from 'lucide-react';
import engineFetch from '@/lib/api';
import type { PriceAlarm, Timeframe } from '@/lib/types';
import SymbolPicker from '@/components/SymbolPicker';
import { getSymbols } from '@/lib/symbols';

const TF_ORDER: Timeframe[] = ['m5', 'm15', 'h1', 'h4', 'd1', 'w1'];

const emptyForm = {
  symbol: '',
  timeframe: 'h1' as Timeframe,
  direction: 'cross_above' as 'cross_above' | 'cross_below',
  price_level: '',
};

export default function PriceAlarmsPage() {
  const [alarms, setAlarms] = useState<PriceAlarm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [displayBySymbol, setDisplayBySymbol] = useState<Record<string, string>>({});

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [telegramConfigured, setTelegramConfigured] = useState<boolean | null>(null);

  const fetchAlarms = useCallback(async () => {
    try {
      const res = await engineFetch('/api/price-alarms');
      if (!res.success) throw new Error(res.error || 'Failed to fetch');
      setAlarms(res.data || []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSymbolDisplays = useCallback(async () => {
    try {
      const options = await getSymbols('bybit');
      const map: Record<string, string> = {};
      for (const o of options) map[o.symbol] = o.display;
      setDisplayBySymbol(map);
    } catch {}
  }, []);

  const fetchMe = useCallback(async () => {
    try {
      const res = await engineFetch('/api/auth/me');
      if (res.success && res.data) {
        setTelegramConfigured(!!(res.data as { telegram_chat_id?: string }).telegram_chat_id);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchAlarms();
    fetchSymbolDisplays();
    fetchMe();
  }, [fetchAlarms, fetchSymbolDisplays, fetchMe]);

  function resetForm() {
    setForm({ ...emptyForm });
    setFormError(null);
    setShowForm(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const level = Number(form.price_level);
    if (!Number.isFinite(level) || level <= 0) {
      setFormError('Price level must be a positive number');
      return;
    }
    if (!form.symbol) {
      setFormError('Pick an asset');
      return;
    }

    setSubmitting(true);
    try {
      const res = await engineFetch('/api/price-alarms', {
        method: 'POST',
        body: JSON.stringify({
          symbol: form.symbol,
          timeframe: form.timeframe,
          direction: form.direction,
          price_level: level,
        }),
      });
      if (!res.success) throw new Error(res.error || 'Failed to create');
      resetForm();
      await fetchAlarms();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await engineFetch(`/api/price-alarms/${id}`, { method: 'DELETE' });
      if (!res.success) {
        setError(res.error || 'Delete failed');
        return;
      }
      setDeletingId(null);
      await fetchAlarms();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-400" />
          Price Alarms
        </h1>
        <button
          onClick={() => { setShowForm(!showForm); if (showForm) resetForm(); }}
          className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" />
          New Alarm
        </button>
      </div>

      {telegramConfigured === false && (
        <div className="mb-4 rounded-lg bg-yellow-900/30 border border-yellow-700/50 px-4 py-3 text-sm text-yellow-300">
          Set Telegram chat ID in <a href="/dashboard/settings" className="underline">Settings</a> to receive alerts.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg bg-red-900/30 border border-red-700/50 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {showForm && (
        <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-800 p-4 sm:p-6">
          <h2 className="mb-4 font-semibold text-white">Create Price Alarm</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-slate-400">Asset</label>
              <SymbolPicker
                value={form.symbol}
                onChange={(val) => setForm({ ...form, symbol: val })}
                exchange="bybit"
                placeholder="Select an asset..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-sm text-slate-400">Timeframe</label>
                <select
                  value={form.timeframe}
                  onChange={(e) => setForm({ ...form, timeframe: e.target.value as Timeframe })}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-white outline-none focus:border-blue-500"
                >
                  {TF_ORDER.map(tf => (
                    <option key={tf} value={tf}>{tf.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Direction</label>
                <div className="flex gap-3 pt-2">
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="radio"
                      checked={form.direction === 'cross_above'}
                      onChange={() => setForm({ ...form, direction: 'cross_above' })}
                    />
                    Cross Above
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300">
                    <input
                      type="radio"
                      checked={form.direction === 'cross_below'}
                      onChange={() => setForm({ ...form, direction: 'cross_below' })}
                    />
                    Cross Below
                  </label>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm text-slate-400">Price level</label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={form.price_level}
                  onChange={(e) => setForm({ ...form, price_level: e.target.value })}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-white outline-none focus:border-blue-500"
                  placeholder="e.g. 100000"
                  required
                />
              </div>
            </div>
            {formError && (
              <div className="rounded-lg bg-red-900/30 border border-red-700/50 px-3 py-2 text-sm text-red-400">
                {formError}
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Save'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-600"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="rounded-xl border border-slate-700/50 bg-slate-800">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          </div>
        ) : alarms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-500">
            <Bell className="mb-2 h-10 w-10" />
            <p>No active price alarms</p>
            <p className="text-sm">Click &ldquo;New Alarm&rdquo; to set one up</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="border-b border-slate-700/50">
                  <th className="px-4 py-3 text-slate-400 font-medium">Asset</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Timeframe</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Direction</th>
                  <th className="px-4 py-3 text-slate-400 font-medium text-right">Level</th>
                  <th className="px-4 py-3 text-slate-400 font-medium">Created</th>
                  <th className="px-4 py-3 text-slate-400 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {alarms.map((a) => (
                  <tr key={a.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-white font-mono text-xs">
                      {displayBySymbol[a.symbol] ? `${displayBySymbol[a.symbol]} (${a.symbol})` : a.symbol}
                    </td>
                    <td className="px-4 py-3 text-slate-300 uppercase">{a.timeframe}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        a.direction === 'cross_above'
                          ? 'bg-green-900/30 text-green-400'
                          : 'bg-red-900/30 text-red-400'
                      }`}>
                        {a.direction === 'cross_above' ? 'Cross Above' : 'Cross Below'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300 text-right font-mono">{a.price_level}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {new Date(a.created_at + 'Z').toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {deletingId === a.id ? (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDelete(a.id)}
                            className="rounded-lg p-1.5 text-red-400 hover:text-red-300 hover:bg-red-900/30"
                            title="Confirm delete"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setDeletingId(null)}
                            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50"
                            title="Cancel delete"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setDeletingId(a.id); setError(null); }}
                          className="rounded-lg p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-900/30"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}