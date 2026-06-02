'use client';

import { useState, useEffect } from 'react';
import { Plus, Key } from 'lucide-react';
import type { BybitAccount } from '@/lib/types';

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<BybitAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [label, setLabel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiSecret, setApiSecret] = useState('');
  const [isTestnet, setIsTestnet] = useState(true);
  const [error, setError] = useState('');

  async function fetchAccounts() {
    setLoading(true);
    const res = await fetch('/api/accounts');
    const data = await res.json();
    if (data.success) setAccounts(data.data);
    setLoading(false);
  }

  useEffect(() => { fetchAccounts(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label, api_key: apiKey, api_secret: apiSecret, is_testnet: isTestnet }),
    });
    const data = await res.json();
    if (data.success) {
      setShowForm(false);
      setLabel('');
      setApiKey('');
      setApiSecret('');
      fetchAccounts();
    } else {
      setError(data.error || 'Failed to create account');
    }
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-white">Bybit Accounts</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 w-full sm:w-auto"
        >
          <Plus className="h-4 w-4" />
          Link Account
        </button>
      </div>

      {showForm && (
        <div className="mb-6 rounded-xl border border-slate-700/50 bg-slate-800 p-4 sm:p-6">
          <h2 className="mb-4 font-semibold text-white">Link Bybit Account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm text-slate-400">Label</label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-white outline-none focus:border-blue-500"
                placeholder="Main Account"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">API Key</label>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-white outline-none focus:border-blue-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-400">API Secret</label>
              <input
                type="password"
                value={apiSecret}
                onChange={(e) => setApiSecret(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-white outline-none focus:border-blue-500"
                required
              />
            </div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={isTestnet}
                onChange={(e) => setIsTestnet(e.target.checked)}
                className="rounded border-slate-600"
              />
              <span className="text-sm text-slate-400">Testnet</span>
            </label>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <button type="submit" className="w-full sm:w-auto rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              Save Account
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
        </div>
      ) : accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-500">
          <Key className="mb-2 h-10 w-10" />
          <p>No accounts linked</p>
          <p className="text-sm">Click "Link Account" to add a Bybit account</p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((acc) => (
            <div key={acc.id} className="rounded-xl border border-slate-700/50 bg-slate-800 p-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white">{acc.label}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {acc.is_testnet ? 'Testnet' : 'Mainnet'} • Created {new Date(acc.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${acc.is_testnet ? 'bg-yellow-900/30 text-yellow-400' : 'bg-green-900/30 text-green-400'}`}>
                  {acc.is_testnet ? 'Testnet' : 'Live'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}