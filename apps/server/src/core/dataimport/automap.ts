/**
 * Propuesta automática de mapeo columna → campo.
 *
 * No pretende acertar siempre: pretende que el paso de mapeo empiece medio
 * hecho. El usuario corrige lo que sobre, y por eso cada propuesta viene con
 * su motivo — una coincidencia exacta con la plantilla no merece la misma
 * confianza que haber reconocido "Teléfono móvil" como el teléfono.
 *
 * La comparación se hace sobre el texto normalizado (sin acentos, sin
 * mayúsculas, sin puntuación ni espacios) porque un fichero real trae
 * "N.I.F.", "Nif " y "NIF/CIF" para la misma columna.
 */

import type { ImportObjectConfig, ImportFieldDef } from './ImportRegistry';

export interface AutomapEntry {
  /** Cabecera tal cual aparece en el fichero. */
  column: string;
  /** Campo propuesto, o null si no se reconoció. */
  field: string | null;
  confidence: 'exact' | 'synonym' | 'partial' | null;
}

/** "Dirección · Código postal" → "direccioncodigopostal" */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Cómo llama la gente a cada campo en sus ficheros. Clave = nombre
 * normalizado del campo en el catálogo, valor = alias que se le reconocen.
 */
const SYNONYMS: Record<string, string[]> = {
  code: ['codigo', 'cod', 'referencia', 'ref', 'clave', 'id', 'idcliente', 'codcliente'],
  name: ['nombre', 'razonsocial', 'razon', 'denominacion', 'cliente', 'proveedor', 'descripcion'],
  nif: ['nif', 'cif', 'nifcif', 'dni', 'documento', 'vatnumber', 'vat', 'identificacionfiscal'],
  email: ['email', 'correo', 'correoelectronico', 'mail', 'email'],
  phone: ['telefono', 'tlf', 'tel', 'movil', 'telefonomovil', 'telefonocontacto'],
  website: ['web', 'website', 'paginaweb', 'url'],
  countryCode: ['pais', 'country', 'codigopais', 'countrycode', 'iso'],
  street: ['direccion', 'calle', 'domicilio', 'via', 'address', 'direccioncalle'],
  city: ['ciudad', 'poblacion', 'localidad', 'municipio', 'city'],
  state: ['provincia', 'estado', 'region', 'state'],
  zipCode: ['cp', 'codigopostal', 'zip', 'zipcode', 'postalcode'],
  iban: ['iban', 'cuenta', 'cuentabancaria', 'ccc', 'numerocuenta'],
  bankName: ['banco', 'entidad', 'entidadbancaria'],
  bankSwift: ['swift', 'bic', 'swiftbic'],
  group: ['grupo', 'grupocliente', 'grupoproveedor', 'categoriacliente', 'tipo'],
  priceList: ['tarifa', 'listaprecios', 'listadeprecios', 'pricelist'],
};

/** Índice normalizado de todas las formas de nombrar un campo. */
function buildIndex(fields: ImportFieldDef[]) {
  const exact = new Map<string, string>();
  const synonym = new Map<string, string>();

  for (const f of fields) {
    exact.set(normalize(f.key), f.key);
    exact.set(normalize(f.label), f.key);
    // "Dirección · Ciudad" también responde a "ciudad" a secas.
    const tail = f.label.split('·').pop();
    if (tail) exact.set(normalize(tail), f.key);

    for (const alias of SYNONYMS[f.key] || []) {
      if (!synonym.has(alias)) synonym.set(alias, f.key);
    }
  }

  return { exact, synonym };
}

export function automap(config: ImportObjectConfig, headers: string[]): AutomapEntry[] {
  const fields = [...config.fields, ...(config.lines?.fields || [])];
  const { exact, synonym } = buildIndex(fields);
  const used = new Set<string>();
  const result: AutomapEntry[] = headers.map((column) => ({
    column,
    field: null,
    confidence: null,
  }));

  // Tres pasadas de menor a mayor tolerancia: así una coincidencia exacta
  // nunca pierde su campo frente a una parcial de otra columna.
  const passes: Array<{
    confidence: AutomapEntry['confidence'];
    find: (n: string) => string | undefined;
  }> = [
    { confidence: 'exact', find: (n) => exact.get(n) },
    { confidence: 'synonym', find: (n) => synonym.get(n) },
    {
      confidence: 'partial',
      find: (n) => {
        if (n.length < 4) return undefined;
        for (const [key, field] of exact) {
          if (key.length >= 4 && (key.includes(n) || n.includes(key))) return field;
        }
        return undefined;
      },
    },
  ];

  for (const pass of passes) {
    result.forEach((entry) => {
      if (entry.field) return;
      const candidate = pass.find(normalize(entry.column));
      if (!candidate || used.has(candidate)) return;
      entry.field = candidate;
      entry.confidence = pass.confidence;
      used.add(candidate);
    });
  }

  return result;
}

/** El mapeo que se guarda en el trabajo: { columna: campo }. */
export function automapToMapping(entries: AutomapEntry[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  for (const e of entries) {
    if (e.field) mapping[e.column] = e.field;
  }
  return mapping;
}
