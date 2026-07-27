/**
 * Cockpit del servidor — métricas en vivo (CPU, RAM, disco, Postgres, tenants)
 * con sparklines in-memory y panel de servicios.
 *
 * Solo accesible por SUPERUSER (el endpoint backend devuelve 403 al resto).
 *
 * Polling cada 3s mientras la página esté visible. Mantenemos un anillo de
 * los últimos 60 samples (3 min) en memoria del navegador para dibujar los
 * sparklines sin depender de ninguna librería de charts.
 */

import { coreApi } from '@/shared/api';
import React, { useEffect, useState, useRef } from 'react';
import {
  Cpu,
  MemoryStick,
  HardDrive,
  Database,
  Building,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Server,
  Network,
  Globe,
  Puzzle,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface Metrics {
  cpu: { model: string; cores: number; loadAvg: number[]; usagePct: number };
  memory: { totalMB: number; freeMB: number; usedMB: number; usedPct: number };
  disk: { storagePath: string; totalGB: number; usedGB: number; freeGB: number; usedPct: number };
  process: {
    uptimeSec: number;
    pid: number;
    nodeVersion: string;
    platform: string;
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
  postgres: { connectionsActive: number; connectionsMax: number; dbSizeMB: number } | null;
  tenants: { total: number; schemas: Array<{ name: string; sizeMB: number }> };
  host: {
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    timezone: string;
    interfaces: Array<{ name: string; address: string; family: string }>;
  };
  requests: {
    total: number;
    errors: number;
    errorRatePct: number;
    avgPerSec: number;
    byStatusClass: { '2xx': number; '3xx': number; '4xx': number; '5xx': number };
    byMethod: Record<string, number>;
    uptimeSec: number;
  };
  version: string;
  collectedAt: string;
}

interface PluginInfo {
  id: string;
  name: string;
  version?: string;
  loaded: boolean;
}

type ServiceStatus = 'ok' | 'warn' | 'down';
interface ServiceCheck {
  id: string;
  label: string;
  status: ServiceStatus;
  detail: string;
  latencyMs?: number;
}

const HISTORY_LEN = 60; // 60 samples × 3s ≈ 3 minutos visibles.

export const ServerCockpit: React.FC = () => {
  const { token } = useAuth();
  const [m, setM] = useState<Metrics | null>(null);
  const [services, setServices] = useState<ServiceCheck[] | null>(null);
  const [plugins, setPlugins] = useState<PluginInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<any>(null);
  // Para calcular req/s necesitamos el total absoluto del sample anterior.
  const prevTotalRef = useRef<number | null>(null);

  // Histórico para sparklines (anillo en memoria).
  const [history, setHistory] = useState<{
    cpu: number[];
    mem: number[];
    heap: number[];
    pg: number[];
    req: number[];
  }>({ cpu: [], mem: [], heap: [], pg: [], req: [] });

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const [metricsRes, servicesRes] = await Promise.all([
          coreApi.raw('GET', '/api/system/metrics'),
          coreApi.raw('GET', '/api/system/services'),
        ]);
        if (metricsRes.status === 403 || servicesRes.status === 403) {
          setError('Solo SUPERUSER puede ver este cockpit.');
          return;
        }
        if (!metricsRes.ok) throw new Error(`HTTP ${metricsRes.status}`);
        const data: Metrics = metricsRes.data;
        const servicesPayload = servicesRes.ok ? servicesRes.data : null;
        if (cancelled) return;
        setM(data);
        if (servicesPayload) {
          setServices(servicesPayload.services || null);
          setPlugins(servicesPayload.plugins || null);
        }
        setError(null);
        // Delta de req/s: (total_ahora - total_anterior) / 3s. En el primer
        // sample no tenemos referencia, así que metemos 0.
        const prevTotal = prevTotalRef.current;
        const reqPerSec =
          prevTotal != null ? Math.max(0, (data.requests.total - prevTotal) / 3) : 0;
        prevTotalRef.current = data.requests.total;
        // Añadir sample al anillo.
        setHistory((h) => ({
          cpu: pushRing(h.cpu, data.cpu.usagePct),
          mem: pushRing(h.mem, data.memory.usedPct),
          heap: pushRing(h.heap, data.process.heapUsedMB),
          pg: pushRing(
            h.pg,
            data.postgres && data.postgres.connectionsMax > 0
              ? (data.postgres.connectionsActive * 100) / data.postgres.connectionsMax
              : 0,
          ),
          req: pushRing(h.req, reqPerSec),
        }));
      } catch (e) {
        if (!cancelled)
          setError(
            (e instanceof Error ? (e instanceof Error ? e.message : undefined) : undefined) ||
              'Error',
          );
      }
    };
    tick();
    const start = () => {
      if (timerRef.current) return;
      timerRef.current = setInterval(tick, 3000);
    };
    const stop = () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
    start();
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [token]);

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 text-primary rounded-lg">
            <Activity size={22} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-fg-default">Cockpit del servidor</h1>
            <p className="text-sm text-fg-muted">
              Métricas en vivo del proceso, host y base de datos. Refresco cada 3s.
            </p>
          </div>
        </div>
        {m && (
          <div className="flex flex-col items-end text-xs">
            <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 text-primary font-mono font-bold">
              <Server size={12} /> Keirost v{m.version}
            </span>
            <span className="mt-1 text-[10px] text-slate-400 font-mono">
              {m.process.nodeVersion} · {m.process.platform}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-sm">
          ⚠ {error}
        </div>
      )}

      {!m ? (
        <div className="text-sm text-slate-400 italic">Cargando métricas…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <MetricCard
            icon={<Cpu size={18} />}
            title="CPU"
            value={`${m.cpu.usagePct.toFixed(1)}%`}
            subtitle={`${m.cpu.cores} núcleos · load ${m.cpu.loadAvg.map((n) => n.toFixed(2)).join(' ')}`}
            barPct={m.cpu.usagePct}
            history={history.cpu}
            maxY={100}
          />
          <MetricCard
            icon={<MemoryStick size={18} />}
            title="Memoria"
            value={`${m.memory.usedPct.toFixed(1)}%`}
            subtitle={`${formatMB(m.memory.usedMB)} / ${formatMB(m.memory.totalMB)}`}
            barPct={m.memory.usedPct}
            history={history.mem}
            maxY={100}
          />
          <MetricCard
            icon={<HardDrive size={18} />}
            title="Disco"
            value={`${m.disk.usedPct.toFixed(1)}%`}
            subtitle={`${m.disk.usedGB.toFixed(1)} / ${m.disk.totalGB.toFixed(1)} GB · ${m.disk.storagePath}`}
            barPct={m.disk.usedPct}
          />
          <MetricCard
            icon={<Database size={18} />}
            title="PostgreSQL"
            value={
              m.postgres
                ? `${m.postgres.connectionsActive}/${m.postgres.connectionsMax}`
                : 'sin datos'
            }
            subtitle={m.postgres ? `${m.postgres.dbSizeMB.toFixed(1)} MB de BD` : ''}
            barPct={
              m.postgres && m.postgres.connectionsMax > 0
                ? (m.postgres.connectionsActive * 100) / m.postgres.connectionsMax
                : 0
            }
            history={history.pg}
            maxY={100}
          />
          <MetricCard
            icon={<MemoryStick size={18} />}
            title="Heap Node"
            value={`${m.process.heapUsedMB.toFixed(1)} MB`}
            subtitle={`de ${m.process.heapTotalMB.toFixed(1)} MB reservados · RSS ${m.process.rssMB.toFixed(0)} MB`}
            barPct={
              m.process.heapTotalMB ? (m.process.heapUsedMB * 100) / m.process.heapTotalMB : 0
            }
            history={history.heap}
          />
          <MetricCard
            icon={<Activity size={18} />}
            title="Uptime"
            value={formatSec(m.process.uptimeSec)}
            subtitle={`PID ${m.process.pid}`}
            barPct={0}
            hideBar
          />
        </div>
      )}

      {services && (
        <div className="rounded-xl border border-border-default bg-bg-card p-5">
          <div className="flex items-center gap-2 text-fg-body mb-3">
            <Server size={16} />
            <h2 className="text-sm font-bold uppercase tracking-wider">Servicios</h2>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {services.map((s) => (
              <ServiceRow key={s.id} svc={s} />
            ))}
          </ul>
        </div>
      )}

      {m && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <HostPanel host={m.host} />
          <TrafficPanel requests={m.requests} history={history.req} />
        </div>
      )}

      {plugins && plugins.length > 0 && (
        <div className="rounded-xl border border-border-default bg-bg-card p-5">
          <div className="flex items-center gap-2 text-fg-body mb-3">
            <Puzzle size={16} />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Plugins cargados ({plugins.length})
            </h2>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {plugins.map((p) => (
              <li
                key={p.id}
                className="flex items-start justify-between gap-2 p-2 rounded-lg border border-border-subtle"
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-fg-default truncate">{p.name}</div>
                  <div className="text-[10px] font-mono text-slate-400 truncate">{p.id}</div>
                </div>
                <div className="flex flex-col items-end text-[10px] flex-shrink-0">
                  {p.version && <span className="font-mono text-slate-500">v{p.version}</span>}
                  <span
                    className={
                      p.loaded
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }
                  >
                    {p.loaded ? 'cargado' : 'solo manifest'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {m && (
        <div className="rounded-xl border border-border-default bg-bg-card p-5">
          <div className="flex items-center gap-2 text-fg-body mb-3">
            <Building size={16} />
            <h2 className="text-sm font-bold uppercase tracking-wider">
              Empresas ({m.tenants.total})
            </h2>
          </div>
          {m.tenants.schemas.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No hay empresas registradas.</p>
          ) : (
            <table className="w-full text-xs">
              <thead className="text-fg-muted">
                <tr>
                  <th className="text-left py-1">Empresa</th>
                  <th className="text-right py-1">Tamaño</th>
                </tr>
              </thead>
              <tbody>
                {m.tenants.schemas.map((t) => (
                  <tr key={t.name} className="border-t border-border-subtle">
                    <td className="py-1.5 font-mono">{t.name}</td>
                    <td className="py-1.5 text-right tabular-nums">{t.sizeMB.toFixed(1)} MB</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {m && (
        <div className="text-[10px] text-slate-400 text-right">
          Última lectura: {new Date(m.collectedAt).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

const MetricCard: React.FC<{
  icon: React.ReactNode;
  title: string;
  value: string;
  subtitle: string;
  barPct: number;
  history?: number[];
  maxY?: number;
  hideBar?: boolean;
}> = ({ icon, title, value, subtitle, barPct, history, maxY, hideBar }) => (
  <div className="rounded-xl border border-border-default bg-bg-card p-5 flex flex-col">
    <div className="flex items-center gap-2 text-fg-body mb-2">
      {icon}
      <h3 className="text-xs font-bold uppercase tracking-wider">{title}</h3>
    </div>
    <div className="flex items-baseline gap-2">
      <span className="text-3xl font-bold text-fg-default tabular-nums">{value}</span>
    </div>
    {!hideBar && (
      <div className="mt-2 h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
        <div
          className={`h-full transition-all ${
            barPct > 85 ? 'bg-rose-500' : barPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(100, barPct)}%` }}
        />
      </div>
    )}
    {history && history.length > 1 && (
      <div className="mt-3">
        <Sparkline data={history} maxY={maxY} color={colorForPct(barPct)} />
      </div>
    )}
    <p className="mt-2 text-[10px] text-fg-muted truncate" title={subtitle}>
      {subtitle}
    </p>
  </div>
);

/**
 * Sparkline SVG sin librerías. Normaliza el array `data` a un viewBox 100×30.
 * Si `maxY` se pasa, lo usa como máximo fijo (ej: 100 para %). Si no, usa
 * max del propio array (auto-escala).
 */
const Sparkline: React.FC<{ data: number[]; maxY?: number; color: string }> = ({
  data,
  maxY,
  color,
}) => {
  const w = 100;
  const h = 30;
  const effectiveMax = maxY ?? Math.max(...data, 1);
  const stepX = data.length > 1 ? w / (data.length - 1) : 0;
  const points = data
    .map((v, i) => `${(i * stepX).toFixed(2)},${(h - (v / effectiveMax) * h).toFixed(2)}`)
    .join(' ');
  const areaPoints = `0,${h} ${points} ${w},${h}`;
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-8"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polygon points={areaPoints} fill={color} opacity={0.15} />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
    <div className="text-sm font-mono text-fg-body truncate" title={value}>
      {value}
    </div>
  </div>
);

const HostPanel: React.FC<{ host: Metrics['host'] }> = ({ host }) => (
  <div className="rounded-xl border border-border-default bg-bg-card p-5">
    <div className="flex items-center gap-2 text-fg-body mb-3">
      <Globe size={16} />
      <h2 className="text-sm font-bold uppercase tracking-wider">Host</h2>
    </div>
    <div className="grid grid-cols-2 gap-3 text-xs mb-3">
      <Stat label="Hostname" value={host.hostname} />
      <Stat label="Timezone" value={host.timezone} />
      <Stat label="Platform" value={`${host.platform} ${host.release}`} />
      <Stat label="Arch" value={host.arch} />
    </div>
    {host.interfaces.length > 0 && (
      <>
        <div className="flex items-center gap-2 text-fg-muted mb-1">
          <Network size={12} />
          <span className="text-[10px] font-bold uppercase tracking-wider">Interfaces de red</span>
        </div>
        <ul className="text-[11px] font-mono space-y-0.5">
          {host.interfaces.map((iface, i) => (
            <li
              key={`${iface.name}-${iface.address}-${i}`}
              className="flex justify-between text-fg-body border-t border-border-subtle py-0.5"
            >
              <span className="text-slate-500">{iface.name}</span>
              <span className="tabular-nums">{iface.address}</span>
              <span className="text-slate-400 text-[10px]">{iface.family}</span>
            </li>
          ))}
        </ul>
      </>
    )}
  </div>
);

const TrafficPanel: React.FC<{
  requests: Metrics['requests'];
  history: number[];
}> = ({ requests, history }) => {
  const total = requests.total || 1;
  const classes = requests.byStatusClass;
  const methods = Object.entries(requests.byMethod).sort((a, b) => b[1] - a[1]);
  const peak = Math.max(...history, 1);
  return (
    <div className="rounded-xl border border-border-default bg-bg-card p-5">
      <div className="flex items-center gap-2 text-fg-body mb-3">
        <Activity size={16} />
        <h2 className="text-sm font-bold uppercase tracking-wider">Tráfico HTTP</h2>
      </div>
      <div className="grid grid-cols-3 gap-3 text-xs mb-3">
        <Stat label="Total" value={requests.total.toLocaleString()} />
        <Stat
          label="Errores 5xx"
          value={`${requests.errors} (${requests.errorRatePct.toFixed(1)}%)`}
        />
        <Stat label="Avg req/s" value={requests.avgPerSec.toFixed(2)} />
      </div>
      {/* Barra stacked por status class */}
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden flex mb-1">
        <div
          className="bg-emerald-500 h-full"
          style={{ width: `${(classes['2xx'] * 100) / total}%` }}
          title={`2xx: ${classes['2xx']}`}
        />
        <div
          className="bg-sky-500 h-full"
          style={{ width: `${(classes['3xx'] * 100) / total}%` }}
          title={`3xx: ${classes['3xx']}`}
        />
        <div
          className="bg-amber-500 h-full"
          style={{ width: `${(classes['4xx'] * 100) / total}%` }}
          title={`4xx: ${classes['4xx']}`}
        />
        <div
          className="bg-rose-500 h-full"
          style={{ width: `${(classes['5xx'] * 100) / total}%` }}
          title={`5xx: ${classes['5xx']}`}
        />
      </div>
      <div className="flex gap-3 text-[10px] font-mono text-slate-500 mb-3">
        <span className="text-emerald-600">2xx {classes['2xx']}</span>
        <span className="text-sky-600">3xx {classes['3xx']}</span>
        <span className="text-amber-600">4xx {classes['4xx']}</span>
        <span className="text-rose-600">5xx {classes['5xx']}</span>
      </div>
      {/* Sparkline req/s */}
      {history.length > 1 && (
        <div className="mb-2">
          <Sparkline data={history} color="#0ea5e9" />
          <p className="text-[10px] text-slate-400 mt-0.5">
            req/s en los últimos {history.length} samples · pico {peak.toFixed(1)}
          </p>
        </div>
      )}
      {methods.length > 0 && (
        <table className="w-full text-[11px] mt-2">
          <tbody>
            {methods.map(([method, count]) => (
              <tr key={method} className="border-t border-border-subtle">
                <td className="py-1 font-mono font-bold text-fg-body">{method}</td>
                <td className="py-1 text-right tabular-nums text-slate-500">{count}</td>
                <td className="py-1 w-1/2 pl-2">
                  <div className="h-1 rounded-full bg-bg-muted overflow-hidden">
                    <div
                      className="h-full bg-sky-500"
                      style={{ width: `${(count * 100) / total}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const ServiceRow: React.FC<{ svc: ServiceCheck }> = ({ svc }) => {
  const Icon = svc.status === 'ok' ? CheckCircle2 : svc.status === 'warn' ? AlertTriangle : XCircle;
  const cls =
    svc.status === 'ok'
      ? 'text-emerald-600 dark:text-emerald-400'
      : svc.status === 'warn'
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-rose-600 dark:text-rose-400';
  return (
    <li className="flex items-start gap-2 p-2 rounded-lg border border-border-subtle">
      <Icon size={16} className={`mt-0.5 flex-shrink-0 ${cls}`} />
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-fg-default">{svc.label}</div>
        <div className="text-[11px] text-fg-muted truncate" title={svc.detail}>
          {svc.detail}
        </div>
      </div>
      {svc.latencyMs != null && (
        <span className="text-[10px] font-mono text-slate-400 tabular-nums flex-shrink-0">
          {svc.latencyMs} ms
        </span>
      )}
    </li>
  );
};

function pushRing(arr: number[], v: number): number[] {
  const next = arr.concat(Number.isFinite(v) ? v : 0);
  if (next.length > HISTORY_LEN) next.splice(0, next.length - HISTORY_LEN);
  return next;
}

function colorForPct(pct: number): string {
  if (pct > 85) return '#f43f5e'; // rose-500
  if (pct > 60) return '#f59e0b'; // amber-500
  return '#10b981'; // emerald-500
}

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function formatSec(s: number): string {
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
}
