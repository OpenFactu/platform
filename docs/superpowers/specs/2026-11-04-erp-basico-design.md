# Funciones básicas del ERP: diseño

Estado: aprobado por el usuario el 4 de noviembre de 2026, con los campos enlazados añadidos. Sin empezar: no se ha tocado código y queda pendiente la decisión 1.

## Por qué

Pedido por el usuario: «Tenemos que mejorar las funcionalidades básicas de un ERP». Vista la lista de lo que falta: «Pues lo hacemos todos». Sobre fabricación: «creamos listas de materiales como SAP, que son como recetas». Sobre campos de usuario: «igual que hace SAP, que puedes enlazar a un campo de usuario un objeto del sistema».

Keirost ya cubre bien el circuito de pedido, albarán, factura y cobro, pero le faltan piezas que cualquier empresa da por hechas. La más grave es que una factura emitida no se puede corregir bien, y que el ERP no sabe cuánto cuestan los artículos.

**Referencia:** SAP Business One. El usuario lo citó para las listas de materiales; usarlo de referencia en el resto, y el vocabulario de documentos del sistema ya se le parece, es decisión mía.

## Decisiones que necesito

Cada una lleva mi propuesta. Si no dices nada, se construye así.

1. **¿Se guarda antes lo que hay?** `feature/messaging` tiene 244 ficheros sin commitear y 5 commits sin subir. *Propongo commitear y subir antes de empezar:* esto es mucho trabajo encima y no se podría separar después. Dijiste «ahora no» cuando lo propuse; lo pregunto otra vez porque aquí cambia el riesgo.
2. **¿Se puede cancelar una factura ya emitida?** Hoy el servidor no lo impide, ni estando cobrada, aunque el propio código dice que están congeladas por ley. Además, no revierte su asiento. *Propongo que no se pueda:* una vez emitida, solo se corrige con un abono. Los borradores se siguen cancelando. Las facturas ya canceladas así se listan en la fase 0, sin tocarlas.
3. **¿Cómo se calcula el coste?** *Propongo precio medio ponderado por artículo,* el predeterminado en SAP, y en toda la empresa, no por almacén.
4. **¿Los movimientos de stock generan asiento?** SAP sí; Keirost hoy no. *Propongo que no, por ahora:* la contabilidad sigue como está, por facturas, y el coste sirve para márgenes, valoración y fabricación. Activarlo después es otro proyecto, y afecta a cómo cuadra cada país.
5. **Límite de crédito:** *propongo que por defecto avise y que cada empresa pueda ponerlo en bloquear o quitarlo.*
6. **Fabricación:** *propongo lista de materiales de producción y de venta (kit), orden de producción con consumo y entrada, y comprobar qué falta.* Sin MRP ni planificación de capacidad.
7. **Orden:** el de la tabla de abajo. Se puede cambiar, salvo lo que depende de otra fase.

## Lo que hay hoy

Comprobado leyendo el código, no probándolo pantalla a pantalla.

| Función | Estado |
|---|---|
| Abonos | Hay tipos de factura marcados `isRectify` y columnas `rectifyRef`, `rectifyReason` y `rectifyType`, pero se comportan como una factura normal: no enlazan con la original, no descuentan de su deuda, no devuelven stock y el asiento sale igual. |
| Cancelar factura emitida | **Fallo:** `DocumentEngine.cancel` no mira `isLocked` ni si está cobrada, y nada revierte su asiento: esa venta sigue en la contabilidad. |
| Informes de rentabilidad | **Fallo:** por artículo, cliente, proyecto y centro de coste no filtran por estado, así que parecen contar borradores y canceladas. |
| Coste del artículo | **No existe.** Ninguna columna de coste, y el informe de rentabilidad por artículo solo suma ventas. |
| Stock mínimo | `Item.minStock` solo se usa para un aviso en el panel de inicio. |
| Comprometido y pedido | Se calculan al consultar artículos (`api/items.ts`), aprovechables para reposición. |
| Cobros | Un `Payment` va ligado a una sola factura. Su asiento se intenta sin garantía: si falla, solo queda un aviso en el log. |
| Vencimientos | `paymentDueLines` en la factura e informe de antigüedad de deuda. |
| Cuentas del interlocutor | IBAN, banco y SWIFT. De la propia empresa, no hay cuentas bancarias. |
| Automatizaciones | Programadas, con correo, webhook y aviso. Sirven de base, no sustituyen a las funciones de abajo. |
| Campos de usuario enlazados | A medias. Existe el tipo `REFERENCE`, pero se elige una tabla interna y se escribe a mano la columna; solo los administradores pueden buscar en él; en ficha y listado sale el principio del id; en el PDF de los documentos, el id; el servidor no comprueba que exista, y no hay enlace para abrirlo. |
| Lotes y series, almacenes y zonas, entradas y salidas manuales | Existen (`StockPoster`, `GoodsReceipt`, `GoodsIssue`). |
| No existe nada de | Facturas recurrentes, límite de crédito, reclamación de impagos, cuentas y extractos bancarios, conciliación, remesas, recuento, reposición, variantes, listas de materiales, producción, activos fijos, presupuestos contables. |

## Qué se entrega y en qué orden

Cada fase se puede usar sola. Tamaño relativo: S, M, L.

| Fase | Qué | Tamaño | Depende de |
|---|---|---|---|
| 0 | Red de seguridad | S | |
| 1 | Abonos de venta y compra | M | 0 |
| 1b | Campos de usuario enlazados a objetos del sistema | S–M | |
| 2 | Coste del artículo y márgenes | M | 0 |
| 3 | Límite de crédito, impagos y recurrentes | M | 1 |
| 4 | Bancos: conciliación y remesas | L | 1 |
| 5 | Almacén: recuento y reposición | M | 2 |
| 6 | Fabricación: listas de materiales y producción | L | 2, 5 |
| 7 | Variantes de artículo | M | 2 |
| 8 | Contabilidad: activos fijos y presupuestos | M | |

**Por qué este orden (decisión mía):** primero lo que hoy puede dejar mal una factura; luego el coste, del que dependen almacén y fabricación; después el dinero, que le sirve a cualquier empresa; y al final lo que solo necesitan algunas.

## Fuera de alcance

MRP y planificación de capacidad, asientos automáticos de stock, terminal de punto de venta, EDI, y más países que España. El asistente de IA queda fuera: el usuario lo aparcó. Las herramientas de Keiro para estas funciones tampoco entran.

## Lo que no puede pasar

- Que una factura emitida cambie, o que un abono deje mal el libro de impuestos o el asiento.
- Que el coste o el margen los vea quien no debe. Tienen permiso propio.
- Que fabricar, contar o devolver deje el stock distinto entre artículo, almacén, zona y lote.
- Que un país se cuele en el núcleo.
- Que un correo a un cliente, un cargo de remesa o una factura recurrente salga sin que la empresa lo haya pedido de forma expresa.

## Reglas para todas las fases

- **Documentos:** por `DocumentTypeConfig` y `DocumentEngine`, sin ramas por tipo.
- **Stock:** por `StockPoster` o el motor, nunca a mano, con todas las capas (artículo, almacén, zona, lote).
- **Normativa:** nada de un país en `apps/*` (`npm run check:neutral`). Formatos bancarios, tipos de rectificativa y tablas de amortización llegan por plugin; España en `D:\dev\openfactu-plugin-es`.
- **Permisos y módulos:** cada función con su permiso en `permissionCatalog.ts`, su montaje por `mountApi` y comprobado también en la web. Fabricación con flag `manufacturingEnabled`, y lo demás bajo el flag del módulo al que pertenece.
- **Pantallas:** solo `@openfactu/ui` y tokens, lógica fuera de los TSX (`domain/`, `hooks/`), navegación por el registro de módulos, y textos en español e inglés con los términos de la empresa.
- **Pruebas primero:** cada comportamiento con una prueba que falle antes, de integración donde toque datos, en una base aparte y nunca en la real.
- **Base real:** con el servidor de desarrollo arrancado, guardar un `.sql` lo aplica. Las migraciones que solo añaden entran en su orden. Las que reescriben datos se apartan, se prueban en una copia y piden aprobación, como la 085.
- **Plugins:** los eventos nuevos se documentan en `@openfactu/plugin-sdk`; si cambia `@openfactu/pdf` o el SDK, hay que publicarlo y subir los rangos antes de desplegar.
- **Trazas:** toda acción de dinero o stock deja registro en auditoría.

## Fase 0. Red de seguridad

Pruebas que fijan lo que hoy pasa al emitir, cancelar y cobrar facturas de venta y compra, con stock, lotes, impuestos y retenciones, ampliando `fiscalGolden.test.ts`. También sale de aquí qué pasa de verdad con cantidades negativas en cada capa, que decide cuánto hay que tocar en la fase 1.

Se confirman y se arreglan, con su prueba, los dos fallos de arriba:
- Los informes de rentabilidad cuentan solo facturas emitidas y no canceladas.
- Cancelar una factura se resuelve según la decisión 2. Se lista qué facturas canceladas tienen hoy su asiento en pie, por empresa, para decidir qué hacer con cada una. Ninguna se corrige sola.

## Fase 1. Abonos

**Se ve así:** en una factura emitida, «Crear abono». Se abre con sus líneas para elegir cuáles y cuánta cantidad, el motivo, y en cada línea si la mercancía vuelve y a qué almacén. Se revisa y se emite.

- **Modelo (decisión mía):** sigue siendo un documento de la tabla de facturas con un tipo `isRectify`, para que series, impuestos, PDF, conectores fiscales y plugins funcionen sin más. Se añade `rectifiesInvoiceId`. Los importes se guardan **en negativo**: así los informes y el libro de impuestos, que suman líneas, salen netos sin tocarlos. Lo que la fase 0 demuestre que no lo soporta se arregla.
- **Límites:** no se puede abonar más cantidad que la facturada, sumando abonos anteriores, ni abonar un borrador o una factura cancelada.
- **Stock:** solo vuelve lo marcado, con sus lotes y series. Si no, el abono no mueve nada, y es lo normal en un descuento.
- **Asiento:** el de la factura con los lados cambiados, con cada componente de impuesto y la retención.
- **Dinero:** el abono baja lo pendiente de su factura, con un `Payment` de origen `credit_note`, sin asiento de cobro. Si ya estaba cobrada, queda saldo a favor, visible en la ficha del interlocutor, y se devuelve con un pago o se aplica a otra factura. `recalcInvoicePaymentStatus` hoy no contempla totales negativos y hay que enseñárselo.
- **Trazabilidad:** ambos documentos se enlazan en el grafo de documentos, y el conector fiscal recibe la referencia a la original.
- **PDF:** el formato neutro dice que es rectificativa, a cuál rectifica y por qué.
- **Compras:** lo mismo, con el stock al revés.
- **Cancelar:** según la decisión 2.

**Se comprueba:** abono total y parcial, con y sin devolución, con lotes y series, de factura cobrada y sin cobrar, con varios impuestos y retención; asiento, libro de impuestos y antigüedad de deuda cuadrados.

## Fase 1b. Campos de usuario enlazados

Como en SAP: al crear un campo de usuario se enlaza con un objeto del sistema. No depende de nada y es corta, por eso va pronto (decisión mía).

**Se ve así:** al crear el campo, el tipo «Enlazado a un objeto» y una lista con nombres de verdad: Interlocutor, Artículo, Factura de venta. En el formulario, un buscador de ese objeto. En la ficha, el listado, el documento y el PDF sale su nombre o número, con una flecha para abrirlo.

- **Catálogo de objetos:** un registro en el núcleo con, por objeto, su tabla, cómo se muestra (código y nombre, o número de documento), por qué busca, qué permiso pide y qué pantalla lo abre. Empieza con interlocutor, artículo, almacén, empleado, cuenta contable, centro de coste, proyecto, todos los tipos de documento (salen de `DocumentRegistry`, también los de plugin) y las tablas propias de la empresa. Los plugins añaden los suyos.
- **Datos:** `PluginField.refObject`. Los campos `REFERENCE` que ya existen siguen funcionando: si su tabla está en el catálogo se tratan como ese objeto, sin reescribir nada.
- **Búsqueda:** una ruta nueva, fuera de las de administración, que pide permiso de lectura sobre el objeto enlazado. La tabla y la columna salen del catálogo, nunca de lo que mande el navegador, y los valores van como parámetros. Con eso, `/api/custom-fields/ref` deja de hacer falta.
- **Permisos (decisión mía):** quien no puede ver el objeto ve que el campo tiene valor, pero no cuál, y no puede abrirlo. En el PDF sale siempre, porque el documento es de la empresa.
- **Al guardar:** el servidor comprueba que el valor exista, en `PluginFieldManager`.
- **Si se borra el objeto (decisión mía):** no se impide borrarlo; el campo muestra que ya no existe.
- **Plantillas e importador:** el diseñador de plantillas ofrece el nombre, no el id, y el importador acepta el código.

**Se comprueba:** crear un campo enlazado a cada clase de objeto, buscar con y sin permiso siendo usuario normal, verlo en ficha, listado y PDF, abrirlo con la flecha, un valor que no existe, un objeto borrado, un campo antiguo, y un intento de colar SQL por la búsqueda.

## Fase 2. Coste del artículo

- **Datos:** `Item.averageCost` y `lastPurchaseCost`, con una tabla `ItemCostMovement` que explica cada cambio. `unitCost` en las líneas de salida, fijado al emitir: un margen pasado no cambia nunca.
- **Regla:** cada entrada con precio recalcula la media, en moneda base. Si el stock era cero o negativo, el coste pasa a ser el de esa entrada. Entran albaranes y facturas de compra directas, entradas manuales (con un coste opcional que hoy no tienen), devoluciones al coste con el que salieron y, más adelante, producción.
- **Lo existente:** la media arranca con el último precio de compra de cada artículo. Es rellenar una columna nueva, pero se prueba en una copia.
- **Pantallas e informes:** coste en la ficha, margen real en rentabilidad por artículo, cliente y proyecto, e informe de valor de inventario.
- **Permiso:** `/items/cost` aparte. Sin él, ni coste ni margen, tampoco por la API.

**Se comprueba:** una secuencia de compras y ventas a mano contra el cálculo esperado, en moneda extranjera, con stock negativo y con cancelaciones.

## Fase 3. Crédito, impagos y recurrentes

**Límite de crédito**
- `BusinessPartner.creditLimit`, y por empresa `off`, `warn` o `block`.
- Deuda: facturas pendientes, más albaranes sin facturar, más pedidos abiertos, menos saldo a favor.
- Lo comprueba el servidor al crear pedido, albarán o factura de venta. Saltarse un bloqueo requiere el permiso `/partners/credit-override` y queda en auditoría.
- En la ficha, una barra con lo usado y lo disponible.

**Reclamación de impagos**
- Niveles por empresa: días tras el vencimiento y plantilla.
- Una pantalla con lo vencido agrupado por cliente, vista previa y envío con el detalle y las facturas. Cada envío queda en `DunningLetter`, y sube de nivel.
- Se puede excluir a un cliente. El envío automático es opcional y va apagado.

**Facturas recurrentes**
- `RecurringDocument`: interlocutor, líneas, frecuencia, próxima fecha y fin.
- Por defecto crea borrador. Emitir y enviar solos hay que activarlo.
- Una tarea diaria por `DocumentEngine`, sin generar dos veces el mismo periodo aunque se reintente. Si falla, avisa a los administradores y no se salta el periodo.

## Fase 4. Bancos

- **Cuentas:** `CompanyBankAccount`, con IBAN, moneda y cuenta contable.
- **Extractos:** importar CSV con mapeo de columnas, reutilizando el parser del importador de datos, sin duplicar lo ya importado. Otros formatos los aporta un plugin con `bankFormats.registerStatementParser`; Norma 43 va en el plugin de España.
- **Conciliación:** movimientos del banco frente a cobros y pagos, con sugerencias por importe, referencia y fecha. Un movimiento puede cubrir varios cobros. Si no hay ninguno, se crea el cobro desde ahí, o un asiento contra una cuenta. Se puede deshacer.
- **Remesas:** `PaymentBatch` con vencimientos de facturas, de cobro o de pago. Borrador, generado y cerrado. El fichero lo genera un plugin con `bankFormats.registerBatchExporter`, SEPA en el de España, y sin plugin un CSV. Al cerrar se crean los cobros; una devolución los deshace y reabre la deuda.
- **Mandatos:** referencia y fecha guardadas de forma genérica en el interlocutor.
- **De paso:** la lógica de cobros sale de `api/payments.ts` a un servicio, y el asiento entra en la misma transacción. Un cobro sin asiento no cuadra con el banco.

## Fase 5. Almacén

**Recuento de inventario**
- `InventoryCount` por almacén, zona o categoría. Al abrir se guarda lo esperado, con opción de recuento a ciegas.
- Se cuenta desde el móvil o con lector, con lotes y series.
- Se revisan las diferencias y, al cerrar, salen entradas y salidas por `StockPoster`, valoradas al coste medio.
- Lo movido durante el recuento se tiene en cuenta en vez de bloquear el almacén.

**Reposición**
- En el artículo: `reorderQty`, `preferredSupplierId` y `leadTimeDays`.
- Una pantalla con lo que queda por debajo del mínimo, contando stock, menos comprometido, más pedido.
- De ahí se generan pedidos de compra en borrador, agrupados por proveedor.

## Fase 6. Fabricación

Listas de materiales como en SAP. Módulo nuevo con flag `manufacturingEnabled` y permiso `/manufacturing`.

**Lista de materiales**
- `BillOfMaterial`: artículo, cantidad base, tipo (producción o venta), versión y activa.
- `BillOfMaterialLine`: componente, cantidad, unidad, merma y forma de consumo (manual o automática al terminar).
- Una línea puede ser un artículo o un recurso, como la mano de obra, que suma coste sin stock.
- Una lista puede usar otra como componente, y el servidor rechaza los ciclos.

**Coste y faltas**
- Desglose del coste con coste medio, recursos y merma.
- «Para fabricar N»: qué hay y qué falta, y de ahí a la propuesta de compra de la fase 5.

**Orden de producción**
- `ProductionOrder` con serie propia: planificada, liberada, cerrada o cancelada.
- Copia la lista al crearse y se puede ajustar.
- Se crea a mano o desde una línea de pedido de venta, y queda enlazada.
- **Consumo:** sale el material, con sus lotes.
- **Entrada:** entra el producto, también por partes y con lote nuevo. Recalcula su coste medio con lo realmente consumido.
- **Al cerrar:** se ve lo previsto frente a lo real. Se imprime hoja de fabricación y lista de material.

**Kits (lista de venta)**
- Se vende el padre y el stock sale de los componentes, con un hook de `DocumentEngine`.

**Se comprueba:** fabricar, consumir de más y de menos, entrada parcial, lotes, cancelar a medias, una lista dentro de otra, ciclos, un kit vendido y abonado, y que todas las capas de stock cuadren.

## Fase 7. Variantes

- `ItemAttribute` y sus valores, y `Item.parentItemId`.
- Se elige por ejemplo talla y color, y se genera la matriz.
- **Cada variante es un artículo de verdad (decisión mía),** con su código, stock y precio opcional. Así documentos, lotes, recuentos y listas de materiales funcionan sin tocarlos.
- El padre agrupa y no se vende. Búsquedas agrupadas, e importador de datos.

## Fase 8. Contabilidad

**Activos fijos**
- `FixedAsset`: fecha, coste, valor residual, vida útil y cuentas, por `AccountMapping`.
- Amortización lineal con su cuadro. Otros métodos y tablas de coeficientes llegan por el paquete del país.
- Cada mes se propone el asiento y una persona lo confirma, igual que el cierre de periodo, que nunca se hace solo.
- Baja y venta, y crear un activo desde una línea de factura de compra.

**Presupuestos**
- `AccountBudget` por año, cuenta y mes, con centro de coste opcional, y copiar del año anterior.
- Informe de presupuesto frente a real, sobre el mayor.

## Riesgos

- **Tamaño:** son nueve entregas. Conviene probar y commitear cada una antes de empezar la siguiente.
- **Importes negativos:** es la apuesta de la fase 1. Hay validaciones de stock y asientos que pueden no esperarlos; la fase 0 lo mide antes de escribir nada.
- **Stock en coma flotante:** `Item.stock` es `doublePrecision`. El coste irá en `numeric`, y las comparaciones de stock se revisan donde decidan algo.
- **Normativa:** los formatos de España y lo que digan las rectificativas se trasladan sin certificar, como el resto del plugin. Antes de usarlo en real, hay que revisarlo con una asesoría.
- **Paquetes:** `@openfactu/pdf` y `@openfactu/plugin-sdk` cambiarán y habrá que volver a publicarlos.

## Cómo se comprueba cada fase

- `npm test`, `check:neutral`, `check-permissions` y `tsc` en servidor y web.
- Recorrido real en navegador sobre una copia de la base con los datos neutralizados, con perfiles de escritura, lectura y sin permiso.
- En lo que toque dinero, un caso calculado a mano contra el asiento y el informe.
- Pantallas en tema no azul, modo oscuro y móvil donde se trabaje de pie: recuento y fabricación.
- Lo que no se pueda comprobar se dice. Por ejemplo, un fichero de remesa solo se da por bueno cuando lo acepte un banco de verdad.

## Lo que queda a quien lo construya

Nombres exactos, reparto en ficheros, diseño de cada pantalla y qué eventos nuevos se publican, siguiendo lo que ya hay.
