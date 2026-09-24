/**
 * Motor del importador: coge un fichero ya subido y lo convierte en altas o
 * actualizaciones, fila a fila, despachando contra los routers reales.
 *
 * Decisiones que conviene tener presentes al leer esto:
 *
 *  - **Cada fila es independiente.** Un fallo se anota y se sigue. En una
 *    migración siempre hay tres filas sucias en un fichero de cinco mil, y
 *    tirar las 4.997 buenas por eso no ayuda a nadie. Lo que sí es atómico es
 *    un documento: su cabecera y sus líneas viajan en una sola llamada.
 *  - **Una celda vacía no se envía.** Ni en alta ni en actualización. Así el
 *    endpoint aplica sus defaults al crear, y al actualizar no se machaca con
 *    un nulo lo que el fichero simplemente no traía. La contrapartida: desde
 *    el importador no se puede vaciar un campo que ya tiene valor.
 *  - **La simulación recorre exactamente lo mismo** salvo la escritura, para
 *    que lo que promete sea lo que luego pasa: convierte tipos, comprueba
 *    obligatorios, resuelve referencias y busca el registro existente.
 *  - **El progreso se guarda en la tabla, no solo en memoria**, para que la
 *    pantalla lo recupere tras recargar.
 */

import crypto from 'crypto';
import fs from 'fs';
import { and, desc, eq } from 'drizzle-orm';
import * as schema from '../../db/schema';
import { broadcastEvent } from '../realtime/EventSocket';
import { type ImportObjectConfig } from './ImportRegistry';
import { callRouter, type DispatchContext } from './RouterDispatcher';
import { TenantLookup } from './TenantLookup';
import { parseTabularFile, rowNumberOf } from './fileParsing';
import { isExampleRow } from './templateBuilder';
import { prepareRow, isRejected, type ImportMode } from './rowPreparation';
import { resolveImportObject } from './resolveObject';

export type { ImportMode };

export interface ImportJobRequest {
  jobId: string;
  objectId: string;
  mode: ImportMode;
  dryRun: boolean;
  /** { cabeceraDelFichero: claveDelCampo } */
  mapping: Record<string, string>;
  /** Clave natural elegida (una de `naturalKeys`), obligatoria en update/upsert. */
  matchBy?: string;
  fileName: string;
  filePath: string;
  sheetName?: string;
  /** Fichero de líneas, para objetos con cabecera+líneas. */
  linesFilePath?: string;
  linesSheetName?: string;
  dispatch: DispatchContext;
  tenantSchema: string;
}

interface RowOutcome {
  status: 'ok' | 'error' | 'skipped';
  action?: 'created' | 'updated';
  entityId?: string;
  entityCode?: string;
  message?: string;
}

/** Cada cuántos ms se refresca el progreso (WebSocket + tabla). */
const PROGRESS_INTERVAL_MS = 400;
/** Cada cuántas filas se vuelcan los resultados acumulados a la tabla. */
const ROW_FLUSH_SIZE = 50;

const running = new Map<string, { cancelled: boolean }>();

// ── Motor ───────────────────────────────────────────────────────────────────

export const ImportJobRunner = {
  isRunning(jobId: string): boolean {
    return running.has(jobId);
  },

  /** Marca el trabajo para que pare entre filas. No revierte lo ya escrito. */
  cancel(jobId: string): boolean {
    const state = running.get(jobId);
    if (!state) return false;
    state.cancelled = true;
    return true;
  },

  /**
   * Arranca el trabajo en segundo plano. No se espera: la ruta responde con
   * el id y la pantalla sigue el progreso por WebSocket.
   */
  start(request: ImportJobRequest): void {
    running.set(request.jobId, { cancelled: false });
    void runJob(request).finally(() => running.delete(request.jobId));
  },

  /** Deshace un trabajo ya terminado, también en segundo plano. */
  startUndo(request: UndoRequest): void {
    running.set(request.jobId, { cancelled: false });
    void undoJob(request).finally(() => running.delete(request.jobId));
  },
};

export interface UndoRequest {
  jobId: string;
  objectId: string;
  dispatch: DispatchContext;
}

/**
 * Borra lo que creó un trabajo, en orden inverso al de creación (lo último
 * primero, que es lo que menos probabilidades tiene de tener algo colgando).
 *
 * Es best-effort por diseño: un interlocutor que ya tiene una factura no se
 * puede borrar, y eso NO es un fallo del deshacer — es la base de datos
 * protegiendo un documento. Cada fila que no se pueda revertir se queda como
 * estaba con el motivo escrito, y el resumen dice cuántas fueron.
 *
 * Las filas actualizadas no se tocan: el importador no guarda el valor
 * anterior campo a campo, así que "deshacer una actualización" no es algo que
 * pueda prometer. Solo se revierten las altas.
 */
async function undoJob(request: UndoRequest): Promise<void> {
  const { jobId, dispatch } = request;
  const db = dispatch.tenantClient;
  const config = await resolveImportObject(request.objectId, dispatch.tenantId);

  if (!config?.deletePath) {
    await failJob(db, jobId, 'Este objeto no se puede deshacer: no admite borrado.');
    return;
  }

  const created = await db
    .select()
    .from(schema.dataImportJobRows)
    .where(
      and(
        eq(schema.dataImportJobRows.jobId, jobId),
        eq(schema.dataImportJobRows.status, 'ok'),
        eq(schema.dataImportJobRows.action, 'created'),
      ),
    )
    .orderBy(desc(schema.dataImportJobRows.rowNum));

  const counters = { processed: 0, ok: 0, errors: 0, skipped: 0 };
  const total = created.length;
  let lastProgress = Date.now();

  emitProgress(dispatch.tenantId, {
    request: undoAsRequest(request),
    config,
    counters,
    total,
    status: 'undoing',
  });

  for (const row of created) {
    if (running.get(jobId)?.cancelled) break;
    counters.processed++;

    if (!row.entityId) {
      counters.skipped++;
      continue;
    }

    const result = await callRouter(config.router(), {
      method: 'DELETE',
      url: config.deletePath(row.entityId),
      originalUrl: `/api/${config.id}/${row.entityId}`,
      ctx: dispatch,
    });

    if (result.ok) {
      counters.ok++;
      await db
        .update(schema.dataImportJobRows)
        .set({ status: 'undone' })
        .where(eq(schema.dataImportJobRows.id, row.id));
    } else {
      counters.errors++;
      await db
        .update(schema.dataImportJobRows)
        .set({ message: `No se pudo deshacer: ${result.data?.error || result.status}` })
        .where(eq(schema.dataImportJobRows.id, row.id));
    }

    if (Date.now() - lastProgress >= PROGRESS_INTERVAL_MS) {
      lastProgress = Date.now();
      emitProgress(dispatch.tenantId, {
        request: undoAsRequest(request),
        config,
        counters,
        total,
        status: 'undoing',
      });
    }
  }

  await db
    .update(schema.dataImportJobs)
    .set({ status: 'undone', undoneAt: new Date() })
    .where(eq(schema.dataImportJobs.id, jobId));

  emitProgress(
    dispatch.tenantId,
    { request: undoAsRequest(request), config, counters, total, status: 'undone' },
    'finished',
  );
}

/** El evento de progreso espera una petición de importación; el deshacer
 * reutiliza el mismo canal con los campos que sí tiene. */
function undoAsRequest(request: UndoRequest): ImportJobRequest {
  return {
    jobId: request.jobId,
    objectId: request.objectId,
    mode: 'update',
    dryRun: false,
    mapping: {},
    fileName: '',
    filePath: '',
    dispatch: request.dispatch,
    tenantSchema: '',
  };
}

async function runJob(request: ImportJobRequest): Promise<void> {
  const { jobId, dispatch, tenantSchema } = request;
  const db = dispatch.tenantClient;

  // Tal y como lo ve ESTA empresa: con sus campos personalizados `p_*` y, si
  // el objeto es una tabla propia, construido al vuelo. El registro global no
  // lleva nada de eso, y el mapeo del fichero sí puede apuntar ahí.
  const config = await resolveImportObject(request.objectId, dispatch.tenantId);

  if (!config) {
    await failJob(db, jobId, `Objeto de importación desconocido: ${request.objectId}`);
    return;
  }

  const counters = { processed: 0, ok: 0, errors: 0, skipped: 0 };
  let total = 0;

  try {
    const sheets = parseTabularFile(fs.readFileSync(request.filePath), request.fileName);
    const sheet = request.sheetName
      ? sheets.find((s) => s.name === request.sheetName) || sheets[0]
      : sheets[0];
    if (!sheet) throw new Error('El fichero no tiene ninguna hoja con datos.');

    // La fila de ejemplo de la plantilla no cuenta como dato aunque el usuario
    // se haya olvidado de borrarla: se descarta antes de fijar el total, para
    // que el "0 / 120" que ve coincida con las filas que él escribió.
    const rows = sheet.rows.filter((r) => !isExampleRow(r));
    total = rows.length;

    const linesByKey = await loadLines(request, config);

    await db
      .update(schema.dataImportJobs)
      .set({ status: 'running', startedAt: new Date(), totalRows: total })
      .where(eq(schema.dataImportJobs.id, jobId));

    emitProgress(dispatch.tenantId, { request, config, counters, total, status: 'running' });

    const lookup = new TenantLookup(db, tenantSchema);
    const seenKeys = new Map<string, Set<string>>();
    const pending: any[] = [];
    let lastProgress = Date.now();
    let cancelled = false;

    for (let i = 0; i < rows.length; i++) {
      if (running.get(jobId)?.cancelled) {
        cancelled = true;
        break;
      }

      const row = rows[i];
      const rowNum = rowNumberOf(row, i);
      const outcome = await processRow({ request, config, row, lookup, linesByKey, seenKeys });

      counters.processed++;
      if (outcome.status === 'ok') counters.ok++;
      else if (outcome.status === 'error') counters.errors++;
      else counters.skipped++;

      pending.push({
        id: crypto.randomUUID(),
        jobId,
        rowNum,
        status: outcome.status,
        action: outcome.action || null,
        entityId: outcome.entityId || null,
        entityCode: outcome.entityCode || null,
        message: outcome.message || null,
        raw: { ...row },
      });

      if (pending.length >= ROW_FLUSH_SIZE) {
        await db.insert(schema.dataImportJobRows).values(pending.splice(0, pending.length));
      }

      if (Date.now() - lastProgress >= PROGRESS_INTERVAL_MS) {
        lastProgress = Date.now();
        await persistCounters(db, jobId, counters);
        emitProgress(dispatch.tenantId, { request, config, counters, total, status: 'running' });
      }
    }

    if (pending.length > 0) {
      await db.insert(schema.dataImportJobRows).values(pending);
    }

    const status = cancelled ? 'cancelled' : 'done';
    await db
      .update(schema.dataImportJobs)
      .set({
        status,
        processedRows: counters.processed,
        okRows: counters.ok,
        errorRows: counters.errors,
        skippedRows: counters.skipped,
        finishedAt: new Date(),
      })
      .where(eq(schema.dataImportJobs.id, jobId));

    emitProgress(dispatch.tenantId, { request, config, counters, total, status }, 'finished');
  } catch (e: any) {
    await failJob(db, jobId, e?.message || 'Error desconocido');
    emitProgress(
      dispatch.tenantId,
      { request, config, counters, total, status: 'error', error: e?.message },
      'finished',
    );
  } finally {
    // El fichero temporal ya no hace falta: los datos de cada fila quedan en
    // DataImportJobRow.raw, que es de donde sale el CSV de errores.
    try {
      fs.unlinkSync(request.filePath);
    } catch {
      /* puede haberlo borrado ya la limpieza por antigüedad */
    }
    if (request.linesFilePath) {
      try {
        fs.unlinkSync(request.linesFilePath);
      } catch {
        /* idem */
      }
    }
  }
}

/**
 * Líneas agrupadas por su columna de enlace con la cabecera.
 *
 * Lo normal es que vengan en OTRA HOJA del mismo libro: un documento con sus
 * líneas es un solo Excel de dos pestañas, no dos ficheros que hay que subir
 * por separado y que se pueden desparejar. Se admite un fichero aparte
 * (`linesFilePath`) por si alguna vez hace falta.
 */
async function loadLines(
  request: ImportJobRequest,
  config: ImportObjectConfig,
): Promise<Map<string, Array<Record<string, any>>> | null> {
  if (!config.lines) return null;

  const source = request.linesFilePath || request.filePath;
  const sheets = parseTabularFile(fs.readFileSync(source), request.fileName);

  // La hoja de líneas es la que diga el usuario; si no dijo nada, la que se
  // llame como el objeto ("Líneas") y, en último término, la segunda.
  const sheet =
    (request.linesSheetName && sheets.find((s) => s.name === request.linesSheetName)) ||
    sheets.find((s) => s.name.toLowerCase() === config.lines!.label.toLowerCase()) ||
    (sheets.length > 1 ? sheets[1] : null);
  if (!sheet) return null;

  const grouped = new Map<string, Array<Record<string, any>>>();
  for (const row of sheet.rows) {
    const key = String(row[config.lines.groupBy] ?? '').trim();
    if (!key) continue;
    const list = grouped.get(key) || [];
    list.push(row);
    grouped.set(key, list);
  }
  return grouped;
}

interface ProcessArgs {
  request: ImportJobRequest;
  config: ImportObjectConfig;
  row: Record<string, any>;
  lookup: TenantLookup;
  linesByKey: Map<string, Array<Record<string, any>>> | null;
  /** Claves únicas ya vistas en este fichero — detecta el duplicado interno. */
  seenKeys: Map<string, Set<string>>;
}

/**
 * Prepara la fila (conversión, obligatorios, referencias, alta vs
 * actualización — todo eso vive en `rowPreparation.ts`) y, si procede, la
 * escribe despachando contra el router real.
 */
async function processRow({
  request,
  config,
  row,
  lookup,
  linesByKey,
  seenKeys,
}: ProcessArgs): Promise<RowOutcome> {
  const prepared = await prepareRow({
    config,
    mapping: request.mapping,
    mode: request.mode,
    matchBy: request.matchBy,
    row,
    lookup,
    linesByKey,
    seenKeys,
  });

  if (isRejected(prepared)) return { status: 'error', message: prepared.message };

  const { body, creating, existingId, code } = prepared;

  // Simulación: hasta aquí llega, sin escribir.
  if (request.dryRun) {
    return { status: 'ok', action: creating ? 'created' : 'updated', entityCode: code };
  }

  const router = config.router();
  const createUrl =
    typeof config.createPath === 'function' ? config.createPath(body) : config.createPath;
  const result = creating
    ? await callRouter(router, {
        method: 'POST',
        url: createUrl,
        originalUrl: `/api/${config.id}`,
        body,
        ctx: request.dispatch,
      })
    : await callRouter(router, {
        method: config.updateMethod || 'PATCH',
        url: config.updatePath!(existingId!),
        originalUrl: `/api/${config.id}/${existingId}`,
        body,
        ctx: request.dispatch,
      });

  if (!result.ok) {
    return { status: 'error', message: result.data?.error || `Error ${result.status}` };
  }

  // Una fila puede referenciar algo que otra fila creó antes en este mismo
  // fichero; sin esto seguiría viendo el "no existe" que se cacheó.
  lookup.invalidate(config.table);

  return {
    status: 'ok',
    action: creating ? 'created' : 'updated',
    entityId: result.data?.id,
    entityCode: result.data?.code || code,
  };
}

// ── Persistencia y avisos ───────────────────────────────────────────────────

async function persistCounters(
  db: any,
  jobId: string,
  counters: { processed: number; ok: number; errors: number; skipped: number },
): Promise<void> {
  await db
    .update(schema.dataImportJobs)
    .set({
      processedRows: counters.processed,
      okRows: counters.ok,
      errorRows: counters.errors,
      skippedRows: counters.skipped,
    })
    .where(eq(schema.dataImportJobs.id, jobId));
}

async function failJob(db: any, jobId: string, message: string): Promise<void> {
  await db
    .update(schema.dataImportJobs)
    .set({ status: 'error', error: message, finishedAt: new Date() })
    .where(eq(schema.dataImportJobs.id, jobId));
}

interface ProgressArgs {
  request: ImportJobRequest;
  config: ImportObjectConfig;
  counters: { processed: number; ok: number; errors: number; skipped: number };
  total: number;
  status: string;
  error?: string;
}

function emitProgress(
  tenantId: string,
  { request, config, counters, total, status, error }: ProgressArgs,
  kind: 'progress' | 'finished' = 'progress',
): void {
  broadcastEvent(tenantId, {
    type: `dataImport.${kind}`,
    payload: {
      jobId: request.jobId,
      objectId: request.objectId,
      objectLabel: config.label,
      mode: request.mode,
      dryRun: request.dryRun,
      status,
      total,
      processed: counters.processed,
      ok: counters.ok,
      errors: counters.errors,
      skipped: counters.skipped,
      error,
    },
    timestamp: Date.now(),
  });
}
