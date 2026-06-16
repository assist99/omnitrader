'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X } from 'lucide-react';
import { getSymbols } from '@/lib/symbols';

interface SymbolPickerProps {
  value: string;
  onChange: (value: string) => void;
  exchange: string;
  placeholder?: string;
  disabled?: boolean;
}

export default function SymbolPicker({
  value,
  onChange,
  exchange,
  placeholder = 'Select symbol...',
  disabled = false,
}: SymbolPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const options = useMemo(() => getSymbols(exchange), [exchange]);

  const filtered = useMemo(
    () =>
      options.filter((o) =>
        o.symbol.toLowerCase().includes(query.toLowerCase()) ||
        o.display.toLowerCase().includes(query.toLowerCase())
      ),
    [options, query]
  );

  const selected = options.find((o) => o.symbol === value);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((prev) => Math.min(prev + 1, Math.max(0, filtered.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlighted]) {
        onChange(filtered[highlighted].symbol);
        setOpen(false);
        setQuery('');
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  }

  return (
    <div ref={ref} className={`relative ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
        className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2.5 text-left text-white outline-none focus:border-blue-500 flex items-center justify-between"
      >
        <span className={selected ? '' : 'text-slate-500'}>
          {selected ? `${selected.symbol} (${selected.display})` : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 w-full mt-1 rounded-lg border border-slate-600 bg-slate-800 shadow-xl">
          <div className="flex items-center gap-2 px-3 border-b border-slate-700">
            <Search className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search symbols..."
              className="w-full bg-transparent py-2.5 text-sm text-white placeholder-slate-500 outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => { setQuery(''); inputRef.current?.focus(); }}
                className="text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-slate-500">No symbols found</p>
            ) : (
              filtered.map((o, i) => (
                <button
                  key={o.symbol}
                  type="button"
                  onClick={() => {
                    onChange(o.symbol);
                    setOpen(false);
                    setQuery('');
                  }}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`w-full px-3 py-2 text-left text-sm flex justify-between items-center ${
                    o.symbol === value
                      ? 'bg-blue-600/20 text-blue-400'
                      : i === highlighted
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <span>{o.symbol}</span>
                  <span className="text-xs text-slate-500">{o.display}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
