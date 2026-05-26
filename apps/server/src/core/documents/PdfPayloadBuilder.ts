import { eq, inArray, desc, and, isNull, sql } from 'drizzle-orm';
import crypto from 'crypto';
import * as schema from '../../db/schema';
import { ClientFactory } from '../tenant/ClientFactory';
import { DocumentRegistry } from './DocumentRegistry';
import type {
  DocType,
  DocumentPdfPayload,
  DocumentLineData,
  TaxBreakdownEntry,
  PartnerAddressObject,
} from '@openfactu/pdf';
import { amountToSpanishWords } from '../../utils/numberToWords';

/**
 * Helper que construye un objeto de tablas desde el registry.
 * Reemplaza el antiguo TABLE_MAP hardcodeado.
 */
function getDocTables(docType: DocType) {
  const config = DocumentRegistry.get(docType);
  const baseConfig = config.baseDocType ? DocumentRegistry.get(config.baseDocType) : undefined;
  return {
    header: config.schemaTable,
    lines: config.lineSchemaTable,
    batches: config.batchSchemaTable,
    lineFk: config.lineFk,
    supportsBase: !!config.baseDocType,
    baseType: config.baseDocType,
    baseTable: baseConfig?.schemaTable,
    config,
  };
}

// Etiquetas de estado para PDF — se obtienen del registry por docType,
// pero mantenemos este fallback genérico para estados no registrados.
const DEFAULT_STATUS_LABELS: Record<string, string> = {
  O: 'Abierto',
  C: 'Cerrado',
  X: 'Cancelado',
  P: 'Parcial',
  D: 'Borrador',
};

function parseTaxBreakdown(raw: any): TaxBreakdownEntry[] {
  if (!raw) return [];
  try {
    const obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Object.entries(obj).map(([rate, v]: any) => ({
      rate: Number(rate),
      base: Number(v.base || 0),
      tax: Number(v.tax || 0),
    }));
  } catch {
    return [];
  }
}

function formatDocCode(prefix: string | null, periodCode: string | null, docNum: number): string {
  const p = prefix || '';
  const c = periodCode || '';
  return `${p}-${c}-${String(docNum).padStart(6, '0')}`;
}

function formatAddressString(addr: any, countryName?: string | null): string | null {
  if (!addr) return null;
  const parts: string[] = [];
  if (addr.street) parts.push(addr.street);
  const cityLine: string[] = [];
  if (addr.zipCode) cityLine.push(addr.zipCode);
  if (addr.city) cityLine.push(addr.city);
  if (cityLine.length > 0) parts.push(cityLine.join(' '));
  if (addr.state) parts.push(addr.state);
  // Si tenemos countryName (desde Country.name), lo usamos; si no, fallback a addr.country text
  const country = countryName || addr.country;
  if (country) parts.push(country);
  return parts.length > 0 ? parts.join(', ') : null;
}

function addressObject(addr: any): PartnerAddressObject | null {
  if (!addr) return null;
  return {
    street: addr.street || null,
    city: addr.city || null,
    state: addr.state || null,
    zipCode: addr.zipCode || null,
    country: addr.country || null,
  };
}

/**
 * Resuelve la firma a imprimir en el PDF. Prioridad:
 *   1. Firma del usuario creador del documento (override personal).
 *   2. Firma de la empresa (config global).
 *
 * Si la imagen está en un endpoint /api/... (referencia al storage adapter),
 * la pre-descargamos y la convertimos a data URI para que Puppeteer pueda
 * renderizarla sin credenciales. data: URIs y http(s)://... se pasan tal cual.
 */
async function resolveSignature(ctx: {
  db: any;
  header: any;
  configVal: (k: string, alt?: string) => any;
}): Promise<{ show: boolean; name: string; role: string; imageUrl: string }> {
  const { db, header, configVal } = ctx;
  const show = configVal('signature_show_in_pdf', 'signatureShowInPdf') === 'true';

  // 1. Intentar firma del creador (tabla pública globalUsers).
  let name = '';
  let role = '';
  let imageUrl: string | null = null;
  // `createdBy` puede no estar en el schema Drizzle de la cabecera — leemos
  // vía raw query por id para no depender de la declaración.
  let createdBy: string | null = (header as any)?.createdBy || null;
  if (!createdBy && (header as any)?.id) {
    try {
      const tables: Record<string, string> = {
        SINV: 'SalesInvoice',
        PINV: 'PurchaseInvoice',
        SO: 'SalesOrder',
        PO: 'PurchaseOrder',
        SDN: 'SalesDeliveryNote',
        PDN: 'PurchaseDeliveryNote',
      };
      // Detectamos el tipo por propiedades de la cabecera — si es factura
      // suele haber `isLocked`; si no, buscamos el `id` en cada tabla.
      const { sql } = await import('drizzle-orm');
      for (const tbl of Object.values(tables)) {
        try {
          const r: any = await db.execute(
            sql.raw(
              `SELECT "createdBy" FROM "${tbl}" WHERE "id" = '${(header as any).id}' LIMIT 1`,
            ),
          );
          const val = r.rows?.[0]?.createdBy || r[0]?.createdBy;
          if (val) {
            createdBy = val;
            break;
          }
        } catch {
          /* tabla no existe / no tiene la columna → sigue */
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (createdBy) {
    try {
      const publicDb = ClientFactory.getClient('public');
      const [u] = await publicDb
        .select({
          signatureName: schema.globalUsers.signatureName,
          signatureRole: schema.globalUsers.signatureRole,
          signatureImageUrl: schema.globalUsers.signatureImageUrl,
        })
        .from(schema.globalUsers)
        .where(eq(schema.globalUsers.id, createdBy));
      if (u?.signatureName) name = u.signatureName;
      if (u?.signatureRole) role = u.signatureRole;
      if (u?.signatureImageUrl) imageUrl = u.signatureImageUrl;
      // Si la firma de usuario apunta a su propio endpoint, pre-fetch del attachment en DB.
      if (
        imageUrl &&
        (imageUrl.startsWith('/api/profile/me/signature') ||
          imageUrl.startsWith('/api/users/me/signature'))
      ) {
        const dataUri = await userSignatureToDataUri(db, createdBy);
        if (dataUri) imageUrl = dataUri;
      }
    } catch {
      /* fallback a empresa */
    }
  }

  // 2. Fallback: firma de empresa.
  if (!name) name = configVal('signature_name', 'signatureName') || '';
  if (!role) role = configVal('signature_role', 'signatureRole') || '';
  if (!imageUrl) imageUrl = configVal('signature_image_url', 'signatureImageUrl') || '';

  // 3. Si la URL apunta al endpoint de firma de empresa, pre-fetch del storage.
  if (imageUrl && imageUrl.startsWith('/api/company/signature')) {
    const dataUri = await companySignatureToDataUri(db);
    if (dataUri) imageUrl = dataUri;
  }

  const result = { show, name, role, imageUrl: imageUrl || '' };
  console.log('[PdfPayload.signature]', {
    show: result.show,
    name: result.name,
    role: result.role,
    hasImage: !!result.imageUrl,
    imageIsDataUri: result.imageUrl?.startsWith('data:'),
    imageLen: result.imageUrl?.length || 0,
  });
  return result;
}

async function userSignatureToDataUri(tenantDb: any, userId: string): Promise<string | null> {
  try {
    const [att] = await tenantDb
      .select()
      .from(schema.attachments)
      .where(
        and(
          eq(schema.attachments.entityType, 'UserSignature'),
          eq(schema.attachments.entityId, userId),
          isNull(schema.attachments.deletedAt),
        ),
      )
      .orderBy(desc(schema.attachments.uploadedAt))
      .limit(1);
    if (!att) return null;
    return await attachmentToDataUri(tenantDb, att);
  } catch {
    return null;
  }
}

async function companySignatureToDataUri(tenantDb: any): Promise<string | null> {
  try {
    const [att] = await tenantDb
      .select()
      .from(schema.attachments)
      .where(
        and(
          eq(schema.attachments.entityType, 'CompanySignature'),
          eq(schema.attachments.entityId, 'signature'),
          isNull(schema.attachments.deletedAt),
        ),
      )
      .orderBy(desc(schema.attachments.uploadedAt))
      .limit(1);
    if (!att) return null;
    return await attachmentToDataUri(tenantDb, att);
  } catch {
    return null;
  }
}

async function attachmentToDataUri(tenantDb: any, att: any): Promise<string | null> {
  try {
    const { StorageResolver } = await import('../storage/StorageResolver');
    // Necesitamos el schema del tenant — usamos el connection string que el db ya usa.
    // El tenantSchema se pasa a StorageResolver; lo extraemos del search_path.
    const res: any = await tenantDb.execute(
      (await import('drizzle-orm')).sql.raw(`SELECT current_schema() as schema`),
    );
    const tenantSchema = (res.rows?.[0]?.schema || res[0]?.schema) as string | undefined;
    if (!tenantSchema) return null;
    const adapter = await StorageResolver.forProvider(att.provider, tenantDb, tenantSchema);
    const dl = await adapter.download({ tenantSchema, externalId: att.externalId });
    const chunks: Buffer[] = [];
    for await (const chunk of dl.stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const b64 = Buffer.concat(chunks).toString('base64');
    return `data:${att.mime};base64,${b64}`;
  } catch {
    return null;
  }
}

export class PdfPayloadBuilder {
  public static async build(
    docType: DocType,
    documentId: string,
    db: any,
  ): Promise<DocumentPdfPayload> {
    const map = getDocTables(docType);
    const config = map.config;

    // 1. Header + series + period
    const [headerRow] = await db
      .select({
        header: map.header,
        seriesPrefix: schema.documentSeries.prefix,
        periodCode: schema.accountingPeriods.code,
      })
      .from(map.header)
      .leftJoin(schema.documentSeries, eq(map.header.seriesId, schema.documentSeries.id))
      .leftJoin(schema.accountingPeriods, eq(map.header.periodId, schema.accountingPeriods.id))
      .where(eq(map.header.id, documentId));

    if (!headerRow) throw new Error(`Documento ${documentId} no encontrado`);
    const header: any = { ...headerRow.header };

    // Leer columnas custom `p_*` del header. Drizzle solo proyecta lo que
    // declara en el schema, así que los campos plugin/user se perderían.
    try {
      const headerPgName = config.headerPgName;
      if (headerPgName) {
        const rawH: any = await db.execute(
          sql.raw(
            `SELECT * FROM "${headerPgName}" WHERE "id" = '${String(documentId).replace(/'/g, "''")}'`,
          ),
        );
        const raw = rawH.rows?.[0] || {};
        for (const [k, v] of Object.entries(raw)) {
          if (k.startsWith('p_')) header[k] = v;
        }
      }
    } catch {
      /* si falla (p.ej. el cliente no está configurado con search_path), lo ignoramos y el header sigue sin `p_*` */
    }

    // 2. Partner + priceList
    const [partner] = await db
      .select()
      .from(schema.businessPartners)
      .where(eq(schema.businessPartners.id, header.partnerId));

    let priceListName: string | null = null;
    if (partner?.priceListId) {
      const [pl] = await db
        .select()
        .from(schema.priceLists)
        .where(eq(schema.priceLists.id, partner.priceListId));
      priceListName = pl?.name || null;
    }

    // 2.b Partner addresses (default + billing + shipping)
    let defaultAddr: any = null;
    let billingAddr: any = null;
    let shippingAddr: any = null;
    if (partner) {
      const addresses = await db
        .select()
        .from(schema.partnerAddresses)
        .where(eq(schema.partnerAddresses.partnerId, partner.id));
      defaultAddr = addresses.find((a: any) => a.isDefault) || addresses[0] || null;
      billingAddr = addresses.find((a: any) => a.type === 'B') || defaultAddr;
      shippingAddr = addresses.find((a: any) => a.type === 'S') || defaultAddr;
    }

    // 2.c Resolver nombre del país del partner (desde la tabla public Country)
    let partnerCountryName: string | null = null;
    const partnerCountryCode = partner?.countryCode || defaultAddr?.countryCode;
    if (partnerCountryCode) {
      try {
        const publicDb = (await import('../tenant/ClientFactory')).ClientFactory.getClient(
          'public',
        );
        const [country] = await publicDb
          .select({ name: schema.countries.name })
          .from(schema.countries)
          .where(eq(schema.countries.code, partnerCountryCode.toUpperCase()));
        partnerCountryName = country?.name || null;
      } catch {
        /* ignorar */
      }
    }

    // 3. Lines
    const lineRows = await db.select().from(map.lines).where(eq(map.lines[map.lineFk], documentId));

    // Mergear columnas custom `p_*` en cada línea (Drizzle no las proyecta).
    try {
      const linePgName = config.linePgName;
      if (linePgName && lineRows.length > 0) {
        const ids = lineRows.map((l: any) => `'${String(l.id).replace(/'/g, "''")}'`).join(',');
        const rawL: any = await db.execute(
          sql.raw(`SELECT * FROM "${linePgName}" WHERE "id" IN (${ids})`),
        );
        const byId: Record<string, Record<string, any>> = {};
        for (const r of rawL.rows || []) {
          const entry: Record<string, any> = {};
          for (const [k, v] of Object.entries(r)) {
            if (k.startsWith('p_')) entry[k] = v;
          }
          byId[(r as any).id] = entry;
        }
        for (const l of lineRows) {
          Object.assign(l, byId[l.id] || {});
        }
      }
    } catch {
      /* tolerante a fallos */
    }

    // 4. Items + UoM + Category (batch fetch)
    const itemIds = [...new Set(lineRows.map((l: any) => l.itemId))];
    const itemList =
      itemIds.length > 0
        ? await db
            .select()
            .from(schema.items)
            .where(inArray(schema.items.id, itemIds as string[]))
        : [];
    const itemsMap = new Map(itemList.map((i: any) => [i.id, i]));

    // UoMs: recoger tanto las base de los artículos como las elegidas por línea
    const uomIds = [
      ...new Set(
        [...itemList.map((i: any) => i.uomId), ...lineRows.map((l: any) => l.uomId)].filter(
          Boolean,
        ),
      ),
    ];
    const uomList =
      uomIds.length > 0
        ? await db
            .select()
            .from(schema.unitsOfMeasure)
            .where(inArray(schema.unitsOfMeasure.id, uomIds as string[]))
        : [];
    const uomMap = new Map(uomList.map((u: any) => [u.id, u.code]));

    const categoryIds = [...new Set(itemList.map((i: any) => i.categoryId).filter(Boolean))];
    const catList =
      categoryIds.length > 0
        ? await db
            .select()
            .from(schema.categories)
            .where(inArray(schema.categories.id, categoryIds as string[]))
        : [];
    const catMap = new Map(catList.map((c: any) => [c.id, c.name]));

    // 5. Tax groups
    const taxIds = [...new Set(lineRows.map((l: any) => l.taxGroupId).filter(Boolean))];
    const taxList =
      taxIds.length > 0
        ? await db
            .select()
            .from(schema.taxGroups)
            .where(inArray(schema.taxGroups.id, taxIds as string[]))
        : [];
    const taxRateMap = new Map(taxList.map((t: any) => [t.id, Number(t.rate)]));

    // 6. Batches per line
    let batchesMap = new Map<string, Array<{ batchNum: string; quantity: number }>>();
    if (map.batches && lineRows.length > 0) {
      const fkCol = 'invoiceLineId' in map.batches ? 'invoiceLineId' : 'deliveryLineId';
      const lineIds = lineRows.map((l: any) => l.id);
      const batchRows = await db
        .select()
        .from(map.batches)
        .where(inArray((map.batches as any)[fkCol], lineIds));
      for (const b of batchRows) {
        const lineId = (b as any)[fkCol];
        const arr = batchesMap.get(lineId) || [];
        arr.push({ batchNum: b.batchNum, quantity: Number(b.quantity) });
        batchesMap.set(lineId, arr);
      }
    }

    // 7. Base document code
    let baseDocCode: string | null = null;
    if (map.supportsBase && map.baseTable && map.baseType) {
      const linesWithBase = lineRows.filter((l: any) => l.baseType === map.baseType && l.baseId);
      if (linesWithBase.length > 0) {
        const baseIds = [...new Set(linesWithBase.map((l: any) => l.baseId))];
        const [baseRow] = await db
          .select({
            docNum: map.baseTable.docNum,
            prefix: schema.documentSeries.prefix,
            periodCode: schema.accountingPeriods.code,
          })
          .from(map.baseTable)
          .leftJoin(schema.documentSeries, eq(map.baseTable.seriesId, schema.documentSeries.id))
          .leftJoin(
            schema.accountingPeriods,
            eq(map.baseTable.periodId, schema.accountingPeriods.id),
          )
          .where(inArray(map.baseTable.id, baseIds as string[]));
        if (baseRow) {
          baseDocCode = formatDocCode(baseRow.prefix, baseRow.periodCode, baseRow.docNum);
        }
      }
    }

    // 7.b Proyecto (InternalOrder) en cabecera — opcional, mostrado si la
    // plantilla activa `showInternalOrder` (ver renderDocumentPdf).
    let internalOrder: { code: string; name: string } | null = null;
    if (header.internalOrderId) {
      try {
        const [io] = await db
          .select({
            code: schema.internalOrders.code,
            name: schema.internalOrders.name,
          })
          .from(schema.internalOrders)
          .where(eq(schema.internalOrders.id, header.internalOrderId));
        if (io) internalOrder = { code: io.code, name: io.name };
      } catch {
        /* tolerante: si la cabecera tiene un id huérfano, lo ignoramos */
      }
    }

    // 8. Company info desde SystemConfig
    const companyRows = await db.select().from(schema.systemConfigs);
    const cfg: Record<string, string> = {};
    for (const r of companyRows) cfg[r.key] = r.value || '';
    // Buscamos la clave en varios sitios: el endpoint `/api/config/fiscal`
    // añade prefijo `fiscal_` a todas sus claves — así `signature_name` se
    // guarda como `fiscal_signature_name`. Igual con branding/format.
    // Priorizamos la clave directa y luego los prefijos de sección.
    const configVal = (snake: string, camel: string): string | null =>
      cfg[snake] ||
      cfg[camel] ||
      cfg[`fiscal_${snake}`] ||
      cfg[`branding_${snake}`] ||
      cfg[`format_${snake}`] ||
      null;

    // 8b. Plugin fields — campos custom de la cabecera
    const pluginFieldRows = await db.select().from(schema.pluginFields);
    const headerTableName = config.headerPgName;
    const isVisibleInPdf = (pf: any) =>
      !pf.visibleIn ||
      !Array.isArray(pf.visibleIn) ||
      pf.visibleIn.length === 0 ||
      pf.visibleIn.includes('pdf');
    const headerPluginFields = pluginFieldRows
      .filter((pf: any) => pf.tableName === headerTableName)
      .filter(isVisibleInPdf);
    const customFields: Record<string, any> = {};
    for (const pf of headerPluginFields) {
      if (header[pf.fieldName] != null) {
        customFields[pf.label || pf.fieldName] = header[pf.fieldName];
      }
    }

    const lineTableName = headerTableName + 'Line';
    const linePluginFields = pluginFieldRows
      .filter((pf: any) => pf.tableName === lineTableName)
      .filter(isVisibleInPdf);

    // 9. Líneas — ordenar y mapear
    const lines: DocumentLineData[] = lineRows
      .sort((a: any, b: any) => (a.lineNum || 0) - (b.lineNum || 0))
      .map((l: any) => {
        const it: any = itemsMap.get(l.itemId);
        // Preferir la UoM elegida en la línea; si no hay, la base del artículo
        const effectiveUomId = l.uomId || it?.uomId;
        const uomCode = effectiveUomId
          ? (uomMap.get(effectiveUomId) as string | undefined) || null
          : null;
        const category = it?.categoryId
          ? (catMap.get(it.categoryId) as string | undefined) || null
          : null;
        // Plugin fields de la línea (columnas p_* o desde pluginData jsonb)
        const lineCustom: Record<string, any> = {};
        for (const pf of linePluginFields) {
          const val = l.pluginData?.[pf.fieldName] ?? l[pf.fieldName];
          if (val != null) lineCustom[pf.label || pf.fieldName] = val;
        }

        return {
          lineNum: l.lineNum,
          itemId: l.itemId,
          itemCode: it?.code || '',
          itemName: it?.name || 'Artículo',
          itemDescription: it?.description || null,
          quantity: Number(l.quantity),
          uom: uomCode,
          price: Number(l.price),
          taxRate: (taxRateMap.get(l.taxGroupId) as number) ?? 0,
          lineTotal: Number(l.lineTotal),
          category,
          batches: batchesMap.get(l.id) || [],
          customFields: Object.keys(lineCustom).length > 0 ? lineCustom : undefined,
        };
      });

    // 10. Total en letras
    const totalInWords = amountToSpanishWords(Number(header.total));

    const payload: DocumentPdfPayload = {
      doc: {
        id: header.id,
        docCode: formatDocCode(headerRow.seriesPrefix, headerRow.periodCode, header.docNum),
        date: new Date(header.date).toLocaleDateString('es-ES'),
        status: header.status,
        statusLabel:
          config.statusLabels[header.status] ||
          DEFAULT_STATUS_LABELS[header.status] ||
          header.status,
        subtotal: Number(header.subtotal),
        taxTotal: Number(header.taxTotal),
        total: Number(header.total),
        withholdingAmount:
          (header as any).withholdingAmount != null && Number((header as any).withholdingAmount) > 0
            ? Number((header as any).withholdingAmount)
            : null,
        withholdingRate:
          (header as any).withholdingRate != null && Number((header as any).withholdingRate) > 0
            ? Number((header as any).withholdingRate)
            : null,
        totalInWords,
        taxBreakdown: parseTaxBreakdown(header.taxBreakdown),
        billToAddress: header.billToAddress || null,
        shipToAddress: header.shipToAddress || null,
        baseDocCode,
        customFields: Object.keys(customFields).length > 0 ? customFields : undefined,
        paymentStatus: (header as any).paymentStatus || null,
        amountPaid: (header as any).amountPaid != null ? Number((header as any).amountPaid) : 0,
        isLocked: (header as any).isLocked || false,
        dueDate: (header as any).dueDate || null,
        internalOrder,
      } as any,
      partner: {
        id: partner?.id || '',
        name: partner?.name || '',
        foreignName: partner?.foreignName || null,
        taxId: partner?.nif || null,
        address: formatAddressString(defaultAddr, partnerCountryName),
        billingAddress: addressObject(billingAddr),
        shippingAddress: addressObject(shippingAddr),
        email: partner?.email || null,
        phone: partner?.phone || null,
        website: partner?.website || null,
        priceListName,
      },
      company: {
        name: configVal('company_name', 'companyName') || 'Mi Empresa',
        taxId: configVal('company_tax_id', 'companyTaxId'),
        address: configVal('company_address', 'companyAddress'),
        phone: configVal('company_phone', 'companyPhone'),
        email: configVal('company_email', 'companyEmail'),
        website: configVal('company_website', 'companyWebsite'),
        logoUrl: configVal('company_logo_url', 'companyLogoUrl'),
        iban: configVal('company_iban', 'companyIban'),
        bankName: configVal('company_bank_name', 'companyBankName'),
        bankSwift: configVal('company_bank_swift', 'companyBankSwift'),
        invoiceFooter: configVal('company_invoice_footer', 'companyInvoiceFooter'),
        signature: await resolveSignature({
          db,
          header,
          configVal,
        }),
      } as any,
      lines,
      generatedAt: new Date().toLocaleString('es-ES'),
    };

    // ─── Trazabilidad del documento ───────────────────────────────────
    // `docHash` = primeros 12 caracteres del SHA-256 sobre los campos
    // estables del payload (docCode + totales + fecha + líneas con sus
    // lotes). Es un resumen de integridad, no una firma criptográfica;
    // vale como comprobante rápido de que el PDF corresponde al estado
    // guardado del documento.
    const hashSource = JSON.stringify({
      docCode: payload.doc.docCode,
      date: payload.doc.date,
      total: payload.doc.total,
      subtotal: payload.doc.subtotal,
      lines: lines.map((l) => ({
        c: l.itemCode,
        q: l.quantity,
        p: l.price,
        b: l.batches?.map((b: any) => `${b.batchNum}:${b.quantity}`) || [],
      })),
    });
    const docHash = crypto
      .createHash('sha256')
      .update(hashSource)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase();

    // `qrPayload` — string compacto verificable. Formato:
    //   KR|{docType}|{docCode}|{hash}|{total}
    // Al escanearlo, el front puede parsearlo y redirigir a la vista del
    // doc si está en el mismo tenant.
    const qrPayload = `KR|${docType}|${payload.doc.docCode}|${docHash}|${payload.doc.total.toFixed(2)}`;

    const hasBatches = lines.some((l: any) => Array.isArray(l.batches) && l.batches.length > 0);

    return { ...payload, docHash, qrPayload, hasBatches } as DocumentPdfPayload;
  }

  /**
   * Devuelve un payload fixture para preview sin sampleDocId.
   */
  public static fixture(_docType: DocType): DocumentPdfPayload {
    return {
      doc: {
        id: 'preview',
        docCode: 'FAC-A-2026-000042',
        date: new Date().toLocaleDateString('es-ES'),
        status: 'O',
        statusLabel: 'Abierto',
        subtotal: 1000.0,
        taxTotal: 210.0,
        total: 1210.0,
        totalInWords: 'mil doscientos diez euros',
        taxBreakdown: [{ rate: 21, base: 1000, tax: 210 }],
        billToAddress: 'Calle Ejemplo 42, 28001 Madrid',
        shipToAddress: 'Polígono Industrial Norte, Nave 5, 28100 Alcobendas',
        baseDocCode: null,
      },
      partner: {
        id: 'sample-partner',
        name: 'Cliente de Ejemplo S.L.',
        foreignName: null,
        taxId: 'B12345678',
        address: 'Av. Principal 1, 28001 Madrid, España',
        billingAddress: {
          street: 'Av. Principal 1',
          city: 'Madrid',
          state: null,
          zipCode: '28001',
          country: 'España',
        },
        shippingAddress: {
          street: 'Polígono Industrial Norte, Nave 5',
          city: 'Alcobendas',
          state: null,
          zipCode: '28100',
          country: 'España',
        },
        email: 'cliente@ejemplo.com',
        phone: '+34 900 000 000',
        website: 'https://ejemplo.com',
        priceListName: 'Tarifa General',
      },
      company: {
        name: 'Mi Empresa S.L.',
        taxId: 'A00000000',
        address: 'Calle Comercial 10, 28001 Madrid',
        phone: '+34 911 222 333',
        email: 'contacto@miempresa.com',
        website: 'https://miempresa.com',
        logoUrl: null,
      },
      lines: [
        {
          lineNum: 1,
          itemId: 'i1',
          itemCode: 'ART-001',
          itemName: 'Artículo de muestra 1',
          itemDescription: 'Descripción detallada del artículo',
          quantity: 2,
          uom: 'u',
          price: 250,
          taxRate: 21,
          lineTotal: 605,
          category: 'General',
        },
        {
          lineNum: 2,
          itemId: 'i2',
          itemCode: 'ART-002',
          itemName: 'Servicio profesional',
          itemDescription: null,
          quantity: 1,
          uom: 'h',
          price: 500,
          taxRate: 21,
          lineTotal: 605,
          category: 'Servicios',
          batches: [{ batchNum: 'LOT-2026-11', quantity: 1 }],
        },
      ],
      generatedAt: new Date().toLocaleString('es-ES'),
      docHash: 'A1B2C3D4E5F6',
      qrPayload: 'KR|SINV|FAC-A-2026-000042|A1B2C3D4E5F6|1210.00',
      hasBatches: true,
    };
  }

  public static async findLatestSampleId(docType: DocType, db: any): Promise<string | null> {
    const map = getDocTables(docType);
    const [row] = await db
      .select({ id: map.header.id })
      .from(map.header)
      .orderBy(desc(map.header.createdAt))
      .limit(1);
    return row?.id || null;
  }
}
