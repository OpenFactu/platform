-- 069: Tarifa de precios de la tienda web. El site puede apuntar a una
-- PriceList: la tienda pública muestra (y el checkout cobra) esos precios en
-- vez del basePrice; cuando el precio de tarifa es menor que el base, la
-- tienda lo enseña como oferta (precio anterior tachado + badge %).

ALTER TABLE "{{schema}}"."WebsiteSite" ADD COLUMN IF NOT EXISTS "priceListId" TEXT REFERENCES "{{schema}}"."PriceList"("id") ON DELETE SET NULL;
