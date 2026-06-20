import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import Handlebars from 'handlebars';
import { eq, and, asc, sql } from 'drizzle-orm';
import * as schema from '../db/schema';
import { PdfRenderer, ALL_DOC_TYPES, extractMetaFromHtml, type DocType } from '@openfactu/pdf';
import { MigrationManager } from '../core/tenant/MigrationManager';
import { PdfPayloadBuilder } from '../core/documents/PdfPayloadBuilder';
import {
  runTemplateQueries,
  validateQuery,
  type TemplateQuery,
} from '../core/documents/templateQueries';
import { logAudit } from '../utils/audit';

/**
 * Solo ciertos roles pueden guardar/ejecutar consultas SQL libres.
 * Adjuntar SQL en una plantilla da acceso de lectura a todo el schema del
 * tenant, por eso se restringe a ADMIN/SUPERUSER.
 */
function isAdminUser(req: any): boolean {
  const role = req.user?.role;
  return role === 'ADMIN' || role === 'SUPERUSER';
}

/**
 * Registra los helpers qrCode/barcode en el Handlebars compartido por
 * @openfactu/pdf. Se hace aquí (y no solo en el paquete) para que funcione
 * de inmediato sin necesidad de publicar una nueva versión del paquete ni
 * reiniciar el servidor tras tocar sus fuentes.
 */
let canvasHelpersRegistered = false;
export function registerCanvasHelpers() {
  if (canvasHelpersRegistered) return;
  canvasHelpersRegistered = true;

  // Nota: los helpers `barcode` y `qrCode` los registra @openfactu/pdf (>=0.1.3)
  // dentro de PdfRenderer.registerHelpers(); resuelven symbology 'auto' con
  // detección EAN/UPC y fallback a code128. Aquí registramos SOLO los helpers que
  // el paquete no trae, para mantener una única fuente de verdad.

  // Comparadores extra usados por el elemento condicional del diseñador.
  // `eq` y `gt` ya los registra @openfactu/pdf; añadimos `neq` y `lt`.
  Handlebars.registerHelper('neq', (a: unknown, b: unknown) => a !== b);
  Handlebars.registerHelper('lt', (a: unknown, b: unknown) => Number(a) < Number(b));

  // Agregados sobre una colección (lo usa el elemento "Resumen" del diseñador).
  // Se invocan como subexpresión: {{formatCurrency (sum lines "lineTotal")}} o {{count lines}}.
  const getByPath = (obj: any, path?: string): unknown => {
    if (!path) return obj;
    return String(path)
      .split('.')
      .reduce((acc: any, k) => (acc == null ? acc : acc[k]), obj);
  };
  const toNumbers = (arr: unknown, path?: string): number[] =>
    (Array.isArray(arr) ? arr : [])
      .map((item) => Number(getByPath(item, path)))
      .filter((n) => Number.isFinite(n));
  Handlebars.registerHelper('count', (arr: unknown) => (Array.isArray(arr) ? arr.length : 0));
  Handlebars.registerHelper('sum', (arr: unknown, path?: string) =>
    toNumbers(arr, typeof path === 'string' ? path : undefined).reduce((a, b) => a + b, 0),
  );
  Handlebars.registerHelper('avg', (arr: unknown, path?: string) => {
    const ns = toNumbers(arr, typeof path === 'string' ? path : undefined);
    return ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : 0;
  });
  Handlebars.registerHelper('min', (arr: unknown, path?: string) => {
    const ns = toNumbers(arr, typeof path === 'string' ? path : undefined);
    return ns.length ? Math.min(...ns) : 0;
  });
  Handlebars.registerHelper('max', (arr: unknown, path?: string) => {
    const ns = toNumbers(arr, typeof path === 'string' ? path : undefined);
    return ns.length ? Math.max(...ns) : 0;
  });

  // Fecha actual del render (lo usa el elemento "Fecha" en modo solo-fecha).
  Handlebars.registerHelper('today', () => new Date().toLocaleDateString('es-ES'));

  // Formatea una dirección estructurada (PartnerAddressObject) como texto
  // multilínea. Si el valor no es objeto (null, string ya formateada...), se
  // devuelve tal cual para no romper plantillas antiguas.
  Handlebars.registerHelper('formatAddress', (value: any) => {
    if (!value) return '';
    if (typeof value === 'string') return new Handlebars.SafeString(escapeHtmlSafe(value));
    if (typeof value !== 'object') return String(value);
    const street = value.street ?? '';
    const city = value.city ?? '';
    const state = value.state ?? '';
    const zip = value.zipCode ?? '';
    const country = value.country ?? '';
    const line2 = [zip, city].filter(Boolean).join(' ');
    const line3 = [state, country].filter(Boolean).join(', ');
    const lines = [street, line2, line3].filter((s) => s && String(s).trim().length > 0);
    return new Handlebars.SafeString(lines.map(escapeHtmlSafe).join('<br/>'));
  });

}

function escapeHtmlSafe(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const router = Router();

/**
 * Tipos de documento aceptados por el endpoint de plantillas. Además de los
 * tipos estándar de @openfactu/pdf (SINV/PINV/...), permitimos `FREE` para
 * plantillas libres (etiquetas de artículos, recibos genéricos) que no
 * requieren un documento ligado y se renderizan sólo con `queries`.
 */
const isValidDocType = (t: any): t is DocType =>
  ALL_DOC_TYPES.includes(t) || t === 'FREE' || t === 'LABEL';

/** True si la plantilla es de tipo "libre" — sin payload de documento (FREE o LABEL). */
const isFreeDocType = (t: any): boolean => t === 'FREE' || t === 'LABEL';

// GET / — lista (opcional filtro por ?docType=SINV)
router.get('/', async (req: any, res) => {
  try {
    const { docType } = req.query;
    const where = docType ? eq(schema.documentTemplates.docType, String(docType)) : undefined;
    const query = req.tenantClient
      .select({
        id: schema.documentTemplates.id,
        docType: schema.documentTemplates.docType,
        name: schema.documentTemplates.name,
        isDefault: schema.documentTemplates.isDefault,
        updatedAt: schema.documentTemplates.updatedAt,
      })
      .from(schema.documentTemplates);
    const rows = where
      ? await query
          .where(where)
          .orderBy(asc(schema.documentTemplates.docType), asc(schema.documentTemplates.name))
      : await query.orderBy(
          asc(schema.documentTemplates.docType),
          asc(schema.documentTemplates.name),
        );
    res.json(rows);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /schema-info — admin-only: devuelve la lista de tablas y columnas del
// esquema del tenant activo. DEBE ir antes de `/:id` para que Express no la
// capture como un id.
router.get('/schema-info', async (req: any, res) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ error: 'Solo disponible para administradores' });
    }
    const result: any = await req.tenantClient.execute(
      sql.raw(`
        SELECT
          c.table_schema,
          c.table_name,
          c.column_name,
          c.data_type,
          c.is_nullable
        FROM information_schema.columns c
        WHERE c.table_schema = ANY (current_schemas(false))
          AND c.table_schema NOT IN ('pg_catalog', 'information_schema')
        ORDER BY c.table_schema, c.table_name, c.ordinal_position
        LIMIT 5000
      `),
    );
    const rows: any[] = result?.rows ?? result ?? [];
    const tablesMap = new Map<
      string,
      {
        schema: string;
        name: string;
        columns: Array<{ name: string; type: string; nullable: boolean }>;
      }
    >();
    for (const r of rows) {
      const key = `${r.table_schema}.${r.table_name}`;
      if (!tablesMap.has(key)) {
        tablesMap.set(key, {
          schema: r.table_schema,
          name: r.table_name,
          columns: [],
        });
      }
      tablesMap.get(key)!.columns.push({
        name: r.column_name,
        type: r.data_type,
        nullable: r.is_nullable === 'YES',
      });
    }
    res.json({ tables: Array.from(tablesMap.values()) });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// GET /:id — detalle (incluye html)
router.get('/:id', async (req: any, res) => {
  try {
    const [row] = await req.tenantClient
      .select()
      .from(schema.documentTemplates)
      .where(eq(schema.documentTemplates.id, req.params.id));
    if (!row) return res.status(404).json({ error: 'No encontrada' });
    res.json(row);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST / — crear
router.post('/', async (req: any, res) => {
  try {
    const { docType, name, html, isDefault } = req.body;
    if (!isValidDocType(docType)) return res.status(400).json({ error: 'docType inválido' });
    if (!name || !html) return res.status(400).json({ error: 'name y html son obligatorios' });

    const id = crypto.randomUUID();
    await req.tenantClient.transaction(async (tx: any) => {
      if (isDefault) {
        await tx
          .update(schema.documentTemplates)
          .set({ isDefault: false })
          .where(eq(schema.documentTemplates.docType, docType));
      }
      await tx.insert(schema.documentTemplates).values({
        id,
        docType,
        name,
        html,
        isDefault: !!isDefault,
      });
    });
    PdfRenderer.invalidateCache();
    res.json({ id });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'DocumentTemplate',
      entityId: id,
      action: 'CREATE',
      newValue: { docType, name, isDefault: !!isDefault },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// PUT /:id — actualizar
router.put('/:id', async (req: any, res) => {
  try {
    const { name, html, isDefault, canvasLayout, legacyHtml } = req.body;
    await req.tenantClient.transaction(async (tx: any) => {
      const [existing] = await tx
        .select()
        .from(schema.documentTemplates)
        .where(eq(schema.documentTemplates.id, req.params.id));
      if (!existing) throw new Error('No encontrada');

      // Admin-only: solo los admins pueden modificar el bloque `queries` del
      // layout. Para no-admins, sobrescribimos las queries entrantes con las
      // que ya había en BD — así pueden seguir guardando cambios de maquetado
      // sobre plantillas que contienen SQL sin toparse con un 403.
      if (canvasLayout && !isAdminUser(req)) {
        const existingQueries = (existing.canvasLayout as any)?.queries;
        canvasLayout.queries = existingQueries;
      }

      if (isDefault && !existing.isDefault) {
        await tx
          .update(schema.documentTemplates)
          .set({ isDefault: false })
          .where(eq(schema.documentTemplates.docType, existing.docType));
      }

      const updates: any = { updatedAt: new Date() };
      if (typeof name === 'string') updates.name = name;
      if (typeof html === 'string') updates.html = html;
      if (typeof isDefault === 'boolean') updates.isDefault = isDefault;
      if (canvasLayout !== undefined) updates.canvasLayout = canvasLayout;
      if (typeof legacyHtml === 'boolean') updates.legacyHtml = legacyHtml;

      await tx
        .update(schema.documentTemplates)
        .set(updates)
        .where(eq(schema.documentTemplates.id, req.params.id));
    });
    PdfRenderer.invalidateCache();
    res.json({ ok: true });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'DocumentTemplate',
      entityId: req.params.id,
      action: 'UPDATE',
      newValue: req.body,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * POST /resync-defaults — regenera el HTML de las plantillas marcadas como
 * `isDefault: true` usando el último `getDefaultTemplate()` de @openfactu/pdf.
 * Se usa tras publicar una versión nueva del paquete (cambio de paleta, nuevos
 * bloques, etc.) para que los tenants ya existentes recojan los cambios sin
 * tocar sus plantillas custom.
 *
 * Sólo ADMIN/SUPERUSER.
 */
router.post('/resync-defaults', async (req: any, res) => {
  if (!isAdminUser(req)) return res.status(403).json({ error: 'Solo admin/superuser' });
  try {
    const schemaName = req.tenantSchema;
    if (!schemaName) return res.status(400).json({ error: 'Tenant schema no resuelto' });
    const count = await MigrationManager.resyncDefaultTemplates(schemaName);
    PdfRenderer.invalidateCache();
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'DocumentTemplate',
      entityId: 'defaults',
      action: 'UPDATE',
      newValue: { resyncedCount: count },
    });
    res.json({ ok: true, count });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /:id/set-default
router.post('/:id/set-default', async (req: any, res) => {
  try {
    await req.tenantClient.transaction(async (tx: any) => {
      const [existing] = await tx
        .select()
        .from(schema.documentTemplates)
        .where(eq(schema.documentTemplates.id, req.params.id));
      if (!existing) throw new Error('No encontrada');
      await tx
        .update(schema.documentTemplates)
        .set({ isDefault: false })
        .where(eq(schema.documentTemplates.docType, existing.docType));
      await tx
        .update(schema.documentTemplates)
        .set({ isDefault: true })
        .where(eq(schema.documentTemplates.id, req.params.id));
    });
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /:id
router.delete('/:id', async (req: any, res) => {
  try {
    await req.tenantClient.transaction(async (tx: any) => {
      const [existing] = await tx
        .select()
        .from(schema.documentTemplates)
        .where(eq(schema.documentTemplates.id, req.params.id));
      if (!existing) return;
      await tx
        .delete(schema.documentTemplates)
        .where(eq(schema.documentTemplates.id, req.params.id));
      // Si era default, promover el primer restante del mismo docType
      if (existing.isDefault) {
        const [next] = await tx
          .select()
          .from(schema.documentTemplates)
          .where(eq(schema.documentTemplates.docType, existing.docType))
          .limit(1);
        if (next) {
          await tx
            .update(schema.documentTemplates)
            .set({ isDefault: true })
            .where(eq(schema.documentTemplates.id, next.id));
        }
      }
    });
    PdfRenderer.invalidateCache();
    res.json({ ok: true });
    logAudit({
      tenantClient: req.tenantClient,
      tenantId: req.tenantId || '',
      userId: req.user?.id,
      entityType: 'DocumentTemplate',
      entityId: req.params.id,
      action: 'DELETE',
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /preview — renderiza un PDF sin persistir
router.post('/preview', async (req: any, res) => {
  try {
    const { html, docType, sampleDocId, queries, params } = req.body;
    if (!html) return res.status(400).json({ error: 'html es obligatorio' });
    if (!isValidDocType(docType)) return res.status(400).json({ error: 'docType inválido' });

    // Consultas SQL: solo admins. Si se envían desde un rol no admin, las ignoramos.
    const safeQueries: TemplateQuery[] = Array.isArray(queries) && isAdminUser(req) ? queries : [];

    // Resolución del payload: priorizar sampleDocId, luego último documento
    // del tenant, y si cualquier paso explota, fallback a fixture. Un preview
    // nunca debe dar 500 por ausencia/fallo de datos de muestra.
    // Para plantillas FREE no hay payload de documento — solo `queries`.
    let payload: any;
    if (isFreeDocType(docType)) {
      payload = {};
    } else {
      try {
        if (sampleDocId) {
          payload = await PdfPayloadBuilder.build(docType, sampleDocId, req.tenantClient);
        } else {
          const latestId = req.tenantClient
            ? await PdfPayloadBuilder.findLatestSampleId(docType, req.tenantClient).catch(
                () => null,
              )
            : null;
          payload = latestId
            ? await PdfPayloadBuilder.build(docType, latestId, req.tenantClient).catch(() =>
                PdfPayloadBuilder.fixture(docType),
              )
            : PdfPayloadBuilder.fixture(docType);
        }
      } catch (err) {
        console.warn('[DocumentTemplates] preview payload fallback to fixture:', err);
        payload = PdfPayloadBuilder.fixture(docType);
      }
    }

    // Ejecuta consultas SQL de la plantilla (si las hay y el usuario es admin)
    // e inyecta resultados bajo `queries.<name>` antes de renderizar. Para
    // FREE aceptamos `params` arbitrarios (`:itemId`, `:lote`, ...) que el
    // diseñador envía como contexto de prueba.
    const extraParams = (params && typeof params === 'object' ? params : {}) as Record<
      string,
      unknown
    >;
    const queryResults = await runTemplateQueries(req.tenantClient, safeQueries, {
      docId: (payload as any)?.doc?.id ?? sampleDocId ?? null,
      partnerId: (payload as any)?.partner?.id ?? null,
      companyId: (payload as any)?.company?.id ?? null,
      tenantId: req.tenantId ?? null,
      ...extraParams,
    } as any);
    const enrichedPayload = {
      ...payload,
      queries: queryResults.byName,
      generatedAt: (payload as any)?.generatedAt ?? new Date().toLocaleString('es-ES'),
    } as any;
    if (queryResults.errors.length > 0) {
      console.warn(
        '[DocumentTemplates] preview queries with errors:',
        JSON.stringify(queryResults.errors),
      );
    }

    registerCanvasHelpers();
    const meta = extractMetaFromHtml(html);
    const renderOptions = meta ? PdfRenderer.renderOptionsFromVisual(meta) : {};
    // Invalida cache de plantillas compiladas por si el HTML cambió con nuevos
    // helpers registrados después de una compilación previa.
    PdfRenderer.invalidateCache();
    const buffer = await PdfRenderer.render(html, enrichedPayload, renderOptions);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="preview.pdf"');
    res.end(buffer);
  } catch (e: any) {
    const msg = e?.stack || String(e);
    console.error('[DocumentTemplates] preview error:', msg);
    try {
      fs.appendFileSync(
        '/tmp/openfactu-preview-errors.log',
        `\n[${new Date().toISOString()}]\n${msg}\n`,
      );
    } catch {
      /* ignore */
    }
    res.status(500).json({ error: e?.message || 'Error al renderizar el preview' });
  }
});

// POST /:id/render-free — renderiza una plantilla de tipo FREE (sin payload
// de documento) ejecutando sus consultas SQL con los `params` recibidos como
// placeholders y devolviendo el PDF inline. Útil para etiquetas de artículos
// y otros impresos que no parten de un documento existente.
router.post('/:id/render-free', async (req: any, res) => {
  try {
    const [tpl] = await req.tenantClient
      .select()
      .from(schema.documentTemplates)
      .where(eq(schema.documentTemplates.id, req.params.id));
    if (!tpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
    if (!isFreeDocType(tpl.docType)) {
      return res.status(400).json({
        error: 'Sólo plantillas de tipo FREE o LABEL pueden renderizarse con render-free',
      });
    }
    if (!tpl.html) {
      return res.status(400).json({ error: 'La plantilla no tiene html' });
    }

    const params = (req.body?.params ?? {}) as Record<string, unknown>;
    const copies = Math.max(1, Math.min(200, Number(req.body?.copies ?? 1) || 1));

    // Las queries de la plantilla viven en canvasLayout.queries (FREE solo
    // tiene sentido si las define un admin). En cualquier caso ejecutamos las
    // queries con el contexto plano `params` permitiendo placeholders
    // arbitrarios (:itemId, :lote, :foo) además de los estándar.
    const layoutQueries: TemplateQuery[] = ((tpl.canvasLayout as any)?.queries ??
      []) as TemplateQuery[];
    const queryResults = await runTemplateQueries(req.tenantClient, layoutQueries, {
      // Mapeo flexible: cualquier clave de `params` sirve de placeholder.
      // Mantenemos las claves estándar para retrocompatibilidad si la query
      // las usa (`:docId`, `:partnerId`, `:companyId`, `:tenantId`).
      docId: (params.docId as string) ?? null,
      partnerId: (params.partnerId as string) ?? null,
      companyId: (params.companyId as string) ?? null,
      tenantId: req.tenantId ?? null,
      ...params,
    } as any);

    const enrichedPayload: any = {
      params,
      queries: queryResults.byName,
      // Fecha de generación para el elemento "Fecha" (FREE no trae documento).
      generatedAt: new Date().toLocaleString('es-ES'),
    };

    // Logueamos en consola y en una cabecera de respuesta cualquier error de
    // query — útil para depurar etiquetas que salen en blanco por una columna
    // inexistente, un placeholder mal escrito o una migración pendiente.
    if (queryResults.errors.length > 0) {
      console.warn(
        '[DocumentTemplates] render-free query errors:',
        JSON.stringify(queryResults.errors),
      );
      res.setHeader(
        'X-Render-Free-Errors',
        Buffer.from(JSON.stringify(queryResults.errors)).toString('base64'),
      );
    }
    // Diagnóstico extra: también incluimos qué nombres de query devolvieron
    // filas y cuántas — visible en DevTools → Network.
    res.setHeader(
      'X-Render-Free-Counts',
      Object.entries(queryResults.byName)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : 0}`)
        .join(';') || 'none',
    );

    registerCanvasHelpers();
    const meta = extractMetaFromHtml(tpl.html);
    const renderOptions = meta ? PdfRenderer.renderOptionsFromVisual(meta) : {};

    // Si se piden N copias, repetimos el cuerpo del HTML compilado tantas
    // veces como copias separando con un salto de página, para que cada
    // etiqueta salga en su propia página.
    let html = tpl.html;
    if (copies > 1) {
      // Heurística: insertamos una página adicional duplicando el contenido
      // entre <body>...</body> con un page-break entre copias. Si no hay
      // <body>, repetimos el html completo.
      const bodyMatch = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
      if (bodyMatch) {
        const inner = bodyMatch[1];
        const sep = '<div style="page-break-after:always"></div>';
        const repeated = Array.from({ length: copies }, () => inner).join(sep);
        html = html.replace(bodyMatch[0], `<body>${repeated}</body>`);
      } else {
        const sep = '<div style="page-break-after:always"></div>';
        html = Array.from({ length: copies }, () => tpl.html).join(sep);
      }
    }

    PdfRenderer.invalidateCache();
    const buffer = await PdfRenderer.render(html, enrichedPayload, renderOptions);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="etiqueta.pdf"');
    res.end(buffer);
  } catch (e: any) {
    console.error('[DocumentTemplates] render-free error:', e?.stack || e);
    res.status(500).json({ error: e?.message || 'Error al renderizar' });
  }
});

// POST /test-query — admin-only: ejecuta una única query contra el tenant
// activo y devuelve las primeras filas para validar su sintaxis/resultado
// desde el diseñador.
router.post('/test-query', async (req: any, res) => {
  try {
    if (!isAdminUser(req)) {
      return res.status(403).json({ error: 'Solo disponible para administradores' });
    }
    const { name, sql: rawSql, sampleDocId, sampleDocType, params } = req.body ?? {};
    if (typeof rawSql !== 'string' || !rawSql.trim()) {
      return res.status(400).json({ error: 'sql es obligatorio' });
    }
    const validation = validateQuery(rawSql);
    if (validation) return res.status(400).json({ error: validation });

    // Intentamos construir un payload de ejemplo para obtener ids que alimenten
    // los placeholders (:docId, :partnerId, :companyId). Si no hay sample, se
    // ejecuta con nulls — útil para queries que no dependan de contexto.
    let ctxPayload: any = null;
    try {
      if (sampleDocId && isValidDocType(sampleDocType)) {
        ctxPayload = await PdfPayloadBuilder.build(sampleDocType, sampleDocId, req.tenantClient);
      }
    } catch {
      /* sin contexto */
    }

    const result = await runTemplateQueries(
      req.tenantClient,
      [{ name: name || 'test', sql: rawSql }],
      {
        docId: ctxPayload?.doc?.id ?? sampleDocId ?? null,
        partnerId: ctxPayload?.partner?.id ?? null,
        companyId: ctxPayload?.company?.id ?? null,
        tenantId: req.tenantId ?? null,
        ...(params && typeof params === 'object' ? params : {}),
      },
    );
    const key = Object.keys(result.byName)[0];
    if (!key) {
      return res.json({ ok: false, error: result.errors[0]?.error || 'Error desconocido' });
    }
    const rows = result.byName[key];
    res.json({
      ok: true,
      rows: rows.slice(0, 50),
      rowCount: rows.length,
      truncated: rows.length >= 1000,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// POST /:id/param-options — opciones (value/label) de un parámetro de tipo lista
// cuya fuente es una consulta (`optionsQuery` definida por un admin en la
// plantilla). Disponible para cualquier usuario del tenant (solo lectura): no
// ejecuta SQL arbitrario del cliente, solo la consulta guardada en la plantilla.
router.post('/:id/param-options', async (req: any, res) => {
  try {
    const paramName = String(req.body?.param ?? '');
    if (!paramName) return res.status(400).json({ error: 'param es obligatorio' });
    const [tpl] = await req.tenantClient
      .select()
      .from(schema.documentTemplates)
      .where(eq(schema.documentTemplates.id, req.params.id));
    if (!tpl) return res.status(404).json({ error: 'Plantilla no encontrada' });
    const schemaDefs: any[] = (tpl.canvasLayout as any)?.paramsSchema ?? [];
    const def = schemaDefs.find((p) => p?.name === paramName);
    const sqlText = def?.optionsQuery;
    if (!sqlText || typeof sqlText !== 'string') return res.json({ options: [] });

    const validation = validateQuery(sqlText);
    if (validation) return res.status(400).json({ error: validation });

    const result = await runTemplateQueries(req.tenantClient, [{ name: 'opts', sql: sqlText }], {
      docId: null,
      partnerId: null,
      companyId: null,
      tenantId: req.tenantId ?? null,
    } as any);
    if (result.errors.length > 0) {
      return res.json({ options: [], error: result.errors[0]?.error });
    }
    const rows = (result.byName['opts'] ?? []) as Record<string, unknown>[];
    // Convención: columnas `value` y `label`. Si faltan, 1ª col = value, 2ª = label.
    const options = rows.map((r) => {
      const keys = Object.keys(r);
      const value = r.value !== undefined ? r.value : r[keys[0]];
      const label = r.label !== undefined ? r.label : (r[keys[1]] ?? value);
      return { value: String(value ?? ''), label: String(label ?? '') };
    });
    res.json({ options });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
