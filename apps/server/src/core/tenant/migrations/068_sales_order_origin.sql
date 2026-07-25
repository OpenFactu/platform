-- 068: Origen del pedido de venta — distingue los pedidos creados desde la
-- tienda de la web pública ('web') de los creados en el ERP (NULL). Se
-- persiste desde DocumentEngine.buildHeaderValues (columna opcional, mismo
-- patrón que salesAgentId) y se muestra como badge en el listado de pedidos.

ALTER TABLE "{{schema}}"."SalesOrder" ADD COLUMN IF NOT EXISTS "origin" TEXT;
