/**
 * Ajustes del CRM por empresa. Se guardan en SystemConfig con el prefijo `crm_`
 * (como branding o flags). Las listas viajan como JSON en texto porque
 * SystemConfig solo guarda strings.
 */
import { getConfigSection, setConfigSection } from '../config/systemConfigSection';

interface StoredCrmSettings {
  lostReasons: string;
  sources: string;
  sourceRequired: boolean;
  defaultOwnerUserId: string;
  staleDays: number;
  dormantEnabled: boolean;
  dormantDays: number;
  boardClosedDays: number;
}

export interface CrmSettings {
  lostReasons: string[];
  sources: string[];
  /** Exigir el origen al crear una oportunidad. */
  sourceRequired: boolean;
  /** Responsable de lo que entra solo (formularios, web). Vacío = sin responsable. */
  defaultOwnerUserId: string;
  /** Días sin actividad para considerar «parada» una oportunidad abierta. */
  staleDays: number;
  dormantEnabled: boolean;
  /** Días sin comprar para considerar «dormido» a un cliente habitual. */
  dormantDays: number;
  /** Días que una oportunidad ganada o perdida sigue a la vista en el tablero. */
  boardClosedDays: number;
}

const DEFAULT_LOST_REASONS = ['Precio', 'Competencia', 'Sin respuesta', 'Sin presupuesto', 'Otro'];
const DEFAULT_SOURCES = ['Web', 'Referido', 'Feria', 'Llamada', 'Correo', 'Redes sociales', 'Otro'];

const STORED_DEFAULTS: StoredCrmSettings = {
  lostReasons: JSON.stringify(DEFAULT_LOST_REASONS),
  sources: JSON.stringify(DEFAULT_SOURCES),
  sourceRequired: false,
  defaultOwnerUserId: '',
  staleDays: 14,
  dormantEnabled: false,
  dormantDays: 90,
  boardClosedDays: 30,
};

function parseList(raw: string, fallback: string[]): string[] {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v.map(String).filter(Boolean) : fallback;
  } catch {
    return fallback;
  }
}

export async function getCrmSettings(db: any): Promise<CrmSettings> {
  const s = await getConfigSection(db, 'crm', STORED_DEFAULTS);
  return {
    ...s,
    lostReasons: parseList(s.lostReasons, DEFAULT_LOST_REASONS),
    sources: parseList(s.sources, DEFAULT_SOURCES),
  };
}

export async function setCrmSettings(db: any, patch: Partial<CrmSettings>): Promise<CrmSettings> {
  const stored: Partial<StoredCrmSettings> = {};
  if (Array.isArray(patch.lostReasons)) stored.lostReasons = JSON.stringify(patch.lostReasons);
  if (Array.isArray(patch.sources)) stored.sources = JSON.stringify(patch.sources);
  if (typeof patch.sourceRequired === 'boolean') stored.sourceRequired = patch.sourceRequired;
  if (typeof patch.defaultOwnerUserId === 'string')
    stored.defaultOwnerUserId = patch.defaultOwnerUserId;
  if (Number.isFinite(Number(patch.staleDays)))
    stored.staleDays = Math.max(1, Math.round(Number(patch.staleDays)));
  if (typeof patch.dormantEnabled === 'boolean') stored.dormantEnabled = patch.dormantEnabled;
  if (Number.isFinite(Number(patch.dormantDays)))
    stored.dormantDays = Math.max(7, Math.round(Number(patch.dormantDays)));
  if (Number.isFinite(Number(patch.boardClosedDays)))
    stored.boardClosedDays = Math.max(0, Math.round(Number(patch.boardClosedDays)));
  await setConfigSection(db, 'crm', STORED_DEFAULTS, stored);
  return getCrmSettings(db);
}
