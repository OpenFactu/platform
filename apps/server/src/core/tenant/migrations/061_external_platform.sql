-- 061: Crear la tabla ExternalPlatform (plataformas ajenas: cross-docks, naves
-- alquiladas, hubs). Existía en schema.ts y en la API (POST /api/logistics/
-- platforms) pero ninguna migración la creaba, así que guardar una plataforma
-- nueva fallaba con "relation ExternalPlatform does not exist". El resto de
-- tablas/columnas de logística ya las cubren 051/052/055/056.

CREATE TABLE IF NOT EXISTS "{{schema}}"."ExternalPlatform" (
  "id" TEXT PRIMARY KEY,
  "code" TEXT NOT NULL UNIQUE,
  "name" TEXT NOT NULL,
  "address" TEXT,
  "lat" DOUBLE PRECISION,
  "lng" DOUBLE PRECISION,
  "openingHours" TEXT,
  "contactName" TEXT,
  "contactPhone" TEXT,
  "contactEmail" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" TIMESTAMP
);
