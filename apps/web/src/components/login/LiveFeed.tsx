import React, { useEffect, useState } from 'react';
import { TrendingUp, Package, FileText, Truck, ShoppingCart, CheckCircle2 } from 'lucide-react';

interface FeedItem {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  color: string;
}

const ITEMS: FeedItem[] = [
  { icon: TrendingUp, label: 'Factura cobrada', value: '+€12.480,00', color: 'text-emerald-300' },
  { icon: FileText, label: 'INV-2026-0042 emitida', value: '€3.260,00', color: 'text-cyan-300' },
  { icon: Package, label: 'Stock reabastecido', value: '+142 uds', color: 'text-teal-300' },
  { icon: Truck, label: 'Albarán firmado', value: 'ALB-0087', color: 'text-sky-300' },
  { icon: ShoppingCart, label: 'Pedido de compra', value: '€8.910,00', color: 'text-blue-300' },
  { icon: CheckCircle2, label: 'Lote confirmado', value: 'LOT-2026-11', color: 'text-emerald-300' },
  { icon: TrendingUp, label: 'Nuevo cliente', value: 'CLI-2431', color: 'text-violet-300' },
];

/** Feed "vivo" que rota eventos simulados de un ERP en funcionamiento. */
export const LiveFeed: React.FC = () => {
  const [idx, setIdx] = useState(0);
  const [age, setAge] = useState(3);

  useEffect(() => {
    const rotate = setInterval(() => {
      setIdx((i) => (i + 1) % ITEMS.length);
      setAge(1 + Math.floor(Math.random() * 4));
    }, 2600);
    const tick = setInterval(() => setAge((a) => a + 1), 1000);
    return () => {
      clearInterval(rotate);
      clearInterval(tick);
    };
  }, []);

  const item = ITEMS[idx];
  const Icon = item.icon;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-[4px] border border-white/10 bg-white/5 backdrop-blur-sm">
      <div className="relative shrink-0">
        <span className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" />
        <span className="relative block w-2 h-2 rounded-full bg-emerald-400" />
      </div>
      <Icon size={16} className={item.color} />
      <div className="flex-1 min-w-0">
        <p
          key={idx}
          className="text-[13px] font-semibold text-white truncate animate-in fade-in slide-in-from-bottom-1 duration-500"
        >
          {item.label} <span className={`font-mono text-[12px] ${item.color}`}>{item.value}</span>
        </p>
      </div>
      <span className="font-mono text-[10px] text-white/40 tracking-wider tabular-nums shrink-0">
        {age}s
      </span>
    </div>
  );
};
