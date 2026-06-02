'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Edit3, XCircle } from 'lucide-react';
import type { TradingSetup, Order } from '@/lib/types';
import { TIMEFRAMES, INDICATORS, STATUS_STYLES, parseTpPrices } from '@/lib/constants';

const ORDER_TYPE_LABELS: Record<string, string> = {
  entry: 'Entry',
  tp1: 'TP 1', tp2: 'TP 2', tp3: 'TP 3', tp4: 'TP 4',
  sl: 'Stop Loss',
};

function formatTf(tf: string) {
  return TIMEFRAMES.find(t => t.value === tf)?.label || tf;
}

function formatIndicator(ind: string) {
  return INDICATORS.find(i => i.value === ind)?.label || ind;
}

export default function SetupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [setup, setSetup] = useState<(TradingSetup & { account_label?: string }) | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/setups/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          const { orders: ords, ...rest } = data.data;
          setSetup(rest);
          setOrders(ords || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleCancel() {
    if (!confirm('Cancel this trading setup?')) return;
    const res = await fetch(`/api/setups/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      setSetup(data.data);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
      </div>
    );
  }

  if (!setup) {
    return <div className="text-slate-500 py-20 text-center">Setup not found</div>;
  }

  const tpArr = parseTpPrices(setup.tp_prices);

  return (
    <div>
      <button
        onClick={() => router.push('/dashboard')}
        className="mb-4 flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </button>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-white">{setup.symbol}</h1>
            <span className={`inline-flex items-center rounded-full border px-3 py-0.5 text-xs font-medium ${STATUS_STYLES[setup.status] || ''}`}>
              {setup.status.charAt(0).toUpperCase() + setup.status.slice(1)}
            </span>
            <span className={`text-sm font-medium ${setup.side === 'long' ? 'text-green-400' : 'text-red-400'}`}>
              {setup.side.toUpperCase()}
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            {setup.account_label || `Account #${setup.account_id}`} • Created {new Date(setup.created_at).toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          {(setup.status === 'pending' || setup.status === 'triggered' || setup.status === 'active') && (
            <>
              <button
                onClick={() => router.push(`/dashboard/setups/${id}/edit${setup.status === 'active' ? '?mode=be' : ''}`)}
                className="flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-sm text-white hover:bg-slate-600"
              >
                <Edit3 className="h-4 w-4" />
                {setup.status === 'active' ? 'Edit BE / Exit' : 'Edit'}
              </button>
              <button
                onClick={handleCancel}
                className="flex items-center gap-1.5 rounded-lg bg-red-900/30 px-3 py-2 text-sm text-red-400 hover:bg-red-900/50"
              >
                <XCircle className="h-4 w-4" />
                Cancel
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="rounded-xl border border-slate-700/50 bg-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Entry Configuration</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Activation Price</dt>
              <dd className="text-sm font-mono text-white">{setup.activation_price}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Ignore Box</dt>
              <dd className="text-sm font-mono text-white">{setup.ignore_box_lower} — {setup.ignore_box_upper}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Indicator</dt>
              <dd className="text-sm text-white">{formatIndicator(setup.entry_indicator_type)} ({formatTf(setup.entry_indicator_tf)})</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border border-slate-700/50 bg-slate-800 p-5">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Risk & TP</h3>
          <dl className="space-y-3">
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Risk</dt>
              <dd className="text-sm text-white">{setup.risk_type === 'percent' ? `${setup.risk_value}%` : `$${setup.risk_value}`}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Stop Loss</dt>
              <dd className="text-sm font-mono text-white">{setup.sl_price > 0 ? setup.sl_price : 'Auto'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">TP Levels (RR)</dt>
              <dd className="text-sm font-mono text-white">{tpArr.join(' : ')}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-sm text-slate-500">Break Even</dt>
              <dd className="text-sm text-white">{setup.be_enabled ? `Yes (${setup.be_trigger_price})` : 'No'}</dd>
            </div>
          </dl>
        </div>

        {setup.exit_indicator_type && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800 p-5">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Exit Condition</h3>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500">Indicator</dt>
                <dd className="text-sm text-white">{formatIndicator(setup.exit_indicator_type)} ({formatTf(setup.exit_indicator_tf || '')})</dd>
              </div>
            </dl>
          </div>
        )}

        {setup.memo && (
          <div className="rounded-xl border border-slate-700/50 bg-slate-800 p-5">
            <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Memo</h3>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">{setup.memo}</p>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-slate-700/50 bg-slate-800 p-5">
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">Orders</h3>
        {orders.length === 0 ? (
          <p className="text-sm text-slate-500">No orders yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Type</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Side</th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">Price</th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">Qty</th>
                  <th className="text-right py-2 px-3 text-slate-500 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.id} className="border-b border-slate-700/50">
                    <td className="py-2.5 px-3 text-white">{ORDER_TYPE_LABELS[order.order_type] || order.order_type}</td>
                    <td className={`py-2.5 px-3 font-medium ${order.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                      {order.side.toUpperCase()}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-white">{order.price}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-white">{order.qty}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        order.status === 'filled' ? 'text-green-400 bg-green-900/20' :
                        order.status === 'pending' ? 'text-yellow-400 bg-yellow-900/20' :
                        'text-red-400 bg-red-900/20'
                      }`}>
                        {order.status}
                      </span>
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