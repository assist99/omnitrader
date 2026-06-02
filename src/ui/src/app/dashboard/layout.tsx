'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Activity, LayoutDashboard, LogOut, Settings, PlusCircle } from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<{ email: string } | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => res.json())
      .then((data) => {
        if (!data.success) {
          router.push('/');
        } else {
          setUser(data.data);
        }
      })
      .catch(() => router.push('/'));
  }, [router]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/');
  }

  if (!user) return null;

  return (
    <div className="flex h-screen flex-col bg-slate-900">
      <header className="flex items-center justify-between border-b border-slate-700/50 bg-slate-800/80 px-6 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <Link href="/dashboard" className="text-lg font-bold text-white">OmniTrader</Link>
        </div>

        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/accounts"
            className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition-colors ${
              pathname === '/dashboard/accounts' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="h-4 w-4" />
            Accounts
          </Link>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm text-slate-400 transition-colors hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Logout
          </button>
          <span className="text-sm text-slate-500">{user.email}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <nav className="flex w-56 flex-col border-r border-slate-700/50 bg-slate-800/40 p-4">
          <Link
            href="/dashboard"
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname === '/dashboard' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
          <Link
            href="/dashboard/setups/new"
            className={`mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
              pathname.includes('/setups/new') ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <PlusCircle className="h-4 w-4" />
            New Setup
          </Link>
          <div className="mt-auto pt-4 border-t border-slate-700/50">
            <p className="text-xs text-slate-600">OmniTrader v1.0</p>
          </div>
        </nav>

        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}