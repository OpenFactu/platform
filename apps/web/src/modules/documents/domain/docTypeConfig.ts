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
import { t } from '@/i18n/i18n';
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

/**
 * Mismas etiquetas de estado que usa `statusBadgeProps` en documentLineCells.tsx.
 * Guardan la CLAVE de i18n; `buildConfig` las traduce al construir.
 */
const STATUS_OPTIONS_BY_KIND: Record<DocKind, { label: string; value: string }[]> = {
  [DocKind.Invoice]: [
    { label: 'doc.status.draft', value: 'D' },
    { label: 'doc.status.posted', value: DocStatus.Open },
    { label: 'doc.status.cancelled', value: DocStatus.Cancelled },
  ],
  [DocKind.Order]: [
    { label: 'doc.status.open', value: DocStatus.Open },
    { label: 'doc.status.partial', value: DocStatus.Partial },
    { label: 'doc.status.closed', value: DocStatus.Closed },
    { label: 'doc.status.cancelled', value: DocStatus.Cancelled },
  ],
  [DocKind.DeliveryNote]: [
    { label: 'doc.status.open', value: DocStatus.Open },
    { label: 'doc.status.invoiced', value: DocStatus.Closed },
    { label: 'doc.status.cancelled', value: DocStatus.Cancelled },
  ],
};

const PARTNER_LABEL_BY_DOC_TYPE: Record<DocType, { label: string; placeholder: string }> = {
  [DocType.SalesOrder]: {
    label: 'doc.partner.customer',
    placeholder: 'doc.partner.searchCustomer',
  },
  [DocType.SalesDeliveryNote]: {
    label: 'doc.partner.customer',
    placeholder: 'doc.partner.searchCustomer',
  },
  [DocType.SalesInvoice]: {
    label: 'doc.partner.customer',
    placeholder: 'doc.partner.searchCustomer',
  },
  [DocType.PurchaseOrder]: {
    label: 'doc.partner.supplier',
    placeholder: 'doc.partner.searchSupplier',
  },
  [DocType.PurchaseDeliveryNote]: {
    label: 'doc.partner.supplier',
    placeholder: 'doc.partner.searchSupplier',
  },
  [DocType.PurchaseInvoice]: {
    label: 'doc.partner.supplier',
    placeholder: 'doc.partner.searchSupplier',
  },
};

// DOC_TYPE_LABELS de @openfactu/common viene en español: para los 6 tipos core
// se usa una clave local (los tipos del servidor traen ya su nombre).
const LABEL_BY_DOC_TYPE: Record<DocType, string> = {
  [DocType.SalesOrder]: 'doc.types.SO',
  [DocType.SalesDeliveryNote]: 'doc.types.SDN',
  [DocType.SalesInvoice]: 'doc.types.SINV',
  [DocType.PurchaseOrder]: 'doc.types.PO',
  [DocType.PurchaseDeliveryNote]: 'doc.types.PDN',
  [DocType.PurchaseInvoice]: 'doc.types.PINV',
};

// DOC_TYPE_LABELS son sustantivos compuestos ("Pedido Venta") — pluralizar
// pegando una 's' da "Pedido Ventas" (mal). Tabla explícita en su lugar.
const LABEL_PLURAL_BY_DOC_TYPE: Record<DocType, string> = {
  [DocType.SalesOrder]: 'doc.typesPlural.SO',
  [DocType.SalesDeliveryNote]: 'doc.typesPlural.SDN',
  [DocType.SalesInvoice]: 'doc.typesPlural.SINV',
  [DocType.PurchaseOrder]: 'doc.typesPlural.PO',
  [DocType.PurchaseDeliveryNote]: 'doc.typesPlural.PDN',
  [DocType.PurchaseInvoice]: 'doc.typesPlural.PINV',
};

function buildConfig(docType: DocType): DocTypeConfig {
  const { kind } = decomposeDocType(docType);
  const partner = PARTNER_LABEL_BY_DOC_TYPE[docType];
  return {
    docType,
    apiEndpoint: DOC_TYPE_API_ENDPOINTS[docType],
    label: LABEL_BY_DOC_TYPE[docType] ? t(LABEL_BY_DOC_TYPE[docType]) : DOC_TYPE_LABELS[docType],
    labelPlural: t(LABEL_PLURAL_BY_DOC_TYPE[docType]),
    partnerLabel: t(partner.label),
    partnerPlaceholder: t(partner.placeholder),
    statusOptions: STATUS_OPTIONS_BY_KIND[kind].map((o) => ({ ...o, label: t(o.label) })),
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
  // Se reconstruye en cada llamada para que las etiquetas sigan al idioma activo.
  if (DOC_TYPE_CONFIGS[dt]) return buildConfig(dt);
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
