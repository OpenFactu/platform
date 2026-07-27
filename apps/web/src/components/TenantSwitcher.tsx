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
        className="w-full flex items-center gap-3 p-3 rounded-xs bg-bg-card border border-border-default hover:bg-bg-hover transition-all group disabled:opacity-50"
      >
        <div className="p-1.5 rounded-xs bg-accent/10 text-accent">
          <Building size={14} />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[9px] font-black uppercase text-fg-subtle tracking-widest leading-none">
            Empresa activa
          </p>
          <p className="text-xs font-bold text-fg-default truncate mt-0.5">
            {user?.tenantName || 'Sin empresa'}
          </p>
        </div>
        <ChevronsUpDown
          size={14}
          className="text-fg-subtle group-hover:text-fg-body transition-colors"
        />
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 bg-bg-card border border-border-default rounded-xs shadow-k-lg overflow-hidden z-dropdown">
          <div className="px-3 py-2.5 border-b border-border-default">
            <p className="text-[9px] font-black uppercase tracking-widest text-fg-subtle">
              Tus empresas
            </p>
          </div>
          <ul className="max-h-64 overflow-auto py-1 divide-y divide-border-subtle">
            {tenants === null ? (
              <li className="px-3 py-3 text-xs text-fg-subtle italic">Cargando…</li>
            ) : tenants.length === 0 ? (
              <li className="px-3 py-3 text-xs text-fg-subtle italic">Sin empresas accesibles</li>
            ) : (
              tenants.map((t) => {
                const active = t.id === user?.tenantId;
                const initial = (t.name || '?').trim().charAt(0).toUpperCase();
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => handleSelect(t.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                        active
                          ? 'bg-accent/10 border-l-2 border-accent'
                          : 'border-l-2 border-transparent hover:bg-bg-hover'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xs text-[11px] font-bold ${
                          active ? 'bg-accent text-accent-fg' : 'bg-bg-muted text-fg-subtle'
                        }`}
                      >
                        {initial}
                      </span>
                      <span
                        className={`flex-1 text-xs font-bold truncate ${
                          active ? 'text-fg-default' : 'text-fg-body'
                        }`}
                      >
                        {t.name}
                      </span>
                      {active && (
                        <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-accent text-accent-fg">
                          <Check size={11} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
          {canCreate && (
            <div className="border-t border-border-default">
              <button
                onClick={handleCreate}
                className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs font-bold text-success-fg hover:bg-success-bg transition-colors"
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
