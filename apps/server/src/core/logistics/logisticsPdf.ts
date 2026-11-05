/**
 * Papeles del almacén y del reparto: etiqueta de bulto, packing list y hoja de ruta.
 *
 * Van en el formato neutro de los documentos, negro sobre blanco: se imprimen en
 * cualquier impresora y se tienen que leer igual de lejos. La etiqueta lleva el
 * mismo QR que la app del conductor ya sabe leer.
 */
import { asc, eq, inArray } from 'drizzle-orm';
import QRCode from 'qrcode';
import { PdfRenderer } from '@openfactu/pdf';
import * as schema from '../../db/schema';
import { intlLocale, tr, type Locale } from '../../i18n';
import { renderReportPdf, type ReportInput } from '../reports/ReportRenderer';
import { LogisticsError } from './shipmentLifecycle';
import { shipmentLabel } from './logisticsCodes';

type Company = Partial<ReportInput>;

/** Además de escapar, deja sin efecto las llaves: el motor del PDF las interpreta. */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

async function itemsById(db: any, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map<string, any>();
  const rows = await db
    .select({ id: schema.items.id, code: schema.items.code, name: schema.items.name })
    .from(schema.items)
    .where(inArray(schema.items.id, unique));
  return new Map<string, any>(rows.map((r: any) => [r.id, r]));
}

async function linesOfPackages(db: any, packageIds: string[]) {
  if (packageIds.length === 0) return [] as any[];
  return db
    .select()
    .from(schema.packageLines)
    .where(inArray(schema.packageLines.packageId, packageIds));
}

async function packagesOfShipment(db: any, shipmentId: string): Promise<any[]> {
  return db
    .select()
    .from(schema.packages)
    .where(eq(schema.packages.shipmentId, shipmentId))
    .orderBy(asc(schema.packages.code));
}

async function loadOr404(db: any, table: any, id: string, message: string) {
  const [row] = await db.select().from(table).where(eq(table.id, id));
  if (!row) throw new LogisticsError(message, 404);
  return row;
}

/** Destinatario del envío, cayendo al interlocutor del albarán si no lo lleva. */
async function recipientOf(db: any, shipment: any) {
  let name = shipment.recipientName as string | null;
  let phone = shipment.recipientPhone as string | null;
  if ((!name || !phone) && shipment.deliveryNoteId) {
    const table: any =
      shipment.sourceDocType === 'PDN' ? schema.purchaseDeliveryNotes : schema.salesDeliveryNotes;
    const [note] = await db
      .select({ partnerId: table.partnerId })
      .from(table)
      .where(eq(table.id, shipment.deliveryNoteId));
    if (note?.partnerId) {
      const [partner] = await db
        .select({ name: schema.businessPartners.name, phone: schema.businessPartners.phone })
        .from(schema.businessPartners)
        .where(eq(schema.businessPartners.id, note.partnerId));
      name = name || partner?.name || null;
      phone = phone || partner?.phone || null;
    }
  }
  return { name, phone };
}

async function labelsHtml(
  db: any,
  packages: any[],
  shipment: any | null,
  company: Company,
  locale: Locale,
) {
  const recipient = shipment ? await recipientOf(db, shipment) : { name: null, phone: null };
  const lines = await linesOfPackages(
    db,
    packages.map((p) => p.id),
  );
  const items = await itemsById(
    db,
    lines.map((l: any) => l.itemId),
  );

  const pages = await Promise.all(
    packages.map(async (pkg, index) => {
      const qr = await QRCode.toDataURL(
        JSON.stringify({ v: 1, type: 'package', id: pkg.id, code: pkg.code }),
        { errorCorrectionLevel: 'M', margin: 1, width: 300 },
      );
      const content = lines
        .filter((l: any) => l.packageId === pkg.id)
        .map((l: any) => {
          const item = items.get(l.itemId);
          return `<tr><td>${esc(Number(l.quantity))}</td><td>${esc(item?.code)}</td><td>${esc(item?.name)}</td></tr>`;
        })
        .join('');
      return `<section class="label">
        <header>
          <div class="company">${esc(company.companyName)}</div>
          <div class="count">${esc(tr(locale, 'Bulto {n} de {total}', { n: index + 1, total: packages.length }))}</div>
        </header>
        <div class="to-label">${esc(tr(locale, 'Destinatario'))}</div>
        <div class="to">${esc(recipient.name)}</div>
        <div class="address">${esc(shipment?.destinationAddress)}</div>
        ${recipient.phone ? `<div class="phone">${esc(recipient.phone)}</div>` : ''}
        <div class="codes">
          <img src="${qr}" alt="" />
          <div>
            <div class="package">${esc(pkg.code)}</div>
            ${shipment ? `<div class="shipment">${esc(tr(locale, 'Envío'))}: ${esc(shipmentLabel(shipment))}</div>` : ''}
            ${pkg.weightKg != null ? `<div class="shipment">${esc(Number(pkg.weightKg))} kg</div>` : ''}
          </div>
        </div>
        ${content ? `<table>${content}</table>` : ''}
      </section>`;
    }),
  );

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A5; margin: 10mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; }
    .label { page-break-after: always; }
    .label:last-child { page-break-after: auto; }
    header { display: flex; justify-content: space-between; border-bottom: 0.5pt solid #000; padding-bottom: 6px; margin-bottom: 14px; font-size: 11px; }
    .company { font-weight: 700; }
    .to-label { font-size: 10px; }
    .to { font-size: 22px; font-weight: 700; margin: 2px 0 6px; }
    .address { font-size: 16px; line-height: 1.3; }
    .phone { font-size: 14px; margin-top: 4px; }
    .codes { display: flex; gap: 14px; align-items: center; margin: 18px 0; }
    .codes img { width: 110px; height: 110px; }
    .package { font-size: 18px; font-weight: 700; font-family: 'Courier New', monospace; }
    .shipment { font-size: 12px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    td { border-top: 0.5pt solid #000; padding: 3px 4px; vertical-align: top; }
  </style></head><body>${pages.join('')}</body></html>`;
}

function renderLabels(html: string): Promise<Buffer> {
  return PdfRenderer.render(
    html,
    {} as any,
    {
      orientation: 'portrait',
      pageSize: 'A5',
      showPageNumbers: false,
      neutral: true,
    } as any,
  );
}

export async function renderPackageLabel(
  db: any,
  packageId: string,
  company: Company,
  locale: Locale,
): Promise<Buffer> {
  const pkg = await loadOr404(db, schema.packages, packageId, 'Paquete no encontrado');
  const shipment = pkg.shipmentId
    ? await loadOr404(db, schema.shipments, pkg.shipmentId, 'Envío no encontrado')
    : null;
  return renderLabels(await labelsHtml(db, [pkg], shipment, company, locale));
}

export async function renderShipmentLabels(
  db: any,
  shipmentId: string,
  company: Company,
  locale: Locale,
): Promise<Buffer> {
  const shipment = await loadOr404(db, schema.shipments, shipmentId, 'Envío no encontrado');
  const packages = await packagesOfShipment(db, shipmentId);
  if (packages.length === 0) {
    throw new LogisticsError('Este envío aún no tiene paquetes.', 409);
  }
  return renderLabels(await labelsHtml(db, packages, shipment, company, locale));
}

async function packagesOfArea(db: any, areaId: string): Promise<any[]> {
  return db
    .select()
    .from(schema.packages)
    .where(eq(schema.packages.stagingAreaId, areaId))
    .orderBy(asc(schema.packages.code));
}

const LEFT_THE_AREA = ['shipped', 'delivered', 'returned'];

/** Las etiquetas de lo que sigue en el acopio, cada una con los datos de su envío. */
export async function renderStagingLabels(
  db: any,
  areaId: string,
  company: Company,
  locale: Locale,
): Promise<Buffer> {
  await loadOr404(db, schema.stagingAreas, areaId, 'Acopio no encontrado');
  const packages = (await packagesOfArea(db, areaId)).filter(
    (p) => !LEFT_THE_AREA.includes(p.status),
  );
  if (packages.length === 0) throw new LogisticsError('Este acopio no tiene paquetes.', 409);
  const pages: string[] = [];
  for (const pkg of packages) {
    const shipment = pkg.shipmentId
      ? await loadOr404(db, schema.shipments, pkg.shipmentId, 'Envío no encontrado')
      : null;
    pages.push(await labelsHtml(db, [pkg], shipment, company, locale));
  }
  // Cada página sale de un documento entero: se juntan por su cuerpo.
  const body = pages.map((html) => /<body>([\s\S]*)<\/body>/.exec(html)?.[1] ?? '').join('');
  return renderLabels(pages[0].replace(/<body>[\s\S]*<\/body>/, () => `<body>${body}</body>`));
}

/** Qué hay en el acopio y en qué rutas sale, con sitio para firmar la carga. */
export async function renderStagingPackingList(
  db: any,
  areaId: string,
  company: Company,
  locale: Locale,
): Promise<Buffer> {
  const area = await loadOr404(db, schema.stagingAreas, areaId, 'Acopio no encontrado');
  const packages = (await packagesOfArea(db, areaId)).filter(
    (p) => !LEFT_THE_AREA.includes(p.status),
  );
  const lines = await linesOfPackages(
    db,
    packages.map((p) => p.id),
  );
  const items = await itemsById(
    db,
    lines.map((l: any) => l.itemId),
  );
  const columns = [
    { key: 'code', label: tr(locale, 'Código'), width: '22%' },
    { key: 'name', label: tr(locale, 'Artículo') },
    { key: 'quantity', label: tr(locale, 'Cantidad'), align: 'right' as const, width: '14%' },
  ];
  return renderReportPdf({
    ...company,
    title: tr(locale, 'Packing list'),
    subtitle: `${area.code} · ${area.name}`,
    filters: [
      { label: tr(locale, 'Bultos'), value: String(packages.length) },
      ...(area.address ? [{ label: tr(locale, 'Dirección'), value: area.address }] : []),
    ],
    sections: packages.map((pkg) => ({
      title: pkg.weightKg != null ? `${pkg.code} · ${Number(pkg.weightKg)} kg` : pkg.code,
      columns,
      rows: lines
        .filter((l: any) => l.packageId === pkg.id)
        .map((l: any) => {
          const item = items.get(l.itemId);
          return { code: item?.code || '', name: item?.name || '', quantity: Number(l.quantity) };
        }),
    })),
    neutral: true,
    locale,
  });
}

/** Qué lleva el envío, caja a caja. Sin cajas todavía, lo preparado hasta ahora. */
export async function renderPackingList(
  db: any,
  shipmentId: string,
  company: Company,
  locale: Locale,
): Promise<Buffer> {
  const shipment = await loadOr404(db, schema.shipments, shipmentId, 'Envío no encontrado');
  const recipient = await recipientOf(db, shipment);
  const packages = await packagesOfShipment(db, shipmentId);
  const lines = await linesOfPackages(
    db,
    packages.map((p) => p.id),
  );
  const tasks: any[] =
    packages.length > 0
      ? []
      : await db
          .select()
          .from(schema.pickingTasks)
          .where(eq(schema.pickingTasks.shipmentId, shipmentId));
  const items = await itemsById(db, [
    ...lines.map((l: any) => l.itemId),
    ...tasks.map((t) => t.itemId),
  ]);

  const columns = [
    { key: 'code', label: tr(locale, 'Código'), width: '22%' },
    { key: 'name', label: tr(locale, 'Artículo') },
    { key: 'quantity', label: tr(locale, 'Cantidad'), align: 'right' as const, width: '14%' },
  ];
  const rowOf = (itemId: string, quantity: unknown) => {
    const item = items.get(itemId);
    return { code: item?.code || '', name: item?.name || '', quantity: Number(quantity) };
  };
  const sections =
    packages.length > 0
      ? packages.map((pkg) => ({
          title: pkg.weightKg != null ? `${pkg.code} · ${Number(pkg.weightKg)} kg` : pkg.code,
          columns,
          rows: lines
            .filter((l: any) => l.packageId === pkg.id)
            .map((l: any) => rowOf(l.itemId, l.quantity)),
        }))
      : [
          {
            columns,
            rows: tasks
              .filter((t) => Number(t.pickedQty) > 0)
              .map((t) => rowOf(t.itemId, t.pickedQty)),
          },
        ];

  const filters = [
    { label: tr(locale, 'Envío'), value: shipmentLabel(shipment) },
    { label: tr(locale, 'Bultos'), value: String(packages.length) },
  ];
  if (recipient.name) filters.push({ label: tr(locale, 'Destinatario'), value: recipient.name });
  if (shipment.destinationAddress) {
    filters.push({ label: tr(locale, 'Dirección'), value: shipment.destinationAddress });
  }

  return renderReportPdf({
    ...company,
    title: tr(locale, 'Packing list'),
    filters,
    sections,
    neutral: true,
    locale,
  });
}

/** Lo que se lleva el conductor: las paradas en orden, con sitio para anotar. */
export async function renderRouteSheet(
  db: any,
  routeId: string,
  company: Company,
  locale: Locale,
): Promise<Buffer> {
  const route = await loadOr404(db, schema.routes, routeId, 'Ruta no encontrada');
  const stops: any[] = await db
    .select()
    .from(schema.routeStops)
    .where(eq(schema.routeStops.routeId, routeId))
    .orderBy(asc(schema.routeStops.sequence));
  const shipmentIds = stops.map((s) => s.shipmentId).filter(Boolean);
  const shipments: any[] = shipmentIds.length
    ? await db.select().from(schema.shipments).where(inArray(schema.shipments.id, shipmentIds))
    : [];
  const byId = new Map(shipments.map((s) => [s.id, s]));
  const packages: any[] = shipmentIds.length
    ? await db
        .select({ shipmentId: schema.packages.shipmentId, weightKg: schema.packages.weightKg })
        .from(schema.packages)
        .where(inArray(schema.packages.shipmentId, shipmentIds))
    : [];

  const rows = [];
  for (const stop of stops) {
    const shipment = stop.shipmentId ? byId.get(stop.shipmentId) : null;
    const recipient = shipment ? await recipientOf(db, shipment) : { name: null, phone: null };
    const boxes = packages.filter((p) => p.shipmentId === stop.shipmentId);
    const weight = boxes.reduce((sum, p) => sum + Number(p.weightKg || 0), 0);
    rows.push({
      sequence: stop.sequence,
      shipment: shipment ? shipmentLabel(shipment) : '',
      kind: shipment?.kind === 'pickup_return' ? tr(locale, 'Recogida') : tr(locale, 'Entrega'),
      recipient: [recipient.name, recipient.phone].filter(Boolean).join(' · '),
      address: stop.address || shipment?.destinationAddress || '',
      packages: boxes.length ? `${boxes.length}${weight ? ` · ${weight} kg` : ''}` : '',
      signature: '',
    });
  }

  const planned = new Date(route.plannedDate);
  const filters = [
    {
      label: tr(locale, 'Fecha'),
      value: Number.isNaN(planned.getTime())
        ? String(route.plannedDate)
        : planned.toLocaleDateString(intlLocale(locale)),
    },
    { label: tr(locale, 'Paradas'), value: String(stops.length) },
  ];
  if (route.driverName) filters.push({ label: tr(locale, 'Conductor'), value: route.driverName });
  if (route.vehiclePlate)
    filters.push({ label: tr(locale, 'Vehículo'), value: route.vehiclePlate });

  return renderReportPdf({
    ...company,
    title: tr(locale, 'Hoja de ruta'),
    subtitle: `${route.code} · ${route.name}`,
    orientation: 'landscape',
    filters,
    sections: [
      {
        columns: [
          { key: 'sequence', label: '#', width: '4%' },
          { key: 'shipment', label: tr(locale, 'Envío'), width: '13%' },
          { key: 'kind', label: tr(locale, 'Tipo'), width: '8%' },
          { key: 'recipient', label: tr(locale, 'Destinatario'), width: '20%' },
          { key: 'address', label: tr(locale, 'Dirección') },
          { key: 'packages', label: tr(locale, 'Bultos'), width: '9%' },
          { key: 'signature', label: tr(locale, 'Firma y observaciones'), width: '20%' },
        ],
        rows,
      },
    ],
    neutral: true,
    locale,
  });
}
