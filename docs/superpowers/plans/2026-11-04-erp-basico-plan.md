# Funciones básicas del ERP: plan de trabajo

> **Para quien lo ejecute:** se trabaja en esta sesión, tarea a tarea (`superpowers:executing-plans`), sin agentes: el usuario no los ha pedido. Los pasos usan casillas.

**Objetivo:** corregir bien las facturas emitidas y enlazar campos de usuario con objetos del sistema. Las fases 2 a 8 se planifican al llegar a ellas, cada una con lo aprendido en la anterior.

**Arquitectura:** los abonos son facturas con un tipo `isRectify` e importes negativos, por el mismo `DocumentEngine`. Los campos enlazados son un catálogo de objetos en el núcleo y una ruta de búsqueda con permisos.

**Tecnología:** Express, Drizzle, Postgres, React, `@openfactu/ui`, `node:test`.

**Diseño:** `docs/superpowers/specs/2026-11-04-erp-basico-design.md`

## Restricciones

- **Sin commits:** el usuario dijo «Empieza» sin contestar a si se commitea. Nada se commitea ni se sube hasta que lo pida.
- **Base real:** solo se toca arrancando el servidor. Las pruebas, en `keirost_logistics_test`, con `LOGISTICS_TEST_DATABASE_URL`. La comprobación en navegador, en una copia neutralizada.
- Las reglas de la sección «Reglas para todas las fases» del diseño aplican a cada tarea.

## Lo que más puede fallar

1. Abonar una línea con descuento o retención: el total tiene que ser el inverso exacto de esa parte de la factura. Lo prueba la tarea 1.1.
2. Dos abonos seguidos que juntos superen lo facturado: el segundo se rechaza. Tarea 1.2.
3. Abonar una línea con lotes: vuelve a los lotes con los que salió, no a otros. Tarea 1.2.
4. Abonar una factura ya cobrada a medias: se aplica solo lo pendiente y el resto queda a favor. Tarea 1.3.
5. Búsqueda de un campo enlazado sin permiso, o con SQL en el texto: 403 o sin efecto. Tarea 1b.1.

---

## Fase 0. Red de seguridad

### Tarea 0.1: arnés de documentos

**Ficheros:**
- Crear: `apps/server/src/core/tenant/__tests__/testTenant.ts`
- Crear: `apps/server/src/core/documents/__tests__/documentsHarness.ts`
- Modificar: `apps/server/src/core/logistics/__tests__/logisticsHarness.ts` (usa `createTestTenant`)

**Interfaces:**
- Produce: `createTestTenant(): Promise<{ tenantId, schemaName, db, publicDb, query, suffix, drop }>`
- Produce: `startDocumentsHarness(): Promise<DocumentsHarness>` con `api(method, path, body?, user?)`, `query`, `db`, `seedPartner()`, `seedWarehouse()`, `seedItem({ stock?, manageBy? })`, `seedAccounting()` (mapeos mínimos con impuesto y retención), `invoice(side, lines, options?)` (crea borrador por la API), `post(side, id)`, `close()`.

- [ ] Extraer de `logisticsHarness.ts` la creación de empresa a `createTestTenant`.
- [ ] Pasar `logisticsFlow.integration.test.ts`: las 12 siguen en verde.
- [ ] Escribir el arnés con los routers de facturas de venta y compra, documentos, cobros e informes.

### Tarea 0.2: fijar lo que hay

**Ficheros:** crear `apps/server/src/core/documents/__tests__/invoiceFlow.integration.test.ts`

- [ ] Pruebas, que deben pasar sin tocar el motor: una factura directa mueve el stock al crearse; emitirla la bloquea y genera un asiento que cuadra; un cobro baja lo pendiente y genera su asiento; un borrador cancelado devuelve el stock.
- [ ] Medir con una prueba qué pasa hoy con cantidades negativas: stock, totales, impuestos, asiento. El resultado se anota en el registro de trabajo.

### Tarea 0.3: informes de rentabilidad

**Ficheros:** modificar `apps/server/src/api/reports.ts:776-920`; crear `apps/server/src/core/documents/__tests__/profitReports.integration.test.ts`

- [ ] Prueba: con una factura emitida, un borrador y una cancelada, `/profit-customer`, `/profit-item`, `/profit-project` y `/profit-cost-center` solo cuentan la emitida. También los gastos de compra.
- [ ] Verla fallar.
- [ ] Filtrar por `status NOT IN ('D','X')`, en un único helper.
- [ ] Verla pasar.

### Tarea 0.4: una factura emitida no se cancela

**Ficheros:** modificar `apps/server/src/core/documents/DocumentEngine.ts:424`, las pantallas de factura; crear `apps/server/src/scripts/list-cancelled-issued-invoices.ts`

- [ ] Prueba: cancelar una factura emitida da 409 con código `INVOICE_LOCKED`, por las tres rutas, y el stock no se mueve. Un borrador se sigue cancelando.
- [ ] Verla fallar.
- [ ] En `DocumentEngine.cancel`, rechazar si `config.category === 'invoice' && header.isLocked`.
- [ ] Revisar quién más llama a `cancel` con facturas y las pruebas de conectores fiscales.
- [ ] Web: sin botón de cancelar en facturas emitidas.
- [ ] Script de solo lectura: por empresa, facturas canceladas con el asiento en pie. Lanzarlo contra la base real y anotar el resultado.

---

## Fase 1. Abonos

### Tarea 1.1: importes negativos en el motor y los asientos

**Ficheros:** crear `apps/server/src/core/tenant/migrations/092_credit_notes.sql`; modificar `apps/server/src/db/schema.ts`, `DocumentEngine.ts`, `JournalEngine.ts`, `paymentStatusRecalc.ts`, `fiscalGolden.test.ts`

**Interfaces:**
- Produce: columnas `rectifiesInvoiceId` en `SalesInvoice` y `PurchaseInvoice`, y `stockReturned` (boolean, por defecto `false`) en sus líneas.
- Produce: `DocumentLine.returnStock?: boolean`.

- [ ] Golden: una línea de -2 × 50 con 10 % de descuento y 21 % da neto -90 e impuesto -18,9. Con `discountAmount: -25`, neto -75. Con retención negativa, lo mismo.
- [ ] Golden: el asiento de una factura con total negativo es el de la positiva con los lados cambiados, también con varios impuestos y retención, y cuadra.
- [ ] Prueba: `recalcInvoicePaymentStatus` da `pending`, `partial` y `paid` con total negativo.
- [ ] Verlas fallar.
- [ ] `computeLineAmounts`: `discAmt !== 0` y `whAmt !== 0`; `computePreliminaryTotals` igual.
- [ ] `JournalEngine`: con total negativo, calcular con valores absolutos y cambiar los lados al final.
- [ ] `recalcInvoicePaymentStatus`: comparar en valor absoluto.
- [ ] Migración y esquema, escritos antes del código que los use.
- [ ] Verlas pasar, con todo `fiscalGolden` en verde.

### Tarea 1.2: crear el abono

**Ficheros:** crear `apps/server/src/core/documents/creditNotes.ts`, `apps/server/src/api/documentos/creditNoteRoutes.ts`, `apps/server/src/core/documents/__tests__/creditNotes.integration.test.ts`; modificar `DocumentEngine.ts`, `salesInvoices.ts`, `purchaseInvoices.ts`

**Interfaces:**
- Produce: `creditableLines(db, side, invoiceId): Promise<CreditableLine[]>`, con `{ lineId, itemId, description, invoiced, credited, available, price, batches }`.
- Produce: `createCreditNote(ctx, side, invoiceId, input): Promise<{ id }>`, con `input = { lines: [{ lineId, quantity, returnStock?, warehouseId? }], reason, rectifyType?, documentTypeId?, seriesId?, date? }`.
- Produce: `GET /api/sales/invoices/:id/credit-note` y `POST`, y lo mismo en compras.

- [ ] Pruebas: abono total y parcial; sin devolución no mueve stock; con devolución sí, a todas las capas; con lotes vuelve a sus lotes; cancelar un abono en borrador deshace lo devuelto; más cantidad de la disponible da 400; dos abonos seguidos que la superan, 400; de un borrador o una cancelada, 400; sin un tipo `isRectify` configurado, 400 con mensaje claro; la factura original sigue abierta y sin cerrarse.
- [ ] Verlas fallar.
- [ ] Implementar por `DocumentEngine.create`, con `baseType` y `baseId` a la factura, cantidades negativas y `returnStock` en cada línea. El motor mueve stock si `returnStock`, aunque el documento base ya lo moviera, y guarda `stockReturned`. `reverseLineStock` lo respeta. `closeBaseDocumentsIfNeeded` no toca facturas.
- [ ] Verlas pasar.

### Tarea 1.3: el dinero del abono

**Ficheros:** modificar `DocumentEngine.ts` (`post`), `creditNotes.ts`, `api/partners.ts`; ampliar `creditNotes.integration.test.ts`

**Interfaces:**
- Produce: `applyCreditNote(tx, side, creditNote)`, llamada desde `post`.
- Produce: `partnerCreditBalance(db, side, partnerId)`, `GET /api/partners/:id/credit-balance` y `POST /api/sales/invoices/:id/apply-credit` con `{ targetInvoiceId, amount }`, y lo mismo en compras.

- [ ] Pruebas: emitir un abono de una factura pendiente la deja pagada, sin asiento de cobro; de una cobrada a medias aplica lo pendiente y el resto queda a favor; aplicar el saldo a otra factura la baja; devolver el saldo con un cobro negativo genera el asiento inverso; un abono no genera vencimientos; el libro de impuestos y la antigüedad de deuda salen netos.
- [ ] Verlas fallar.
- [ ] Al emitir: dos `Payment` con `source: 'credit_note'`, positivo en la factura y negativo en el abono, y recálculo de ambos.
- [ ] Verlas pasar.

### Tarea 1.4: conectores, PDF y trazabilidad

**Ficheros:** modificar `PdfPayloadBuilder.ts`, `documentLinks.ts`, `FiscalConnectors.ts`; `@openfactu/pdf` solo si el formato neutro no muestra ya la referencia

- [ ] Prueba: el conector fiscal recibe `rectifies` con el número y la fecha de la original; el grafo enlaza ambos; el PDF lleva referencia y motivo.
- [ ] Verla fallar, implementar, verla pasar.
- [ ] Documentar en `plugin-sdk` y en `docs/localizacion-plugins.md`. Queda pendiente publicar el SDK.

### Tarea 1.5: pantallas

**Ficheros:** crear `apps/web/src/modules/documents/domain/creditNote.ts`, `hooks/useCreditNote.ts`, `components/documents/CreditNoteModal.tsx`; modificar `SalesInvoices.tsx`, `PurchaseInvoices.tsx`, `PartnerDetail.tsx`, y las traducciones

- [ ] «Crear abono» en la factura emitida: líneas con lo disponible, cantidad, si vuelve la mercancía y a qué almacén, tipo y motivo.
- [ ] Referencia cruzada entre factura y abono, saldo a favor en la ficha, y aplicar o devolver.
- [ ] Solo con permiso de escritura en facturas.
- [ ] Comprobar en navegador sobre una copia: abono total, parcial y con devolución, cobro, saldo y PDF.

---

## Fase 1b. Campos enlazados

### Tarea 1b.1: catálogo y búsqueda

**Ficheros:** crear `apps/server/src/core/customFields/linkableObjects.ts`, `apps/server/src/api/linkedObjects.ts`, `apps/server/src/core/customFields/__tests__/linkableObjects.integration.test.ts`; modificar `db/schema.ts`, `sql/public-schema.sql`, `scripts/generate-public-schema.mjs` si hace falta, `server.ts`, `core/auth/apiMounts.ts`, `core/auth/permissionCatalog.ts`, `plugins/types.ts`, `plugins/loader.ts`

**Interfaces:**
- Produce: `LinkableObject = { id, label, table, display, search, permissionPath, route }`.
- Produce: `listLinkableObjects(ctx)`, `searchLinkedObject(ctx, objectId, q)`, `resolveLinkedObjects(ctx, objectId, ids)`, `linkedObjectExists(ctx, objectId, id)`.
- Produce: `GET /api/linked-objects`, `GET /api/linked-objects/:object/search?q=` y `POST /api/linked-objects/:object/resolve`.
- Produce: `PluginField.refObject` y el contexto de plugin `linkableObjects.register`.

- [ ] Pruebas: un usuario normal con permiso busca; sin él, 403; un texto con comillas o SQL no rompe nada ni devuelve de más; los documentos muestran su número y las tablas propias aparecen; un objeto desconocido da 404; `resolve` omite lo que el usuario no puede ver.
- [ ] Verlas fallar, implementar, verlas pasar. Tabla y columnas salen del catálogo y los valores van como parámetros.
- [ ] Quitar `GET /api/custom-fields/ref/:tableName` cuando nadie lo use.

### Tarea 1b.2: guardar y mostrar

**Ficheros:** modificar `api/customFields.ts`, `core/plugins/PluginFieldManager.ts`, `PdfPayloadBuilder.ts`, `core/dataimport/pluginFields.ts`; web: `components/plugin-fields/ReferenceSelect.tsx`, `PluginFieldValue.tsx`, `settings/custom-fields/FieldDrawer.tsx`, `fieldForm.ts`

- [ ] Pruebas: crear un campo con `refObject`; un valor inexistente se rechaza al guardar; un campo antiguo con `refTable` se trata como su objeto; el PDF lleva el nombre; el importador acepta el código.
- [ ] Verlas fallar, implementar, verlas pasar.
- [ ] Web: lista de objetos con nombres al crear el campo, buscador por la ruta nueva, nombre y flecha en ficha y listado, «sin acceso» y «ya no existe».
- [ ] Comprobar en navegador sobre una copia, con un usuario normal.

---

## Fase 2: coste del artículo y márgenes

**Regla:** precio medio ponderado en toda la empresa y en moneda base, en `core/stock/itemCost.ts`. La salida guarda su coste en `unitCost` y no cambia después.

### Tarea 2.1: coste medio y movimientos

**Ficheros:** crear `core/stock/itemCost.ts`, `core/tenant/migrations/093_item_cost.sql` y `api/middleware/hideItemCosts.ts`; modificar `DocumentEngine.ts`, `StockPoster.ts`, `api/stockMovements.ts`, `api/items.ts`, `db/schema.ts`.

- [x] Pruebas puras (`itemCost.test.ts`) e integración con la secuencia calculada a mano (`itemCost.integration.test.ts`): compras, descuento, unidad, moneda, stock negativo, cancelaciones, abonos, albaranes, faltas, entradas y salidas manuales.
- [x] Migración probada antes sobre una copia de la base; aplicada a las cuatro empresas.

### Tarea 2.2: márgenes, informes y permiso

**Ficheros:** modificar `api/reports.ts`, `core/auth/permissionCatalog.ts`, `server.ts`.

- [x] Rentabilidad con importes sin impuesto; coste y margen por artículo, cliente, proyecto y centro; inventario a coste medio.
- [x] Permiso `/item-costs`: sin él, ninguna respuesta lleva coste y los informes no dan margen de artículo.

### Tarea 2.3: pantallas

**Ficheros:** crear `modules/inventory/{domain/itemCost.ts,hooks/useItemCostMovements.ts,components/ItemCostPanel.tsx}` y `modules/reports/{domain/itemCosts.ts,components/UncostedNotice.tsx}`; modificar la ficha, `StockMovements.tsx`, los cinco informes y sus textos.

- [x] Comprobado en navegador sobre una copia, con administrador, usuario sin permiso y usuario de solo lectura: 37/37.

---

## Fase 3: crédito, impagos y recurrentes

Planificada al llegar, con lo aprendido en la 2. Sin agentes y sin commits, como las anteriores.

**Lo que más puede fallar:**
1. Contar dos veces la misma deuda: un albarán que sale de un pedido o una factura que sale de un albarán no añaden nada. Se mide la deuda antes y después de crear el documento, con la fila del cliente bloqueada. Tarea 3.1.
2. Dos documentos a la vez que juntos superan el límite: el segundo se bloquea. Tarea 3.1.
3. Reclamar a quien ya pagó, o un correo a medias que suba de nivel: el nivel solo sube con el correo aceptado, y una factura ya saldada no entra. Tarea 3.2.
4. Generar dos veces un periodo, o saltarse uno si falla: la fila del periodo y el documento van en la misma transacción. Tarea 3.3.
5. Una recurrente con fecha de inicio antigua que dispara once facturas: al crearla o reanudarla no se recupera lo pasado; solo lo que se perdió estando activa. Tarea 3.3.

### Tarea 3.1: límite de crédito

**Ficheros:** crear `core/tenant/migrations/095_credit_dunning_recurring.sql`, `core/partners/creditLimit.ts`, `api/partnerCredit.ts`, `core/partners/__tests__/creditLimit.integration.test.ts`; modificar `DocumentEngine.create`, `DocumentRegistry` (`checksCredit` en SO, SDN y SINV), los routers de creación (pasan `error.details`), `api/partners.ts`, `permissionCatalog.ts`.

- [ ] Pruebas: sin límite no pasa nada; avisa, bloquea (409 sin dejar rastro) o no mira según la empresa; saltarlo pide `/credit-override` y deja auditoría; qué cuenta como deuda; pedido a albarán y albarán a factura no añaden; abonos, compras y presupuestos no se miran; dos a la vez; cambiar el límite pide el mismo permiso.
- [ ] Verlas fallar, implementar, verlas pasar.

### Tarea 3.2: impagos

**Ficheros:** crear `core/dunning/{settings,overdue,overdueList,dunningEmail,letters,dunningCron}.ts`, `api/dunning.ts`, `core/documents/documentAttachment.ts` (sale de `api/email.ts`), `i18n/messages/en/dunning.ts` y sus pruebas.

- [ ] Puras: plazos pagados en orden, días vencidos, nivel alcanzado y siguiente, sin saltarse niveles.
- [ ] Integración: listado por cliente, excluidos, vista previa, envío con facturas adjuntas, sube de nivel solo si se envía, doble envío, envío automático apagado por defecto y sin repetir antes de los días mínimos.

### Tarea 3.3: recurrentes

**Ficheros:** crear `core/recurring/{schedule,recurringDocuments,recurringCron}.ts`, `api/recurringDocuments.ts` y sus pruebas.

- [ ] Puras: fin de mes (31 de enero, 28 de febrero, 31 de marzo), bisiestos, semanal, fin de la serie.
- [ ] Integración: crea borrador por el motor; no repite periodo; si falla no avanza y avisa una vez al día; emitir y enviar solo si se activa; cambio de ejercicio toma la serie del periodo nuevo; pausa sin recuperar.

### Tarea 3.4: pantallas

**Ficheros:** en `modules/documents`: `pages/Dunning.tsx`, `pages/DunningLetter.tsx`, `pages/RecurringDocuments.tsx`, `pages/RecurringDocumentForm.tsx`, `pages/SalesSettings.tsx`, con su `domain/` y `hooks/`; en la ficha del interlocutor, la tarjeta de crédito con barra; en pedido, albarán y factura, el aviso y la confirmación.

- [ ] Textos en español e inglés, permisos en `module.ts`, comprobar a ancho de móvil en una copia.

## Al terminar estas fases

Pasar `npm test`, `check:neutral`, `check-permissions` y `tsc`. Hacer una revisión completa de los cambios, anotar los detalles menores y actualizar `CLAUDE.md`. Luego, planificar la fase 2.
