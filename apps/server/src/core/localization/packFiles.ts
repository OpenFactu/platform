import fs from 'fs';
import path from 'path';

/**
 * Ficheros de un paquete de localización dentro de la carpeta `data/` de un
 * plugin. `pack.json` es el único obligatorio; sin él, el plugin no trae paquete.
 * Así una normativa se puede publicar sin escribir código.
 */
const SECTION_FILES: Record<string, string> = {
  taxes: 'taxes.json',
  accounts: 'accounts.json',
  accountMappings: 'account-mappings.json',
  payrollConcepts: 'payroll-concepts.json',
  documentTypes: 'document-types.json',
  terminology: 'terminology.json',
  legalTexts: 'legal-texts.json',
};

function readJson(file: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err: any) {
    throw new Error(`${path.basename(file)}: ${err.message}`);
  }
}

/** Lee el paquete sin validarlo (de eso se encarga el registro). Null si no hay. */
export function readPackDirectory(dataDir: string): unknown | null {
  const packFile = path.join(dataDir, 'pack.json');
  if (!fs.existsSync(packFile)) return null;
  const pack = readJson(packFile) as Record<string, unknown>;
  for (const [section, file] of Object.entries(SECTION_FILES)) {
    const full = path.join(dataDir, file);
    if (fs.existsSync(full)) pack[section] = readJson(full);
  }
  return pack;
}
