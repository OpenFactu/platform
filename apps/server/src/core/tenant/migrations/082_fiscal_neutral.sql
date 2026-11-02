-- 082_fiscal_neutral.sql
-- ──────────────────────────────────────────────────────────────────
-- Núcleo neutro en normativa: la fiscalidad de cada país la aportan los
-- paquetes de localización de los plugins. Esta migración solo añade conceptos
-- genéricos y copia datos; ninguna columna antigua se borra todavía, para que
-- volver a la versión anterior del servidor siga funcionando.
-- ──────────────────────────────────────────────────────────────────

-- 1. Impuestos calculados por línea. Es lo que se aplicó al emitir: guarda
--    tipo, importe y versión de la norma, así que una norma nueva no lo altera.
CREATE TABLE IF NOT EXISTS "DocumentLineTax" (
  id              TEXT PRIMARY KEY,
  "docTable"      TEXT NOT NULL,
  "documentId"    TEXT NOT NULL,
  "lineId"        TEXT NOT NULL,
  code            TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'tax',
  label           TEXT,
  base            DECIMAL(15,4) NOT NULL,
  rate            DECIMAL(7,4) NOT NULL,
  amount          DECIMAL(15,4) NOT NULL,
  "accountKind"   TEXT NOT NULL,
  "isWithholding" BOOLEAN NOT NULL DEFAULT false,
  "packId"        TEXT,
  "packVersion"   TEXT,
  "createdAt"     TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS "DocumentLineTax_document_idx"
  ON "DocumentLineTax"("docTable", "documentId");

-- 2. Grupos de impuesto: categoría, vigencia y paquete que los aportó.
ALTER TABLE "TaxGroup"
  ADD COLUMN IF NOT EXISTS category    TEXT NOT NULL DEFAULT 'tax',
  ADD COLUMN IF NOT EXISTS "validFrom" DATE,
  ADD COLUMN IF NOT EXISTS "validTo"   DATE,
  ADD COLUMN IF NOT EXISTS "packId"    TEXT;

-- 3. Paquetes de localización aplicados en esta empresa.
CREATE TABLE IF NOT EXISTS "LocalizationInstall" (
  "packId"            TEXT PRIMARY KEY,
  version             TEXT NOT NULL,
  "accountingVersion" TEXT,
  "appliedAt"         TIMESTAMP NOT NULL DEFAULT NOW()
);

-- 4. Mapeos contables con nombres neutros. Se copian, no se renombran.
INSERT INTO "AccountMapping" (id, kind, key, "accountId")
SELECT gen_random_uuid()::text, v.neutral, m.key, m."accountId"
FROM "AccountMapping" m
JOIN (VALUES
  ('sales_vat_output',    'tax_output'),
  ('purchase_vat_input',  'tax_input'),
  ('payroll_irpf',        'payroll_income_tax'),
  ('payroll_ss_employee', 'payroll_social_employee'),
  ('payroll_ss_employer', 'payroll_social_employer')
) AS v(legacy, neutral) ON v.legacy = m.kind
WHERE NOT EXISTS (
  SELECT 1 FROM "AccountMapping" n WHERE n.kind = v.neutral AND n.key = m.key
);

-- 5. Nómina: totales y conceptos genéricos. Durante la transición se escriben
--    también las columnas antiguas.
ALTER TABLE "Payroll"
  ADD COLUMN IF NOT EXISTS "incomeTaxTotal"      DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "socialEmployeeTotal" DECIMAL(15,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "socialEmployerTotal" DECIMAL(15,2) NOT NULL DEFAULT 0;

UPDATE "Payroll" SET
  "incomeTaxTotal"      = "irpfAmount",
  "socialEmployeeTotal" = "ssEmployee",
  "socialEmployerTotal" = "ssEmployer";

ALTER TABLE "PayrollConcept"
  ADD COLUMN IF NOT EXISTS category           TEXT,
  ADD COLUMN IF NOT EXISTS "taxableIncomeTax" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "taxableSocial"    BOOLEAN NOT NULL DEFAULT true;

UPDATE "PayrollConcept" SET
  "taxableIncomeTax" = "taxableIrpf",
  "taxableSocial"    = "taxableSs";

-- Antes el tipo de concepto se deducía buscando palabras en el nombre. Se
-- traduce aquí una sola vez, con las mismas reglas y en el mismo orden.
UPDATE "PayrollConcept" SET category = CASE
  WHEN code ~* 'irpf' OR name ~* 'irpf' THEN 'income_tax'
  WHEN kind = 'deduccion' AND (code ~* '^ss' OR name ~* 'seguridad social') THEN 'social_employee'
  WHEN kind = 'aportacion_empresa' THEN 'social_employer'
END
WHERE category IS NULL;
