// STOPGAP: getDocTypeConfig/DOC_TYPE_CONFIGS no están publicados en
// @openfactu/common (última versión publicada en npm: 0.1.1 — no es un
// problema de versión desactualizada, la función nunca se publicó; existe
// solo en el repo privado de @openfactu/common). Este shim los reconstruye
// a partir de lo que SÍ exporta el paquete (DocType, DOC_TYPE_LABELS,
// DOC_TYPE_API_ENDPOINTS, DOC_TYPE_BREADCRUMBS, decomposeDocType) más una
// tabla local para los 4 campos que no están publicados (labelPlural,
// partnerLabel, partnerPlaceholder, statusOptions).
//
// Borrar este archivo y volver a `import { getDocTypeConfig, DOC_TYPE_CONFIGS }
// from '@openfactu/common'` en Documents.tsx en cuanto se publique la versión
// real del paquete que las incluya.
import {
  DocType,
  DocKind,
  DocStatus,
  DOC_TYPE_API_ENDPOINTS,
  DOC_TYPE_LABELS,
  decomposeDocType,
} from '@openfactu/common';
import { getCachedDocType } from './docTypeRegistry';

export interface DocTypeConfig {
  docType: DocType;
  apiEndpoint: string;
  label: string;
  labelPlural: string;
  partnerLabel: string;
  partnerPlaceholder: string;
  statusOptions: { label: string; value: string }[];
}

/** Mismas etiquetas de estado que usa `statusBadgeProps` en documentLineCells.tsx. */
const STATUS_OPTIONS_BY_KIND: Record<DocKind, { label: string; value: string }[]> = {
  [DocKind.Invoice]: [
    { label: 'Borrador', value: 'D' },
    { label: 'Asentado', value: DocStatus.Open },
    { label: 'Cancelado', value: DocStatus.Cancelled },
  ],
  [DocKind.Order]: [
    { label: 'Abierto', value: DocStatus.Open },
    { label: 'Parcial', value: DocStatus.Partial },
    { label: 'Cerrado', value: DocStatus.Closed },
    { label: 'Cancelado', value: DocStatus.Cancelled },
  ],
  [DocKind.DeliveryNote]: [
    { label: 'Abierto', value: DocStatus.Open },
    { label: 'Facturado', value: DocStatus.Closed },
    { label: 'Cancelado', value: DocStatus.Cancelled },
  ],
};

const PARTNER_LABEL_BY_DOC_TYPE: Record<DocType, { label: string; placeholder: string }> = {
  [DocType.SalesOrder]: { label: 'Cliente', placeholder: 'Buscar cliente...' },
  [DocType.SalesDeliveryNote]: { label: 'Cliente', placeholder: 'Buscar cliente...' },
  [DocType.SalesInvoice]: { label: 'Cliente', placeholder: 'Buscar cliente...' },
  [DocType.PurchaseOrder]: { label: 'Proveedor', placeholder: 'Buscar proveedor...' },
  [DocType.PurchaseDeliveryNote]: { label: 'Proveedor', placeholder: 'Buscar proveedor...' },
  [DocType.PurchaseInvoice]: { label: 'Proveedor', placeholder: 'Buscar proveedor...' },
};

// DOC_TYPE_LABELS son sustantivos compuestos ("Pedido Venta") — pluralizar
// pegando una 's' da "Pedido Ventas" (mal). Tabla explícita en su lugar.
const LABEL_PLURAL_BY_DOC_TYPE: Record<DocType, string> = {
  [DocType.SalesOrder]: 'Pedidos Venta',
  [DocType.SalesDeliveryNote]: 'Albaranes Venta',
  [DocType.SalesInvoice]: 'Facturas Venta',
  [DocType.PurchaseOrder]: 'Pedidos Compra',
  [DocType.PurchaseDeliveryNote]: 'Albaranes Compra',
  [DocType.PurchaseInvoice]: 'Facturas Compra',
};

function buildConfig(docType: DocType): DocTypeConfig {
  const { kind } = decomposeDocType(docType);
  const partner = PARTNER_LABEL_BY_DOC_TYPE[docType];
  return {
    docType,
    apiEndpoint: DOC_TYPE_API_ENDPOINTS[docType],
    label: DOC_TYPE_LABELS[docType],
    labelPlural: LABEL_PLURAL_BY_DOC_TYPE[docType],
    partnerLabel: partner.label,
    partnerPlaceholder: partner.placeholder,
    statusOptions: STATUS_OPTIONS_BY_KIND[kind],
  };
}

export const DOC_TYPE_CONFIGS: Record<DocType, DocTypeConfig> = Object.fromEntries(
  Object.values(DocType).map((dt) => [dt, buildConfig(dt)]),
) as Record<DocType, DocTypeConfig>;

/**
 * Config de un tipo de documento. Los 6 core salen de los mapas estáticos
 * (output idéntico al histórico); cualquier otro código se resuelve contra la
 * caché de GET /api/documents/types (ver docTypeRegistry.ts) — devuelve
 * undefined si el tipo no existe o el fetch aún no ha llegado, así que el
 * llamador debe guardar contra ello (Documents.tsx ya lo hace).
 */
export function getDocTypeConfig(dt: DocType): DocTypeConfig {
  const staticCfg = DOC_TYPE_CONFIGS[dt];
  if (staticCfg) return staticCfg;
  const server = getCachedDocType(dt);
  if (server) {
    return {
      docType: dt,
      apiEndpoint: server.apiPath,
      label: server.label,
      labelPlural: server.labelPlural,
      partnerLabel: server.partnerLabel,
      partnerPlaceholder: server.partnerPlaceholder,
      statusOptions: server.statusOptions.map(({ value, label }) => ({ label, value })),
    };
  }
  return undefined as unknown as DocTypeConfig;
}
