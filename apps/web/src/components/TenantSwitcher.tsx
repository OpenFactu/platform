import { coreApi } from '@/shared/api';
import React, { useEffect, useRef, useState } from 'react';
import { Building, Check, ChevronsUpDown, Plus } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTabs } from '../context/TabsContext';
import { useToast } from '@openfactu/ui';

interface TenantRow {
  id: string;
  name: string;
}

export const TenantSwitcher: React.FC = () => {
  const { user, token, switchTenant } = useAuth();
  const toast = useToast();
  const { resetTabs, openTab } = useTabs();
  const [open, setOpen] = useState(false);
  const [tenants, setTenants] = useState<TenantRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const canCreate = user?.role === 'SUPERUSER' || user?.role === 'ADMIN';

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const load = async () => {
    if (tenants || !token) return;
    try {
      const res = await coreApi.raw('GET', '/api/tenants/mine');
      if (!res.ok) throw new Error('http');
      const data: TenantRow[] = res.data;
      setTenants(data);
    } catch {
      toast.error('No se pudieron cargar las empresas');
    }
  };

  const handleToggle = async () => {
    if (!open) await load();
    setOpen((o) => !o);
  };

  const handleSelect = async (tenantId: string) => {
    if (tenantId === user?.tenantId) {
      setOpen(false);
      return;
    }
    setBusy(true);
    try {
      await switchTenant(tenantId);
      toast.success('Empresa cambiada');
      setOpen(false);
      resetTabs('/');
    } catch (e: any) {
      toast.error(e.message || 'Error al cambiar de empresa');
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = () => {
    setOpen(false);
    openTab('/companies/new');
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        onClick={handleToggle}
        disabled={busy}
        className="w-full flex items-center gap-3 p-3 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 transition-all group disabled:opacity-50"
      >
        <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
          <Building size={14} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[9px] font-black uppercase text-slate-500 dark:text-slate-400 tracking-widest leading-none">
            Empresa activa
          </p>
          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
            {user?.tenantName || 'Sin empresa'}
          </p>
        </div>
        <ChevronsUpDown
          size={14}
          className="text-slate-500 dark:text-slate-400 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors"
        />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl overflow-hidden z-50">
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400">
              Tus empresas
            </p>
          </div>
          <ul className="max-h-64 overflow-auto py-1">
            {tenants === null ? (
              <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 italic">
                Cargando…
              </li>
            ) : tenants.length === 0 ? (
              <li className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 italic">
                Sin empresas accesibles
              </li>
            ) : (
              tenants.map((t) => {
                const active = t.id === user?.tenantId;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => handleSelect(t.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                        active
                          ? 'bg-primary/10 text-primary'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200'
                      }`}
                    >
                      <span className="flex-1 text-xs font-bold truncate">{t.name}</span>
                      {active && <Check size={14} className="text-primary" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {canCreate && (
            <div className="border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={handleCreate}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
              >
                <Plus size={14} />
                <span>Nueva empresa</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
