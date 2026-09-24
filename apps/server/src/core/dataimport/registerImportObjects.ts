/**
 * Pobla el `ImportRegistry`. Se llama en el arranque de `server.ts`, después
 * de `registerDocumentTypes` (que es el primer import del fichero) para que
 * los objetos de documento se puedan generar a partir de él.
 *
 * Cada familia vive en su fichero bajo `objects/`. Añadir una entidad nueva al
 * importador es añadir una entrada declarativa allí: la validación y los
 * defaults NO se repiten, los pone el handler cuando el motor le pasa la fila
 * (ver la cabecera de `RouterDispatcher.ts`).
 */

import { ImportRegistry } from './ImportRegistry';
import { partnerObject } from './objects/partners';
import { masterDataObjects } from './objects/masterData';
import { stockAndPriceObjects } from './objects/stockAndPrices';
import { accountingObjects } from './objects/accounting';
import { hrObjects } from './objects/hr';
import { buildDocumentObjects } from './objects/documents';

export function registerImportObjects(): void {
  const all = [
    partnerObject,
    ...masterDataObjects,
    ...stockAndPriceObjects,
    ...accountingObjects,
    ...hrObjects,
    ...buildDocumentObjects(),
  ];

  for (const object of all) {
    // Registrar dos veces es un fallo de programación, no de datos: pasaría si
    // dos ficheros de `objects/` usaran el mismo id. Que reviente al arrancar.
    ImportRegistry.register(object);
  }

  console.log(`[DataImport] ${ImportRegistry.size()} objetos importables registrados.`);
}
