# Keirost neutral en normativa: España como primer plugin

## Contexto

Visión de producto, sin un país concreto a la vista: aplicar cualquier legislación (española, europea, china...) tiene que ser cuestión de instalar un plugin. Hoy España está dentro del núcleo (PGC e `IVA21` sembrados, IRPF/SS como columnas, Libro de IVA) y los plugins no pueden influir en impuestos, plan contable, informes legales ni nómina.

**Resultado de esta entrega:** núcleo neutro + España extraída a un plugin en su propio repositorio + formatos PDF estándar neutros. Para las empresas españolas actuales los cálculos, asientos y datos no cambian; **lo único visible es el nuevo aspecto de los PDF de fábrica** y la corrección del fallo de retenciones.

### Decidido por ti
- Lo escribirán todos (asesores, integradores, equipo, comunidad): hace falta una vía sin código y otra con código.
- España sale del núcleo a plugin. Alcance: **solo España y núcleo; la nómina entra**.
- Se puede mejorar el sistema de plugins todo lo necesario.
- **Un solo repositorio** en `D:\dev`, con la estructura de `OpenFactu/openfactu-plugin-template`, **solo local** (sin GitHub).
- **Nuevos formatos PDF estándar neutros:** simples, sin colores ni adornos.

### Decidido por mí (corrígelo si no encaja)
- Nombre `D:\dev\openfactu-plugin-es` y carpeta añadida `data/` para los datos.
- Una factura emitida guarda sus impuestos calculados y la versión de la norma; una norma nueva nunca la cambia.
- La columna `nif` y su API no se renombran: el coste no compensa y queda como deuda anotada. Se presenta como `taxIdLabel` del país.
- Las columnas `irpfAmount`, `ssEmployee`, `ssEmployer` se retiran en dos pasos, no de golpe.
- Sin plugin instalado, las facturas siguen funcionando con los datos de la empresa; lo que desaparece son reglas e informes legales, con aviso claro.
- Un paquete de prueba **solo en tests** (impuesto compuesto, plan contable no español) para demostrar la neutralidad. No es China ni UE y no se distribuye.
- El formato neutro sustituye al de fábrica **en todas las empresas**: `resyncDefaultTemplates` lo aplicará al reiniciar en las que usen la plantilla de fábrica. Las plantillas personalizadas no se tocan.
- El logo de la empresa se mantiene, pero en escala de grises. El color de un PDF se elige en su plantilla; `company_invoice_color` no lo leía ningún PDF y se retiró de Ajustes.
- Los plugins aportan terminología y textos legales, no diseño: el formato es el mismo en todos los países.
- El trabajo va en rama propia desde un worktree, porque `feature/messaging` tiene muchos cambios sin commitear que tocan `server.ts` y `admin.ts`.

### Fuera de alcance
Paquetes UE/China, conector VeriFactu/SII real (sí queda el punto de extensión), Marketplace, renombrar `nif`, i18n de datos sembrados neutros, y revisión legal: las reglas españolas se trasladan tal como están, no se certifican.

## Diseño: tres capas para tres tipos de autor

| Capa | Autor | Qué aporta |
|---|---|---|
| 1. Datos | Asesor, comunidad | JSON en `data/`: impuestos con vigencias, plan contable, mapeos, conceptos de nómina, terminología ("IVA", "NIF"), textos legales. Validado con `npm run validate`. |
| 2. Código ligero | Integrador | Reglas de impuestos, validador de identificación fiscal, cálculo de nómina, informes legales. |
| 3. Integración | Equipo experto | Conector fiscal: firma, cadena de hashes y envío, usando los campos `fiscal*` que ya existen. |

Nueva superficie en `PluginContext` (`apps/server/src/plugins/types.ts`, construida en `buildPluginContext` de `loader.ts`):

```ts
localization.register(pack)              // capa 1
taxes.registerResolver(fn)               // devuelve componentes de impuesto por línea
taxIds.registerValidator(country, fn)
payroll.registerCalculator(fn)
reports.register(def)
fiscal.registerConnector(connector)      // onPost / onCancel
documents.onBeforePost / onAfterPost / onBeforeCancel / onAfterCancel
```

Todo respeta `TenantPluginCache` (activación por empresa) y se limpia en `reloadPlugin`, igual que `HookManager` y `AiToolRegistry`.

## Fases

### 0. Red de seguridad, antes de tocar nada
- Tests "golden" que congelan el comportamiento actual para España: factura con cada tipo, descuento y retención; asientos de venta, compra, cobro y nómina; Libro de IVA; nómina con IRPF/SS.
- Hay `npm test` en servidor (`core/**/__tests__`), aunque `CLAUDE.md` diga lo contrario; se corrige esa frase.
- Confirmar con test el fallo de retenciones: `total` descuenta la retención pero `createFromSalesInvoice`/`createFromPurchaseInvoice` no la asientan, así que el asiento parece descuadrar y el `catch` de `salesInvoices.ts:277` lo oculta.

### 1. Sistema de plugins
- `loader.ts`: resolver rutas con `fs.realpathSync`. Con un junction, `require.cache` usa la ruta real y la limpieza de `reloadPlugin` (`startsWith(resolvedPath)`) no acertaría.
- Comprobar si en producción se puede cargar un `index.ts`; si no, el plugin compila a `index.js` en la raíz, que el loader ya admite.
- Eventos de ciclo de vida al activar o desactivar para una empresa (`api/plugins.ts`).
- Hooks de asentar y cancelar: mover la lógica de asentar de `salesInvoices.ts`/`purchaseInvoices.ts` a `DocumentEngine`, sin añadir otra rama por tipo.
- `D:\dev\plugin-sdk` a 0.5.0: tipos nuevos, tipos que ya faltan (`documents.register`, `carriers`, `DocType` abierto) y validador de paquetes.
- `scripts/link-local.mjs`: añadir `plugins/openfactu-plugin-es` y `plugin-sdk`.

### 2. Motor de impuestos neutro
- Nuevo `core/tax/TaxEngine.ts`. `computeLineAmounts` (`DocumentEngine.ts:487`) es síncrono: los impuestos se resuelven antes, por documento, y se le pasan calculados.
- **Resolver por defecto:** un componente con el `rate` del `TaxGroup`, sin cambio de redondeo, para que los golden no varíen.
- Migración de tenant: tabla genérica `DocumentLineTax` (documento, línea, código, categoría, base, tipo, importe, `accountKind`, `isWithholding`, paquete y versión). `taxRate`/`taxAmount` de línea siguen como suma, por compatibilidad.
- `TaxGroup`: añadir `category`, `validFrom`, `validTo`, `packId`.

### 3. Contabilidad neutra
- `JournalEngine`: una línea de asiento por componente de impuesto, resuelta por `accountKind`. Kinds neutros (`tax_output`, `tax_input`) copiando los mapeos de `sales_vat_output`/`purchase_vat_input`.
- **Corregir el fallo de retenciones** con cuentas propias. Solo afecta a asientos nuevos; no se regeneran los antiguos.
- Quitar el `'EUR'` fijo (usar la moneda base de la empresa) y los textos "IVA".
- `seedAccountingDefaults` pasa a aplicar el plan contable del paquete activo.

### 4. Paquetes de localización
- `core/localization/`: `LocalizationRegistry` y `LocalizationInstaller` (idempotente, con versión guardada en una tabla de tenant).
- `seedDefaults.ts`: quitar `TAX_GROUPS`. Se ejecuta en cada arranque para todas las empresas, así que hoy recrearía los `IVA*` borrados.
- `GET /api/localization/active`: terminología para la web.
- Alta de empresa: `tenants.ts:128` no debe asumir `'ES'`; se elige país y, si hay paquete, se ofrece activarlo.

### 5. Nómina neutra
- `PayrollConcept.category` (`income_tax`, `social_employee`, `social_employer`), rellenada una vez con los regex actuales de `payrolls.ts:29`, que luego se eliminan.
- Paso 1: columnas genéricas `Payroll.incomeTaxTotal`, `socialEmployeeTotal`, `socialEmployerTotal`, con relleno y escritura doble. Conceptos `taxableIncomeTax`/`taxableSocial`.
- Paso 2 (migración final, ya verificado): retirar las columnas antiguas.
- Actualizar `createFromPayroll` y mapeos (`payroll_income_tax`...), nómina en PDF (`reports.ts:1034`), `Payrolls.tsx`, `LaborCost.tsx`, `ReportLaborCost.tsx`, `hr/domain/payroll.ts`.

### 6. Informes y web
- `reports.register`: catálogo en el módulo de informes, con ruta bajo `/api/reports/plugin/...` declarada mediante `mountApi` y permiso propio en `permissionCatalog.ts`.
- El núcleo conserva un "Resumen de impuestos" genérico; el Libro de IVA (`reports.ts:530`) se va al plugin.
- Web: `IVA`/`IRPF` fijos pasan a terminología del paquete (`DocumentTotalsBlock`, `documentLineCells`).
- También: importador (`dataimport/objects`), herramientas de IA (`erpEntityTools.ts`), `FiscalSettingsTab` (conector fiscal activo).

### 6b. Formatos PDF neutros (`D:\dev\pdf`, a 0.4.0)
- Reescribir `src/defaultTemplates.ts` con una base común para todos los tipos de documento, incluidos los genéricos de plugins.
- Estilo: A4, texto negro sobre blanco, una sola familia tipográfica, jerarquía solo por tamaño y peso, líneas finas únicamente para separar. Sin fondos, degradados, sombras ni color de acento. Tiene que seguir siendo legible impreso en blanco y negro.
- Contenido: empresa, interlocutor, datos del documento, líneas, desglose por componente de impuesto (`DocumentLineTax`), totales, vencimientos, referencia fiscal y textos legales.
- `src/labels.ts`: `IVA`, `NIF`, `IRPF` salen de la terminología del paquete en el payload (`PdfPayloadBuilder.ts`), con términos genéricos si no hay paquete ("Impuesto", "Identificación fiscal").
- Aplicar el mismo estilo a la nómina y a los informes legales (`ReportRenderer.ts`). Los demás informes internos no se tocan.
- El diseñador de plantillas (`visualTemplateBuilder`, `visualOptionsSchema`) sigue disponible para quien quiera color; solo cambia su punto de partida si usa estos valores.

### 7. Repositorio `D:\dev\openfactu-plugin-es`
Clonar la plantilla, quitar su `.git`, y `git init` local:

```
openfactu-plugin-es/
├── index.ts         ← init(): registra paquete, resolver, validador, nómina e informes
├── manifest.json
├── README.md        ← corrige `npm install plugin-sdk` por `@openfactu/plugin-sdk`
├── .gitignore
├── data/            ← impuestos, pgc, mapeos, conceptos, terminología (JSON)
├── src/             ← nif, nómina, libro de IVA
└── tests/
```

El SDK se consume como `file:../plugin-sdk` hasta que se publique. Se copian de `seedDefaults` y `seedAccountingDefaults` los valores exactos, sin retocar ninguno.

### 8. Migración de empresas existentes
Paso de arranque idempotente, después de cargar plugins y de `syncAllTenants`:
- Empresas con país ES o con grupos `IVA*`: crear `TenantPlugin` activo y etiquetar sus datos con `packId`.
- No se toca ningún documento emitido.
- Si el plugin no está en el servidor: aviso visible en log y en ajustes; las facturas siguen funcionando.
- **Orden de despliegue:** primero el plugin en `plugins/`, luego el servidor. Se documenta.

### 9. Guardia y documentación
- `scripts/check-neutral-core`: falla si aparecen términos españoles (`IVA`, `IRPF`, `PGC`, `Seguridad Social`...) en código del núcleo, con lista de excepciones explícita (migraciones antiguas, `nif`, `geo.json`).
- `docs/localizacion-plugins.md`: guía por capas, una ruta para quien no programa.
- Actualizar `CLAUDE.md`. Copiar este diseño a `docs/superpowers/specs/2026-11-02-localizacion-plugins-design.md`.

## Verificación
1. Golden de la fase 0 idénticos con el plugin activo. La única diferencia admitida es la corrección de retenciones.
2. Paquete de prueba con impuesto compuesto y plan no español: factura, asiento e informe correctos sin tocar el núcleo.
3. Plugin desactivado: facturas funcionan, Libro de IVA desaparece, sin errores; reactivar no duplica datos.
4. Copia de una base real con empresas existentes: migración idempotente (dos arranques, mismo resultado) y documentos emitidos sin cambios.
5. `npm test`, `tsc` en server y web, `check-neutral-core`, `npm run validate` en el plugin.
6. Humo en navegador: alta de empresa, crear y asentar factura, nómina, Libro de IVA, usuario sin permiso del informe.
7. Generar el PDF de cada tipo de documento, con y sin plugin, y revisarlos visualmente: sin color salvo el del propio contenido, con varias líneas y varios impuestos, y con paginación correcta. Una plantilla personalizada queda idéntica tras reiniciar.

## Riesgos
- **Cambio de cálculo sin querer:** cubierto por los golden, antes de refactorizar.
- **Plugin ausente en un servidor:** comportamiento degradado y avisado, sin caída.
- **Junction en local vs. Docker:** `docker-compose.yml` monta `./plugins`, donde un junction de Windows no sirve; en despliegue el repo se clona dentro.
- **PDF de empresas actuales:** cambian de aspecto al primer reinicio; hay que avisarles. Los PDF ya archivados o enviados no se regeneran solos, pero una nueva impresión de una factura antigua saldrá con el formato neutro.
- **Paquete `pdf` sin publicar:** 0.3.0 sigue pendiente de publicar según las notas; 0.4.0 funciona por junction en local y hay que publicarlo antes de desplegar.
- **Tamaño:** cada fase se puede integrar por separado; la 5 y la 8 son las más delicadas por tocar datos.
