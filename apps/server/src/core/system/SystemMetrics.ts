/**
 * Recolecta métricas del proceso, host y BD para el cockpit del servidor.
 * Sin dependencias nuevas — usa `os`, `process`, `fs.statfs` (Node 18+) y
 * queries a `pg_*` para PostgreSQL.
 *
 * Llamado desde `/api/system/metrics`. Solo SUPERUSER lo invoca.
 */

import os from 'os';
import fs from 'fs';
import path from 'path';
import { sql } from 'drizzle-orm';
import { ClientFactory } from '../tenant/ClientFactory';
import * as schema from '../../db/schema';
import { getRequestStats, type RequestStats } from './RequestCounter';

// Versión leída del package.json del server al arrancar (cachéada).
let cachedVersion: string | null = null;
export function getServerVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkgPath = path.resolve(__dirname, '..', '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    cachedVersion = pkg.version || 'dev';
  } catch {
    cachedVersion = 'dev';
  }
  return cachedVersion!;
}

export interface SystemMetricsSnapshot {
  cpu: {
    model: string;
    cores: number;
    loadAvg: number[];
    usagePct: number;
  };
  memory: {
    totalMB: number;
    freeMB: number;
    usedMB: number;
    usedPct: number;
  };
  disk: {
    storagePath: string;
    totalGB: number;
    usedGB: number;
    freeGB: number;
    usedPct: number;
  };
  process: {
    uptimeSec: number;
    pid: number;
    nodeVersion: string;
    platform: string;
    heapUsedMB: number;
    heapTotalMB: number;
    rssMB: number;
  };
  postgres: {
    connectionsActive: number;
    connectionsMax: number;
    dbSizeMB: number;
  } | null;
  tenants: {
    total: number;
    schemas: Array<{ name: string; sizeMB: number }>;
  };
  host: {
    hostname: string;
    platform: string;
    release: string;
    arch: string;
    timezone: string;
    interfaces: Array<{ name: string; address: string; family: string }>;
  };
  requests: RequestStats;
  version: string;
  collectedAt: string;
}

let lastCpuTime: { idle: number; total: number } | null = null;

function readCpuUsagePct(): number {
  // Diferencia entre dos snapshots de os.cpus() para sacar % real.
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const c of cpus) {
    for (const t of Object.keys(c.times) as Array<keyof typeof c.times>) {
      total += c.times[t];
    }
    idle += c.times.idle;
  }
  if (lastCpuTime) {
    const idleDiff = idle - lastCpuTime.idle;
    const totalDiff = total - lastCpuTime.total;
    lastCpuTime = { idle, total };
    if (totalDiff <= 0) return 0;
    return Math.max(0, Math.min(100, 100 - (idleDiff * 100) / totalDiff));
  }
  lastCpuTime = { idle, total };
  return 0;
}

async function readDiskUsage(
  p: string,
): Promise<{ totalGB: number; usedGB: number; freeGB: number }> {
  // fs.statfs disponible desde Node 18.15. Caemos a 0 si no.
  const sf: any = (fs as any).promises?.statfs;
  if (typeof sf !== 'function') {
    return { totalGB: 0, usedGB: 0, freeGB: 0 };
  }
  try {
    const s = await sf(p);
    const total = (s.blocks * s.bsize) / 1024 / 1024 / 1024;
    const free = (s.bavail * s.bsize) / 1024 / 1024 / 1024;
    return { totalGB: total, usedGB: total - free, freeGB: free };
  } catch {
    return { totalGB: 0, usedGB: 0, freeGB: 0 };
  }
}

function defaultStoragePath(): string {
  if (process.env.OPENFACTU_UPLOADS_DIR) return process.env.OPENFACTU_UPLOADS_DIR;
  // /app/storage en docker; fallback al cwd.
  if (fs.existsSync('/app/storage')) return '/app/storage';
  return path.resolve(process.cwd());
}

export async function collectMetrics(): Promise<SystemMetricsSnapshot> {
  const cpus = os.cpus();
  const cpuModel = cpus[0]?.model || 'unknown';
  const cpuUsage = readCpuUsagePct();
  const totalMem = os.totalmem() / 1024 / 1024;
  const freeMem = os.freemem() / 1024 / 1024;
  const usedMem = totalMem - freeMem;

  const diskPath = defaultStoragePath();
  const disk = await readDiskUsage(diskPath);

  const memUsage = process.memoryUsage();

  // PostgreSQL stats — best effort.
  let pg: SystemMetricsSnapshot['postgres'] = null;
  try {
    const db = ClientFactory.getClient('public');
    const conRes: any = await db.execute(
      sql.raw(`SELECT count(*)::int AS n FROM pg_stat_activity`),
    );
    const maxRes: any = await db.execute(
      sql.raw(`SELECT setting::int AS n FROM pg_settings WHERE name='max_connections'`),
    );
    const sizeRes: any = await db.execute(
      sql.raw(`SELECT pg_database_size(current_database())::bigint AS s`),
    );
    pg = {
      connectionsActive: Number(conRes?.rows?.[0]?.n || 0),
      connectionsMax: Number(maxRes?.rows?.[0]?.n || 0),
      dbSizeMB: Number(sizeRes?.rows?.[0]?.s || 0) / 1024 / 1024,
    };
  } catch (e) {
    pg = null;
  }

  // Tenants — listamos y opcionalmente sacamos el tamaño de cada schema.
  let tenantsList: Array<{ name: string; sizeMB: number }> = [];
  let tenantsTotal = 0;
  try {
    const db = ClientFactory.getClient('public');
    const rows = await db.select().from(schema.tenants);
    tenantsTotal = rows.length;
    for (const t of rows) {
      try {
        const sizeRes: any = await db.execute(
          sql.raw(
            `SELECT COALESCE(SUM(pg_total_relation_size(format('%I.%I', schemaname, tablename))), 0)::bigint AS s FROM pg_tables WHERE schemaname = '${t.schemaName.replace(/'/g, '')}'`,
          ),
        );
        tenantsList.push({
          name: t.name,
          sizeMB: Number(sizeRes?.rows?.[0]?.s || 0) / 1024 / 1024,
        });
      } catch {
        tenantsList.push({ name: t.name, sizeMB: 0 });
      }
    }
  } catch {
    /* sin tenants visibles */
  }

  return {
    cpu: {
      model: cpuModel,
      cores: cpus.length,
      loadAvg: os.loadavg(),
      usagePct: cpuUsage,
    },
    memory: {
      totalMB: totalMem,
      freeMB: freeMem,
      usedMB: usedMem,
      usedPct: totalMem ? (usedMem * 100) / totalMem : 0,
    },
    disk: {
      storagePath: diskPath,
      ...disk,
      usedPct: disk.totalGB ? (disk.usedGB * 100) / disk.totalGB : 0,
    },
    process: {
      uptimeSec: process.uptime(),
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
      heapUsedMB: memUsage.heapUsed / 1024 / 1024,
      heapTotalMB: memUsage.heapTotal / 1024 / 1024,
      rssMB: memUsage.rss / 1024 / 1024,
    },
    postgres: pg,
    tenants: { total: tenantsTotal, schemas: tenantsList },
    host: collectHostInfo(),
    requests: getRequestStats(),
    version: getServerVersion(),
    collectedAt: new Date().toISOString(),
  };
}

function collectHostInfo(): SystemMetricsSnapshot['host'] {
  const nets = os.networkInterfaces();
  const interfaces: Array<{ name: string; address: string; family: string }> = [];
  for (const [name, list] of Object.entries(nets)) {
    for (const n of list || []) {
      if (!n.internal) interfaces.push({ name, address: n.address, family: String(n.family) });
    }
  }
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    arch: os.arch(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    interfaces,
  };
}
