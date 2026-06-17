'use client';

import type { SupplyDemandItem } from '@/lib/types';
import { Circle } from 'lucide-react';

interface SignalCellProps {
  item: SupplyDemandItem | undefined | null;
}

export default function SignalCell({ item }: SignalCellProps) {
  if (!item || !item.last_signal) {
    return <div className="px-2 py-1 text-xs text-slate-700">-</div>;
  }

  const isDemand = item.last_signal === 'demand';
  const zoneRange =
    item.last_zone_bottom && item.last_zone_top
      ? `${item.last_zone_bottom} - ${item.last_zone_top}`
      : '-';

  return (
    <div className="flex flex-col items-center px-2 py-1 space-y-0.5">
      <Circle
        className={`h-3 w-3 ${
          isDemand
            ? 'fill-green-500 stroke-green-500'
            : 'fill-red-500 stroke-red-500'
        }`}
      />
      <span className="text-xs text-slate-500 whitespace-nowrap">
        {zoneRange}
      </span>
    </div>
  );
}