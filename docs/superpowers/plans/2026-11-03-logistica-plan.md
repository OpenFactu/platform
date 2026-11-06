# Plan de logística: rehacer el núcleo y las pantallas, por fases

## Estado (3 de noviembre de 2026)

Fases 0 a 7 aplicadas, sin commitear. La migración 085 se aplicó el 4 de noviembre, primero en una copia. Falta: conectar un transportista real y elegir servidor de teselas para producción.

## Recomendación

**Rehacer por dentro y por fases, sin reescribir de cero.**

Las tablas sirven y hay piezas que funcionan y costaría repetir: picking con lotes, avisos por correo, seguimiento público con mapa y chat, GPS y firma del conductor, QR de acopios y optimizar ruta. Lo que está mal es lo que las une: no hay reglas de estado, la lógica vive en un fichero de 3.862 líneas y las pantallas enseñan datos internos.

| Se rehace | Se conserva |
|---|---|
| Ciclo de vida del envío y acciones de reparto | Tablas (con pocos cambios) y enlaces de seguimiento ya enviados |
| `api/logistics.ts`, partido por áreas | Picking y lotes, correos, geocodificación |
| Mapas, sobre `TileMap` de `@openfactu/ui` | |
| Centro logístico, ficha de envío y listados | Lo que hacen la página pública de seguimiento y su chat |
| Conexión con transportistas | Interfaz `ICarrierAdapter` |
| App del conductor por dentro | Su flujo |
| Aspecto de la app del conductor y del seguimiento público, sobre `@openfactu/ui` | |

## Lo que está mal

### Probado sobre una copia de la base

| # | Qué pasa | Por qué importa |
|---|---|---|
| 1 | Un envío aplazado no se puede reintentar. No sale en "sin ruta" y, si se despacha a otra ruta, la parada sigue `postponed`: envío "en tránsito", parada aplazada y ruta activa | El aviso al cliente dice "se reintentará" y el sistema no deja hacerlo bien |
| 2 | **El enlace del correo del cliente sirve para enviar la posición del camión, sin sesión.** Es el mismo token | Cualquier destinatario puede falsear dónde está su reparto, y otros lo verían |
| 3 | Borrar una ruta completada borra sus paradas, **con la firma y la foto de entrega** | Se pierde la prueba de entrega |
| 4 | No hay reglas de estado: un envío nuevo pasa a entregado de golpe, uno entregado vuelve a "listo", se acepta el estado `patata` y una salida se puede "recibir" | Cualquier llamada deja el envío incoherente |
| 5 | Un envío entregado se puede borrar sin dejar rastro | Sin histórico ni auditoría |
| 6 | Se puede asignar un vehículo en mantenimiento y meter 500 kg en uno de 10 kg | La capacidad se guarda y nadie la mira |
| 7 | Los paquetes no siguen a su envío: entregado el envío, el paquete sigue `open` o `sealed` | Sus estados `shipped` y `delivered` nunca se alcanzan |
| 8 | La recogida de una devolución crea una recepción **sin líneas** | Alguien tiene que adivinar qué se recogió |

### Visto en tus datos y pantallas

- **Dos estados que no cuadran:** `status` y `preparationStatus` conviven. 5 de tus 12 envíos no coinciden, y 2 salen como "Pendiente" estando recibidos.
- **Historial imposible:** el envío `74551b79` va de entregado a devuelto, a incidencia y a "en tránsito", y lleva así 104 días.
- **Sin avisos:** "RUTA PRUEBA 2" lleva activa desde el 21/07 y nada lo señala.
- **Listado de envíos:** no dice cliente, documento, número de envío ni si entra o sale. La columna Conductor sale vacía aunque la ruta tenga conductor, y Transportista dice siempre "propio".
- **Ficha del envío:** se titula con un trozo de identificador interno y los eventos salen como `status_change` o `in_transit`. Enseña a cualquiera una URL de API y "Copiar token". No muestra paquetes, ruta ni prueba de entrega.
- **Rutas:** fecha sin formato, sin número de paradas ni progreso, y papelera también en las completadas.
- **Paquetes:** `sealed` sin traducir, sin cliente ni envío.
- **Centro logístico:** abre en una pestaña vacía, sin vista del día. Mezcla la operación diaria (Preparación, Envíos, Incidencias, Rutas) con catálogos (Vehículos, Plataformas), y Transportistas está en otro sitio. Todo lleva BETA.

### Leído en el código

- **Una falta en el picking no tiene consecuencias.** El albarán ya descontó el stock al crearse. Marcar `missing` no corrige el albarán ni devuelve el stock, y el envío pasa a "empaquetado" igual.
- **Transportistas es una fachada.** Las cuentas solo se usan en su botón de prueba, nunca en un envío real. El adaptador manual inventa números de seguimiento y su etiqueta es un texto "Pendiente de implementar". Tienes 0 cuentas.
- **Entregar son dos llamadas desde el móvil:** primero la parada y luego el envío. Si la segunda falla, la parada queda entregada y el envío no.
- **Permisos:** todo es un solo permiso `/logistics`. El conductor lo necesita para usar su app y con él también puede borrar rutas y cancelar envíos.
- **Falta por completo:** etiquetas de bulto, packing list, hoja de ruta, informes y **pruebas** (no hay ni una).
- **Números al azar** en rutas, paquetes y recepciones (`RT-647193`, `PK-163546`), no correlativos.
- **Rendimiento:** cada posición del GPS recorre todas las empresas para encontrar el token.
- **Tamaño:** `api/logistics.ts` 3.862 líneas, `DriverApp` 1.510, `StagingAreasTab` 978, `ShipmentDetail` 861.
- **Correos en español fijo**, sin el idioma del destinatario.

## Regla para todas las pantallas: `@openfactu/ui`

Toda pantalla de logística que se toque queda construida con `@openfactu/ui` y con los tokens de color, incluidas la app del conductor y el seguimiento público. Si el paquete no tiene una pieza, no se crea una local: se anota como hueco para pasarla al mantenedor.

### Cómo está hoy

- **Controles básicos: casi bien.** 18 de los 19 ficheros de `modules/logistics` usan el paquete. Quedan 12 elementos crudos, la mayoría sobre el mapa.
- **Piezas de ficha y listado: sin usar.** Ninguna pantalla usa `Timeline`, `DescriptionList`, `StatusBadge`, `KpiCard`, `Alert`, `FilterBar`, `Pagination`, `BulkActionsBar`, `BottomSheet` ni `BottomNavigation`. Parte de lo que está mal en las pantallas viene de ahí.
- **Seguimiento público: fuera del paquete.** `TrackingPage` y `TrackingChatWidget` no lo importan: 6 elementos crudos y 96 clases de color fijas. `PublicFormPage` y `GuestCallPage` sí lo usan, así que en una página pública se puede.
- **Colores fijos:** 191 clases de la paleta en `modules/logistics`, 47 de ellas en `DriverApp`. No siguen el tema de la empresa. Algunas pueden ser decoración deliberada, como las de los mapas, y se miran una a una.

### Qué pieza va en cada sitio

| Dónde | Componentes |
|---|---|
| Hoy | `KpiCard`, `Alert` para retrasos y rutas abiertas de más, `Table` |
| Listados | `Table`, `FilterBar`, `Pagination`, `BulkActionsBar`, `EmptyState` |
| Estados | `StatusBadge`, con un único mapa de estado a texto y tono |
| Ficha de envío | `PageHeader`, `DescriptionList`, `Stepper` para el avance, `Timeline` para el historial, `Lightbox` para la foto de entrega, `CopyButton` en los datos técnicos |
| Acciones | `Modal` o `Drawer` para asignar y `ConfirmDialog` para lo que no tiene vuelta atrás |
| Conductor | `List` y `ListItem` para rutas y paradas, `BottomSheet` y `BottomNavigation`, `SignaturePad` (ya lo usa) |
| Seguimiento público | `Card`, `Stepper`, `Timeline`, `Button`, `Input` y `Textarea` en el chat |
| Configuración | `Table`, `Form`, `FormGrid`, `Field` |
| Mapas | `TileMap`, `Marker`, `MapPath`, `MapPopup`, `MapControl`, `MapButton` |

### Mapas: los del paquete

Todos los mapas pasan a `TileMap`, y `maplibre-gl` y `react-map-gl` salen de `apps/web`. Solo los usan `BaseMap`, `ShipmentDetail`, `RouteMapPlanner`, `DriverApp` y `TrackingPage`. Ninguna pantalla de Keirost usa todavía `TileMap`, así que esta será su primera prueba real.

| Hoy | Con el paquete |
|---|---|
| `BaseMap` | `TileMap`, con `controls` y `defaultView` |
| `Marker` de `react-map-gl` | `Marker` del paquete, con `NumberedPin` como contenido |
| `Source` y `Layer` para la línea | `MapPath`, con `dashed` |
| `Popup` de la parada | `popup` del `Marker` o `MapPopup` |
| Botones Mapa/Satélite y Centrar | `MapControl` con `MapButton` |
| Segundo mapa dentro de un `Modal` para ampliar, en `DriverApp` | Control `fullscreen` del propio mapa |
| `MapSearchBox` sobre el mapa | `geocoder` de `TileMap`, sobre nuestro `/geocode/suggest` |
| `MapSearchBox inline` en el alta de envío | `SearchableSelect` en modo servidor, con `creatable` para una dirección libre |
| Vista satélite por defecto | La misma, con `registerMapStyle` y las mismas teselas de Esri |

Lo que cambia o hay que vigilar:

- **Arrastrar la chincheta:** `Marker` no se puede arrastrar, y `ShipmentDetail` lo usa para ajustar el destino. Propongo un botón «Mover chincheta» y tocar en el mapa, que es como ya se coloca cuando no hay ninguna. Se anota como hueco del paquete.
- **Mapa base:** `TileMap` solo pinta teselas de imagen, así que el mapa vectorial de OpenFreeMap desaparece y el modo «Mapa» pasa a OpenStreetMap. Hay que comparar que se sigan viendo los números de portal, que fue el motivo de elegir OpenFreeMap. El modo satélite no cambia.
- **Servidor de teselas en producción:** ver la decisión 4.
- **Rendimiento en móvil:** según el código del paquete, cada marcador se vuelve a pintar a cada movimiento del mapa. Está sin medir. Antes de quitar MapLibre se prueba con 100 paradas en móvil simulado, y si va mal se usa `MarkerCluster` o se anota como hueco.
- **Caché:** la regla `map-tiles` de `vite.config.ts` no cubre `tile.openstreetmap.org` ni `server.arcgisonline.com`. Las teselas irían a la caché general de imágenes y la llenarían, así que se amplía la regla.
- **Atribución:** hoy está desactivada (`attributionControl={false}`). `TileMap` la muestra, como piden los proveedores.
- **Vista inicial:** `TileMap` arranca en España si no se le indica otra, así que siempre se le pasa `defaultView` o `bounds`.

Al terminar, `CLAUDE.md` deja de citar los mapas como excepción a usar el paquete.

### La única excepción

**Cámara del móvil:** el `<input capture>` de `DeliveryProofModal`, porque `FileDropzone` no tiene `capture`. Se anota como hueco del paquete.

El resto de elementos crudos desaparece:

- **Controles sobre el mapa:** los de `BaseMap` y `MapSearchBox` se van con esos ficheros, y los de `DriverApp` pasan a `MapButton`.
- **Filas de `DriverApp` (líneas 665 y 904):** pasan a `ListItem`, siempre que el área táctil llegue al tamaño del botón actual. Si no llega, se anota como hueco.
- **Cabecera desplegable del mapa en `DriverApp` (línea 1230):** pasa a `Accordion`.
- **`<table>` de `StagingAreasTab`:** es HTML para imprimir dentro de un texto y se va con los PDF de la fase 3.

Esto es solo para logística. No es el barrido general de colores de toda la web.

## Fases

Cada fase se puede entregar sola. Tamaño relativo: S, M, L.

### Fase 0. Red de seguridad (M)
Pruebas del flujo actual antes de tocarlo: albarán, preparación, despacho, ruta, entrega, aplazar, devolver y recoger. Sin esto, rehacer el núcleo es a ciegas.

### Fase 1. Riesgos urgentes (S)
No depende del resto y se puede publicar ya.
- Token aparte para el conductor o tracker. El enlace del cliente queda de solo lectura y los correos ya enviados siguen funcionando.
- No se borran rutas con actividad ni envíos con historial: se archivan.
- Validar que quien marca una parada opera esa ruta, y cerrar `/shipments/:id/notify`, que es de pruebas.
- Índice global de tokens para no recorrer todas las empresas.

### Fase 2. Núcleo: un solo estado (L)
- `core/logistics/shipmentLifecycle.ts`: transiciones permitidas en un sitio, puro y probado.
- Un único estado de envío. Migración que unifica las dos columnas con una tabla de equivalencias, y `status` se sigue escribiendo hasta retirarlo.
- Acciones en lugar de `PATCH status`: despachar, entregar, aplazar, incidencia, devolver, recibir. Cada una en una transacción, que incluye parada, envío y paquetes.
- Reintento real de aplazados e incidencias, con parada nueva y su historial.
- Paquetes que siguen a su envío.
- `api/logistics.ts` partido en shipments, routes, prep, staging, fleet y tracking, con la lógica fuera de las rutas.

### Fase 3. Almacén y documentos (M)
- Falta en picking: corrige el albarán y devuelve el stock, o deja un pendiente visible (decisión 2).
- Recogida de devolución con líneas.
- Etiqueta de bulto, packing list y hoja de ruta en PDF, con `@openfactu/pdf` y el visor actual.
- Numeración correlativa en rutas, paquetes y recepciones.

### Fase 4. Pantallas (L)
- **Mapas**, lo primero: todos a `TileMap`, incluidos los de `DriverApp` y el seguimiento público. Se puede entregar por separado y no depende de las fases 2 y 3.
- **Hoy**, como pantalla de entrada: por preparar, listo para ruta, en reparto, incidencias, retrasos y rutas abiertas de más.
- **Operación** (Preparación, Envíos, Rutas, Incidencias) separada de **Configuración** (Vehículos, Acopios, Plataformas, Transportistas).
- Listado con número, cliente, documento, entrada o salida, ruta, conductor y fecha prevista.
- Ficha con línea de tiempo legible, cliente, documento, paquetes, ruta y prueba de entrega. Los datos técnicos quedan solo para administradores.
- **Seguimiento público:** misma función y mismos enlaces, rehecho con `@openfactu/ui` y tokens. Comprobar que el tema de la empresa llega a esta página, que no tiene sesión.
- Lógica fuera de los TSX, todo con `@openfactu/ui` según la regla de arriba, traducido y con los términos de la empresa. Se quita BETA de lo que quede probado.

### Fase 5. Flota y conductor (M)
- Avisar o bloquear por capacidad, vehículo en mantenimiento y conductor con dos rutas el mismo día.
- Permiso propio de conductor: solo sus rutas y nada del centro logístico.
- `DriverApp` (1.510 líneas) partido en hooks y componentes, con `@openfactu/ui` y tokens. Mismo flujo, con botones igual de grandes para usarlo en la calle.
- Entrega en una sola llamada, con reintento si no hay cobertura.
- Ventanas horarias y hora estimada por parada.

### Fase 6. Transportistas reales (M, más cada integración)
- Conectar `ICarrierAdapter` al despacho: crear envío, número de seguimiento real, etiqueta y consulta de estado.
- El modo manual deja de inventar números: los escribe el usuario.
- Cada transportista va en un plugin, sin nombres de empresas ni de países en el núcleo.

### Fase 7. Informes y avisos (S–M)
Entregas a tiempo, incidencias por causa, reparto por conductor y correos en el idioma del destinatario. Opcional: cobro contra reembolso y avisos por los canales de Mensajería.

## Decisiones que necesito

1. **¿Flota propia antes que transportistas?** Propongo que sí: todos tus envíos son "propios". La fase 6 quedaría al final.
2. **¿Cuándo sale el stock?** Hoy sale al crear el albarán, antes de preparar.
   - *Propongo mantenerlo por ahora:* una falta corrige el albarán y devuelve el stock.
   - *Alternativa más correcta y mucho más grande:* pedido, preparación y, al final, albarán. Afecta a ventas y a contabilidad.
3. **Acopios y Plataformas: ¿siguen?** Propongo mantenerlos dentro de Configuración, sin mejoras nuevas, salvo que los uses a diario.
4. **¿Qué servidor de teselas en producción?** Los estilos de `TileMap` salen del servidor público de OpenStreetMap, y el propio paquete dice que para producción uses tu proveedor. Propongo dejar la dirección configurable y usar OpenStreetMap hasta que haya uso real. Contratar un proveedor se decide antes de abrirlo a clientes.

## Riesgos

- **Migración de estados:** es la parte delicada. Se prueba sobre una copia y se comprueba que el seguimiento público dé lo mismo antes y después.
- **Base real:** si el servidor de desarrollo está arrancado, aplica una migración en cuanto se guarda el fichero. Hay que pararlo antes de guardar la de la fase 2.
- **Webhooks y plugins:** los eventos `shipment.*` no cambian de nombre, y lo que cambie se documenta.
- **`@openfactu/pdf`:** las plantillas nuevas de la fase 3 dependen de publicar el paquete, igual que la versión 0.4.0 pendiente.

## Cómo se comprueba cada fase

Pruebas de servidor, recorrido real en navegador sobre una copia de la base, y app del conductor y seguimiento público en móvil simulado. El móvil real necesita una prueba tuya antes de quitar BETA.

En cada fase que toque pantallas:
- Ningún `<button>`, `<input>`, `<select>`, `<textarea>` ni `<table>` crudo fuera de las excepciones de la regla.
- Ninguna clase de la paleta fija en los ficheros rehechos, salvo decoración revisada y anotada.
- Se ven bien con un tema que no sea azul y en modo oscuro, incluido el seguimiento público.

En el cambio de mapas:
- Colocar y mover el destino, planificar una ruta, conductor con 100 paradas y seguimiento público, en satélite y en mapa, y en móvil simulado.
- Comparar con el mapa actual, en la misma dirección, que se distinguen calles y portales.
- Sin `maplibre-gl` ni `react-map-gl` en el código ni en `apps/web/package.json`.
- Arrastrar y pellizcar en un móvil real necesita una prueba tuya.
