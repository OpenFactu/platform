/**
 * Cómo reparte cada empresa: qué se le pide al conductor al cargar y al entregar, a
 * quién o dónde se puede dejar un pedido y por qué motivos no se entrega. Se guarda en
 * `SystemConfig` y lo que no se ha tocado sale de `DEFAULT_FLOW`.
 *
 * Lo que aquí se exige lo comprueba el servidor al entregar por la app del conductor.
 * La oficina puede marcar entregado sin prueba: ella no está en la puerta.
 */
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import * as schema from '../../db/schema';

const CONFIG_KEY = 'logistics_delivery_flow';

export type Requirement = 'off' | 'optional' | 'required';
export type PackageCheck = 'off' | 'check' | 'scan';
export type ReasonKind = 'postpone' | 'incident';

export const HANDOVERS = ['customer', 'other', 'concierge', 'neighbor', 'safePlace'] as const;
export type Handover = (typeof HANDOVERS)[number];

export const OTHER_REASON = 'other';

const MAP_PROVIDERS = ['standard', 'light', 'dark', 'mono', 'custom'] as const;
const MAP_STYLES = ['standard', 'satellite'] as const;
const NAVIGATION_APPS = ['google', 'waze', 'apple'] as const;

export interface MapSettings {
  provider: (typeof MAP_PROVIDERS)[number];
  /** Solo con `custom`: plantilla de teselas de un proveedor o servidor propio. */
  tileUrl: string;
  /**
   * Lo que va donde las plantillas ponen `{key}`. No es un secreto: el navegador de
   * quien mira el mapa la ve en cada tesela. Se protege restringiéndola en el proveedor.
   */
  apiKey: string;
  attribution: string;
  /** Hasta dónde sirve teselas el proveedor. Sin él, lo que traiga el mapa. */
  maxZoom: number | null;
  /** Vista de satélite del proveedor. Vacía, la de serie. */
  satelliteUrl: string;
  /** Ofrecer la vista de satélite. */
  satellite: boolean;
  /** Con qué vista se abren los mapas. */
  defaultStyle: (typeof MAP_STYLES)[number];
  /** Con qué app navega el conductor. */
  navigationApp: (typeof NAVIGATION_APPS)[number];
}

export interface StopReason {
  id: string;
  kind: ReasonKind;
  enabled: boolean;
  /** Solo en los motivos propios de la empresa; los de serie llevan su traducción. */
  label?: string;
}

export interface DeliveryFlow {
  /** Cargar los bultos antes de salir: no se pide, se marcan o se escanean. */
  loadOut: PackageCheck;
  /** No dejar salir sin haberlos cargado todos. */
  loadOutRequired: boolean;
  /** Comprobar los bultos en la puerta. */
  packageCheck: PackageCheck;
  /** Ofrecer el botón de "he llegado". */
  arrive: boolean;
  handover: Handover[];
  signature: Requirement;
  /** Si no puede firmar, vale su documento. */
  allowDocument: boolean;
  photo: Requirement;
  /** Permitir dejar bultos en un acopio. */
  stagingDrop: boolean;
  reasons: StopReason[];
  map: MapSettings;
}

const DEFAULT_REASONS: StopReason[] = [
  { id: 'nobody', kind: 'postpone', enabled: true },
  { id: 'otherDay', kind: 'postpone', enabled: true },
  { id: 'noTime', kind: 'postpone', enabled: true },
  { id: 'wrongAddress', kind: 'incident', enabled: true },
  { id: 'refused', kind: 'incident', enabled: true },
  { id: 'damaged', kind: 'incident', enabled: true },
  { id: 'missingPackage', kind: 'incident', enabled: true },
  { id: OTHER_REASON, kind: 'incident', enabled: true },
];

const DEFAULT_MAP: MapSettings = {
  provider: 'standard',
  tileUrl: '',
  apiKey: '',
  attribution: '',
  maxZoom: null,
  satelliteUrl: '',
  satellite: true,
  defaultStyle: 'satellite',
  navigationApp: 'google',
};

export const DEFAULT_FLOW: DeliveryFlow = {
  loadOut: 'check',
  loadOutRequired: false,
  packageCheck: 'check',
  arrive: true,
  handover: ['customer', 'other'],
  signature: 'required',
  allowDocument: true,
  photo: 'optional',
  stagingDrop: true,
  reasons: DEFAULT_REASONS,
  map: DEFAULT_MAP,
};

const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

function normalizeReasons(input: unknown): StopReason[] {
  if (!Array.isArray(input)) return DEFAULT_REASONS;
  const reasons: StopReason[] = [];
  for (const row of input) {
    const known = DEFAULT_REASONS.find((reason) => reason.id === row?.id);
    const label = typeof row?.label === 'string' ? row.label.trim() : '';
    if (known) {
      reasons.push({ ...known, enabled: flag(row.enabled, true) });
    } else if (
      typeof row?.id === 'string' &&
      label &&
      (row.kind === 'postpone' || row.kind === 'incident')
    ) {
      reasons.push({ id: row.id, kind: row.kind, enabled: flag(row.enabled, true), label });
    }
  }
  // Tiene que haber siempre una salida: lo que no está en la lista se escribe.
  const others = reasons.filter((reason) => reason.id !== OTHER_REASON);
  return [...others, { id: OTHER_REASON, kind: 'incident', enabled: true }];
}

/** Un servidor propio tiene que ir por https y tener los tres huecos de la tesela. */
const isTileTemplate = (url: string) =>
  url.startsWith('https://') && ['{z}', '{x}', '{y}'].every((hole) => url.includes(hole));

const KEY_HOLE = '{key}';
const trimmed = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

function normalizeMap(input: any): MapSettings {
  const value = input && typeof input === 'object' ? input : {};
  const tileUrl = trimmed(value.tileUrl);
  const apiKey = trimmed(value.apiKey).slice(0, 500);
  // Una dirección que pide clave no sirve sin ella.
  const usable = (url: string) => isTileTemplate(url) && (!!apiKey || !url.includes(KEY_HOLE));
  const custom = value.provider === 'custom' && usable(tileUrl);
  const satelliteUrl =
    custom && usable(trimmed(value.satelliteUrl)) ? trimmed(value.satelliteUrl) : '';
  const maxZoom = Number(value.maxZoom);
  const provider = oneOf(value.provider, MAP_PROVIDERS, DEFAULT_MAP.provider);
  const satellite = flag(value.satellite, DEFAULT_MAP.satellite);
  return {
    provider: provider === 'custom' && !custom ? DEFAULT_MAP.provider : provider,
    tileUrl: custom ? tileUrl : '',
    apiKey: custom && (tileUrl + satelliteUrl).includes(KEY_HOLE) ? apiKey : '',
    attribution:
      custom && typeof value.attribution === 'string' ? value.attribution.trim().slice(0, 200) : '',
    maxZoom: custom && Number.isInteger(maxZoom) && maxZoom >= 1 && maxZoom <= 24 ? maxZoom : null,
    satelliteUrl,
    satellite,
    defaultStyle: satellite
      ? oneOf(value.defaultStyle, MAP_STYLES, DEFAULT_MAP.defaultStyle)
      : 'standard',
    navigationApp: oneOf(value.navigationApp, NAVIGATION_APPS, DEFAULT_MAP.navigationApp),
  };
}

const withKey = (url: string, apiKey: string) =>
  url.split(KEY_HOLE).join(encodeURIComponent(apiKey));

/**
 * Lo que necesita la página pública de seguimiento: solo cómo pintar el mapa, con las
 * direcciones ya completas. La clave suelta solo la ve quien configura.
 */
export function publicMap({ map }: DeliveryFlow) {
  const { provider, tileUrl, apiKey, attribution, maxZoom, satelliteUrl, satellite, defaultStyle } =
    map;
  return {
    provider,
    tileUrl: withKey(tileUrl, apiKey),
    attribution,
    maxZoom,
    satelliteUrl: withKey(satelliteUrl, apiKey),
    satellite,
    defaultStyle,
  };
}

/** Lo mismo para la aplicación, que además navega. */
export const appMap = (flow: DeliveryFlow) => ({
  ...publicMap(flow),
  navigationApp: flow.map.navigationApp,
});

/** Lo que no vale se queda como por defecto: una configuración rota no para el reparto. */
export function normalizeFlow(input: any): DeliveryFlow {
  const value = input && typeof input === 'object' ? input : {};
  const requirements = ['off', 'optional', 'required'] as const;
  const checks = ['off', 'check', 'scan'] as const;
  const photo = oneOf(value.photo, requirements, DEFAULT_FLOW.photo);
  const asked = Array.isArray(value.handover)
    ? value.handover.filter((option: Handover) => HANDOVERS.includes(option))
    : DEFAULT_FLOW.handover;
  // Dejarlo sin nadie delante solo tiene sentido con una foto que lo pruebe.
  const handover = asked.filter((option: Handover) => option !== 'safePlace' || photo !== 'off');
  return {
    loadOut: oneOf(value.loadOut, checks, DEFAULT_FLOW.loadOut),
    loadOutRequired: flag(value.loadOutRequired, DEFAULT_FLOW.loadOutRequired),
    packageCheck: oneOf(value.packageCheck, checks, DEFAULT_FLOW.packageCheck),
    arrive: flag(value.arrive, DEFAULT_FLOW.arrive),
    handover: handover.length > 0 ? handover : DEFAULT_FLOW.handover,
    signature: oneOf(value.signature, requirements, DEFAULT_FLOW.signature),
    allowDocument: flag(value.allowDocument, DEFAULT_FLOW.allowDocument),
    photo,
    stagingDrop: flag(value.stagingDrop, DEFAULT_FLOW.stagingDrop),
    reasons: normalizeReasons(value.reasons),
    map: normalizeMap(value.map),
  };
}

export async function getDeliveryFlow(db: any): Promise<DeliveryFlow> {
  const [row] = await db
    .select({ value: schema.systemConfigs.value })
    .from(schema.systemConfigs)
    .where(eq(schema.systemConfigs.key, CONFIG_KEY));
  if (!row?.value) return DEFAULT_FLOW;
  try {
    return normalizeFlow(JSON.parse(row.value));
  } catch {
    return DEFAULT_FLOW;
  }
}

export async function saveDeliveryFlow(db: any, input: unknown): Promise<DeliveryFlow> {
  const flow = normalizeFlow(input);
  await db
    .insert(schema.systemConfigs)
    .values({ id: crypto.randomUUID(), key: CONFIG_KEY, value: JSON.stringify(flow) })
    .onConflictDoUpdate({
      target: schema.systemConfigs.key,
      set: { value: JSON.stringify(flow), updatedAt: new Date() },
    });
  return flow;
}

export interface ProofInput {
  handover?: string | null;
  recipientDocument?: string | null;
  signatureImage?: string | null;
  photoImage?: string | null;
}

/** Qué le falta a una entrega para lo que pide la empresa, o `null` si está bien. */
export function proofProblem(flow: DeliveryFlow, proof: ProofInput): string | null {
  if (proof.handover && !flow.handover.includes(proof.handover as Handover)) {
    return 'Tu empresa no permite dejar los pedidos así.';
  }
  const alone = proof.handover === 'safePlace';
  if ((alone || flow.photo === 'required') && !proof.photoImage) {
    return 'Falta la foto de la entrega.';
  }
  if (alone || flow.signature !== 'required' || proof.signatureImage) return null;
  if (flow.allowDocument) {
    return proof.recipientDocument ? null : 'Falta la firma o el documento de quien lo recibe.';
  }
  return 'Falta la firma de quien lo recibe.';
}
