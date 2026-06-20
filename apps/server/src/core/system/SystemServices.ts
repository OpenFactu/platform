/**
 * Health checks de los servicios que componen el servidor. Alimenta el
 * cockpit (/api/system/services) — visión rápida de "qué está vivo".
 *
 * Sin dependencias nuevas: ping a Postgres con `SELECT 1`, escritura de un
 * fichero temporal para el disco de `storage/`, cuenta de plugins activos.
 */

import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { sql } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import { activePlugins, activePluginManifests } from '../../plugins/loader';

export interface PluginInfo {
  id: string;
  name: string;
  version?: string;
  loaded: boolean;
}

export function collectPlugins(): PluginInfo[] {
  const byId = new Map<string, PluginInfo>();
  for (const m of activePluginManifests) {
    byId.set(m.id, {
      id: m.id,
      name: m.name || m.id,
      version: m.version,
      loaded: activePlugins.includes(m.id),
    });
  }
  // Plugins backend-only sin manifest UI.
  for (const id of activePlugins) {
    if (!byId.has(id)) byId.set(id, { id, name: id, loaded: true });
  }
  return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export type ServiceStatus = 'ok' | 'warn' | 'down';

export interface ServiceCheck {
  id: string;
  label: string;
  status: ServiceStatus;
  /** Detalle legible (latencia, conteo, mensaje de error…). */
  detail: string;
  /** Latencia en ms de la comprobación, si aplica. */
  latencyMs?: number;
}

function storagePath(): string {
  if (process.env.OPENFACTU_UPLOADS_DIR) return process.env.OPENFACTU_UPLOADS_DIR;
  if (fs.existsSync('/app/storage')) return '/app/storage';
  return path.resolve(process.cwd(), 'storage');
}

async function checkApi(): Promise<ServiceCheck> {
  // Si estamos respondiendo a este endpoint, el API está vivo por definición.
  const uptime = process.uptime();
  return {
    id: 'api',
    label: 'API HTTP',
    status: 'ok',
    detail: `uptime ${Math.floor(uptime)}s · pid ${process.pid}`,
  };
}

async function checkPostgres(): Promise<ServiceCheck> {
  const start = Date.now();
  try {
    const db = ClientFactory.getClient('public');
    await db.execute(sql.raw('SELECT 1'));
    const latencyMs = Date.now() - start;
    return {
      id: 'postgres',
      label: 'PostgreSQL',
      status: latencyMs < 200 ? 'ok' : 'warn',
      detail: latencyMs < 200 ? `ping ${latencyMs} ms` : `lento (${latencyMs} ms)`,
      latencyMs,
    };
  } catch (e: any) {
    return {
      id: 'postgres',
      label: 'PostgreSQL',
      status: 'down',
      detail: e?.message || 'Sin conexión',
      latencyMs: Date.now() - start,
    };
  }
}

async function checkStorage(): Promise<ServiceCheck> {
  const dir = storagePath();
  const probe = path.join(dir, `.healthcheck_${Date.now()}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return {
      id: 'storage',
      label: 'Almacenamiento local',
      status: 'ok',
      detail: dir,
    };
  } catch (e: any) {
    return {
      id: 'storage',
      label: 'Almacenamiento local',
      status: 'down',
      detail: `${dir} — ${e?.message || 'no escribible'}`,
    };
  }
}

function checkPlugins(): ServiceCheck {
  const n = activePlugins.length;
  return {
    id: 'plugins',
    label: 'Plugins',
    status: 'ok',
    detail: n === 0 ? 'sin plugins activos' : `${n} activo${n === 1 ? '' : 's'}`,
  };
}

function checkPgDump(): ServiceCheck {
  // 1) pg_dump local en PATH → lo más rápido.
  const paths = (process.env.PATH || '').split(path.delimiter);
  for (const p of paths) {
    const bin = path.join(p, process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump');
    try {
      if (fs.existsSync(bin)) {
        return { id: 'pg_dump', label: 'pg_dump CLI', status: 'ok', detail: `local: ${bin}` };
      }
    } catch {
      /* keep searching */
    }
  }
  // 2) Fallback: pg_dump dentro de un container Docker de Postgres.
  try {
    const docker = spawnSync('docker', ['--version'], { encoding: 'utf8' });
    if (docker.status === 0) {
      const container =
        process.env.OPENFACTU_PG_CONTAINER ||
        (() => {
          const r = spawnSync(
            'docker',
            ['ps', '--filter', 'ancestor=postgres', '--format', '{{.Names}}'],
            { encoding: 'utf8' },
          );
          return (
            r.stdout
              ?.split('\n')
              .map((s) => s.trim())
              .filter(Boolean)[0] || ''
          );
        })();
      if (container) {
        const check = spawnSync('docker', ['exec', container, 'pg_dump', '--version'], {
          encoding: 'utf8',
        });
        if (check.status === 0) {
          return {
            id: 'pg_dump',
            label: 'pg_dump CLI',
            status: 'ok',
            detail: `docker exec ${container}`,
          };
        }
      }
    }
  } catch {
    /* docker no disponible */
  }
  return {
    id: 'pg_dump',
    label: 'pg_dump CLI',
    status: 'warn',
    detail: 'No encontrado (ni local, ni en container) — export/import de empresas deshabilitado',
  };
}

export async function collectServices(): Promise<ServiceCheck[]> {
  return [
    await checkApi(),
    await checkPostgres(),
    await checkStorage(),
    checkPlugins(),
    checkPgDump(),
  ];
}
