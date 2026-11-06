/**
 * Cómo reclama impagos cada empresa. Se guarda en SystemConfig con el prefijo `dunning_`.
 *
 * El texto vacío de un nivel es el de fábrica, en el idioma de cada cliente; el que escribe
 * la empresa se envía tal cual. El envío automático va apagado: un correo a un cliente no
 * sale sin que la empresa lo haya pedido.
 */
import { getConfigSection, setConfigSection } from '../config/systemConfigSection';

export interface DunningLevel {
  /** Días tras el vencimiento a partir de los que toca este nivel. */
  days: number;
  subject: string;
  body: string;
}

export interface DunningSettings {
  levels: DunningLevel[];
  /** Días mínimos entre dos reclamaciones automáticas al mismo cliente. */
  minDaysBetween: number;
  autoSend: boolean;
}

const MAX_LEVELS = 10;
const MAX_TEXT = 5000;

const DEFAULT_LEVELS: DunningLevel[] = [
  { days: 7, subject: '', body: '' },
  { days: 30, subject: '', body: '' },
  { days: 60, subject: '', body: '' },
];

const STORED_DEFAULTS = {
  levels: JSON.stringify(DEFAULT_LEVELS),
  minDaysBetween: 7,
  autoSend: false,
};

function badRequest(message: string): Error {
  const err: any = new Error(message);
  err.statusCode = 400;
  return err;
}

function parseLevels(raw: string): DunningLevel[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_LEVELS;
  } catch {
    return DEFAULT_LEVELS;
  }
}

export async function getDunningSettings(db: any): Promise<DunningSettings> {
  const stored = await getConfigSection(db, 'dunning', STORED_DEFAULTS);
  return {
    levels: parseLevels(stored.levels),
    minDaysBetween: stored.minDaysBetween,
    autoSend: stored.autoSend,
  };
}

function cleanLevels(input: unknown): DunningLevel[] {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_LEVELS) {
    throw badRequest(`Hacen falta entre 1 y ${MAX_LEVELS} niveles.`);
  }
  let previous = -1;
  return input.map((level: any) => {
    const days = Number(level?.days);
    if (!Number.isInteger(days) || days < 0) {
      throw badRequest('Los días de cada nivel tienen que ser un número entero.');
    }
    if (days <= previous) {
      throw badRequest('Cada nivel tiene que empezar más tarde que el anterior.');
    }
    previous = days;
    return {
      days,
      subject: String(level?.subject ?? '').slice(0, 300),
      body: String(level?.body ?? '').slice(0, MAX_TEXT),
    };
  });
}

export async function saveDunningSettings(
  db: any,
  patch: Partial<DunningSettings>,
): Promise<DunningSettings> {
  const stored: Partial<typeof STORED_DEFAULTS> = {};
  if (patch.levels !== undefined) stored.levels = JSON.stringify(cleanLevels(patch.levels));
  if (patch.minDaysBetween !== undefined) {
    const days = Number(patch.minDaysBetween);
    if (!Number.isInteger(days) || days < 1 || days > 365) {
      throw badRequest('Los días entre reclamaciones van de 1 a 365.');
    }
    stored.minDaysBetween = days;
  }
  if (patch.autoSend !== undefined) stored.autoSend = patch.autoSend === true;
  await setConfigSection(db, 'dunning', STORED_DEFAULTS, stored);
  return getDunningSettings(db);
}
