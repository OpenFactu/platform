-- Impuesto por defecto del interlocutor. Al añadir una línea manda sobre el del
-- artículo: sirve para clientes exentos o de otro régimen.
ALTER TABLE "BusinessPartner"
  ADD COLUMN IF NOT EXISTS "defaultTaxGroupId" TEXT REFERENCES "TaxGroup"(id);
