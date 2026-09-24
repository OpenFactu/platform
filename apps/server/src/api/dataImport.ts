/**
 * API del importador de datos — el "DTW" de Keirost.
 *
 * Se monta detrás de `adminMiddleware`, que ya es exactamente "ADMIN o
 * SUPERUSER": la herramienta entera es de administración. Dentro, el catálogo
 * se filtra además por permiso de módulo y por los flags activos de la
 * empresa, para que un admin de una empresa sin RRHH no vea objetos de RRHH.
 *
 * El flujo que sigue la pantalla:
 *   GET  /objects                    qué se puede importar
 *   GET  /objects/:id/template.xlsx  plantilla para rellenar
 *   POST /uploads                    sube el fichero → cabeceras, muestra y automapeo
 *   POST /jobs                       lanza la simulación o la importación
 *   GET  /jobs/:id                   estado (el progreso en vivo va por WebSocket)
 */

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import crypto from 'crypto';
import { and, desc, eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { type ImportObjectConfig } from '../core/dataimport/ImportRegistry';
import { ImportJobRunner, type ImportMode } from '../core/dataimport/ImportJobRunner';
import { UploadStore } from '../core/dataimport/UploadStore';
import { buildTemplateWorkbook, isExampleRow } from '../core/dataimport/templateBuilder';
import { parseTabularFile } from '../core/dataimport/fileParsing';
import { automap, automapToMapping } from '../core/dataimport/automap';
import { listImportObjects } from '../core/dataimport/resolveObject';
import { resolveEffectivePermissions } from '../core/auth/resolveEffectivePermissions';
import { getConfigSection } from '../core/config/systemConfigSection';
import { FLAGS_DEFAULTS } from '../core/config/appConfig';
import type { DispatchContext } from '../core/dataimport/RouterDispatcher';

const router = Router();

const upload = multer({
  dest: '/tmp/keirost-data-import-incoming/',
  // Un Excel de 25 MB son cientos de miles de filas: más que eso no es una
  // migración, es un volcado que conviene partir.
  limits: { fileSize: 25 * 1024 * 1024 },
});

/** Cuántas filas se devuelven como muestra en el paso de mapeo. */
const PREVIEW_ROWS = 10;

function dispatchContextOf(req: any): DispatchContext {
  return {
    tenantClient: req.tenantClient,
    tenantId: req.tenantId,
    tenantSchema: req.tenantSchema,
    user: {
      id: req.user?.id,
      role: req.user?.role,
      email: req.user?.email,
      username: req.user?.username,
      tenantId: req.tenantId,
    },
    apiToken: req.apiToken,
  };
}

function requireSchema(req: any, res: any): string | null {
  if (!req.tenantSchema) {
    res.status(400).json({ error: 'No hay empresa activa en la petición.' });
    return null;
  }
  return req.tenantSchema;
}

/** Cómo se le presenta un objeto al cliente (sin el router ni las funciones). */
function serializeObject(config: ImportObjectConfig) {
  return {
    id: config.id,
    label: config.label,
    description: config.description,
    group: config.group,
    modulePath: config.modulePath,
    naturalKeys: config.naturalKeys,
    supportsUpdate: !!config.updatePath,
    supportsUndo: !!config.deletePath,
    dependsOn: config.dependsOn || [],
    fields: config.fields,
    lines: config.lines
      ? { label: config.lines.label, groupBy: config.lines.groupBy, fields: config.lines.fields }
      : null,
  };
}

/**
 * Objetos que este usuario puede importar en esta empresa, ya enriquecidos
 * con los campos personalizados y las tablas propias del tenant.
 */
async function visibleObjects(req: any): Promise<ImportObjectConfig[]> {
  const [permissions, flags, all] = await Promise.all([
    resolveEffectivePermissions(req.user?.id, req.tenantId, req.user?.role),
    getConfigSection(req.tenantClient, 'flags', FLAGS_DEFAULTS),
    listImportObjects(req.tenantId),
  ]);

  return all.filter((config) => {
    // Un módulo apagado en la empresa no aparece, aunque quien mire sea admin:
    // importar artículos en una empresa sin inventario deja datos que nadie
    // puede ver ni corregir después.
    if (config.featureFlag && (flags as any)[config.featureFlag] === false) return false;
    // `null` = ADMIN/SUPERUSER, acceso total (mismo criterio que el resto).
    if (permissions === null) return true;
    return !!permissions[config.modulePath]?.write;
  });
}

// ── Catálogo y plantillas ───────────────────────────────────────────────────

router.get('/objects', async (req: any, res) => {
  try {
    const objects = await visibleObjects(req);
    res.json(objects.map(serializeObject));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo leer el catálogo' });
  }
});

router.get('/objects/:id/template.xlsx', async (req: any, res) => {
  try {
    const allowed = await visibleObjects(req);
    const config = allowed.find((c) => c.id === req.params.id);
    if (!config) return res.status(404).json({ error: 'Objeto no disponible' });

    const buffer = buildTemplateWorkbook(config);
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename="plantilla-${config.id}.xlsx"`);
    res.send(buffer);
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo generar la plantilla' });
  }
});

// ── Subida y previsualización ───────────────────────────────────────────────

router.post('/uploads', upload.single('file'), async (req: any, res) => {
  const tenantSchema = requireSchema(req, res);
  if (!tenantSchema) return;
  if (!req.file) return res.status(400).json({ error: 'No se recibió ningún fichero.' });

  try {
    const objectId = req.body?.objectId;
    const allowed = await visibleObjects(req);
    const config = allowed.find((c) => c.id === objectId);
    if (!config) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Objeto no disponible' });
    }

    const sheets = parseTabularFile(fs.readFileSync(req.file.path), req.file.originalname);
    if (sheets.length === 0 || sheets[0].headers.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'El fichero no tiene ninguna fila de cabeceras.' });
    }

    const stored = UploadStore.save(tenantSchema, req.file.path, req.file.originalname);

    res.json({
      uploadId: stored.uploadId,
      fileName: stored.fileName,
      sheets: sheets.map((s) => {
        const dataRows = s.rows.filter((r) => !isExampleRow(r));
        const proposal = automap(config, s.headers);
        return {
          name: s.name,
          headers: s.headers,
          totalRows: dataRows.length,
          preview: dataRows.slice(0, PREVIEW_ROWS),
          automap: proposal,
          mapping: automapToMapping(proposal),
        };
      }),
    });
  } catch (e: any) {
    try {
      if (req.file?.path) fs.unlinkSync(req.file.path);
    } catch {
      /* da igual */
    }
    res.status(400).json({ error: e?.message || 'No se pudo leer el fichero' });
  }
});

// ── Trabajos ────────────────────────────────────────────────────────────────

router.post('/jobs', async (req: any, res) => {
  const tenantSchema = requireSchema(req, res);
  if (!tenantSchema) return;

  try {
    const { uploadId, objectId, sheetName, linesSheetName, mapping, matchBy, fileName } =
      req.body || {};
    const mode: ImportMode = req.body?.mode || 'insert';
    const dryRun = !!req.body?.dryRun;

    const allowed = await visibleObjects(req);
    const config = allowed.find((c) => c.id === objectId);
    if (!config) return res.status(404).json({ error: 'Objeto no disponible' });

    if (mode !== 'insert' && !config.updatePath) {
      return res.status(400).json({ error: `${config.label} solo admite alta, no actualización.` });
    }
    if (mode !== 'insert' && !config.naturalKeys.some((k) => k.key === matchBy)) {
      return res
        .status(400)
        .json({ error: 'Hay que indicar por qué campo se busca el registro existente.' });
    }
    if (!mapping || Object.keys(mapping).length === 0) {
      return res.status(400).json({ error: 'No hay ninguna columna mapeada.' });
    }

    const filePath = UploadStore.resolve(tenantSchema, uploadId);
    if (!filePath) {
      return res
        .status(410)
        .json({ error: 'El fichero subido ya no está disponible. Vuelve a subirlo.' });
    }

    const jobId = crypto.randomUUID();
    await req.tenantClient.insert(schema.dataImportJobs).values({
      id: jobId,
      objectId,
      mode,
      dryRun,
      fileName: fileName || 'importacion',
      sheetName: sheetName || null,
      mapping,
      matchBy: matchBy || null,
      status: 'pending',
      createdBy: req.user?.id || null,
    });

    ImportJobRunner.start({
      jobId,
      objectId,
      mode,
      dryRun,
      mapping,
      matchBy,
      fileName: fileName || 'importacion',
      filePath,
      sheetName,
      linesSheetName,
      dispatch: dispatchContextOf(req),
      tenantSchema,
    });

    res.json({ jobId });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'No se pudo crear el trabajo' });
  }
});

/** Trabajos en curso — lo consulta la pantalla al cargar para re-enganchar el aviso de progreso. */
router.get('/jobs/active', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.dataImportJobs)
      .where(eq(schema.dataImportJobs.status, 'running'));
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.get('/jobs', async (req: any, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const rows = await req.tenantClient
      .select()
      .from(schema.dataImportJobs)
      .orderBy(desc(schema.dataImportJobs.createdAt))
      .limit(limit);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.get('/jobs/:id', async (req: any, res) => {
  try {
    const [job] = await req.tenantClient
      .select()
      .from(schema.dataImportJobs)
      .where(eq(schema.dataImportJobs.id, req.params.id));
    if (!job) return res.status(404).json({ error: 'Trabajo no encontrado' });
    res.json(job);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.get('/jobs/:id/rows', async (req: any, res) => {
  try {
    const status = req.query.status as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 200, 1000);

    const where = status
      ? and(
          eq(schema.dataImportJobRows.jobId, req.params.id),
          eq(schema.dataImportJobRows.status, status),
        )
      : eq(schema.dataImportJobRows.jobId, req.params.id);

    const rows = await req.tenantClient
      .select()
      .from(schema.dataImportJobRows)
      .where(where)
      .orderBy(schema.dataImportJobRows.rowNum)
      .limit(limit);

    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

/**
 * Las filas que fallaron, tal y como venían, con una columna «Motivo» al
 * final. La idea es que el usuario abra esto, corrija los motivos y vuelva a
 * subir ESTE fichero: por eso conserva las cabeceras originales y no las del
 * catálogo.
 */
router.get('/jobs/:id/errors.csv', async (req: any, res) => {
  try {
    const rows = await req.tenantClient
      .select()
      .from(schema.dataImportJobRows)
      .where(
        and(
          eq(schema.dataImportJobRows.jobId, req.params.id),
          eq(schema.dataImportJobRows.status, 'error'),
        ),
      )
      .orderBy(schema.dataImportJobRows.rowNum);

    const headers: string[] = [];
    for (const r of rows) {
      for (const k of Object.keys((r.raw as any) || {})) {
        if (!headers.includes(k)) headers.push(k);
      }
    }
    const columns = [...headers, 'Motivo'];

    const escape = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = v instanceof Date ? v.toISOString() : String(v);
      return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const lines = [columns.join(';')];
    for (const r of rows) {
      const raw = (r.raw as any) || {};
      lines.push([...headers.map((h) => escape(raw[h])), escape(r.message)].join(';'));
    }

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="errores-${req.params.id}.csv"`);
    // BOM + separador `;`: así Excel en español lo abre en columnas de una vez.
    res.send(Buffer.concat([Buffer.from('﻿', 'utf8'), Buffer.from(lines.join('\r\n'), 'utf8')]));
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post('/jobs/:id/cancel', async (req: any, res) => {
  const stopped = ImportJobRunner.cancel(req.params.id);
  if (!stopped) return res.status(409).json({ error: 'Ese trabajo ya no está en curso.' });
  res.json({ ok: true });
});

router.post('/jobs/:id/undo', async (req: any, res) => {
  try {
    const [job] = await req.tenantClient
      .select()
      .from(schema.dataImportJobs)
      .where(eq(schema.dataImportJobs.id, req.params.id));
    if (!job) return res.status(404).json({ error: 'Trabajo no encontrado' });
    if (job.dryRun) return res.status(400).json({ error: 'Una simulación no crea nada.' });
    if (job.status === 'running') {
      return res.status(409).json({ error: 'El trabajo sigue en curso: cancélalo primero.' });
    }
    if (job.status === 'undone') return res.status(409).json({ error: 'Ya estaba deshecho.' });

    const allowed = await visibleObjects(req);
    const config = allowed.find((c) => c.id === job.objectId);
    if (!config) return res.status(404).json({ error: 'Objeto no disponible' });
    if (!config.deletePath) {
      return res.status(400).json({ error: `${config.label} no admite deshacer.` });
    }

    ImportJobRunner.startUndo({
      jobId: job.id,
      objectId: job.objectId,
      dispatch: dispatchContextOf(req),
    });

    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

// ── Mapeos guardados ────────────────────────────────────────────────────────

router.get('/mappings', async (req: any, res) => {
  try {
    const objectId = req.query.objectId as string | undefined;
    const rows = await req.tenantClient
      .select()
      .from(schema.dataImportMappings)
      .where(objectId ? eq(schema.dataImportMappings.objectId, objectId) : undefined)
      .orderBy(schema.dataImportMappings.name);
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.post('/mappings', async (req: any, res) => {
  try {
    const { objectId, name, mapping, mode, matchBy } = req.body || {};
    if (!objectId || !name || !mapping) {
      return res.status(400).json({ error: 'Faltan objeto, nombre o mapeo.' });
    }
    // Por `visibleObjects` y no por el registro a secas: los mapeos también
    // valen para las tablas propias de la empresa, que no están en él.
    const allowed = await visibleObjects(req);
    if (!allowed.some((c) => c.id === objectId)) {
      return res.status(404).json({ error: 'Objeto no disponible' });
    }

    const [existing] = await req.tenantClient
      .select()
      .from(schema.dataImportMappings)
      .where(
        and(
          eq(schema.dataImportMappings.objectId, objectId),
          eq(schema.dataImportMappings.name, name),
        ),
      );

    // Repetir el nombre sobrescribe: dos "Excel del gestor" que nadie
    // distingue son peores que perder el anterior.
    if (existing) {
      const [updated] = await req.tenantClient
        .update(schema.dataImportMappings)
        .set({ mapping, mode: mode || null, matchBy: matchBy || null })
        .where(eq(schema.dataImportMappings.id, existing.id))
        .returning();
      return res.json(updated);
    }

    const [created] = await req.tenantClient
      .insert(schema.dataImportMappings)
      .values({
        id: crypto.randomUUID(),
        objectId,
        name,
        mapping,
        mode: mode || null,
        matchBy: matchBy || null,
        createdBy: req.user?.id || null,
      })
      .returning();
    res.json(created);
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

router.delete('/mappings/:id', async (req: any, res) => {
  try {
    await req.tenantClient
      .delete(schema.dataImportMappings)
      .where(eq(schema.dataImportMappings.id, req.params.id));
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
});

export default router;
