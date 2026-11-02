# Normativa de un país como plugin

Keirost no conoce ningún país. Impuestos, plan contable, nómina, informes legales y envíos a la administración llegan por plugin, y cada empresa activa los que le aplican. El de España vive en su propio repositorio (`openfactu-plugin-es`) y sirve de ejemplo completo.

Hay tres niveles. Empieza por el primero y sube solo si te hace falta.

| Nivel | Quién | Qué permite |
|---|---|---|
| 1. Datos | Cualquiera, sin programar | Tipos de impuesto, plan contable, conceptos de nómina, términos, textos legales |
| 2. Código ligero | Quien programa un poco | Reglas de impuestos, comprobar la identificación fiscal, cálculo de nómina, informes |
| 3. Integración | Equipo con experiencia | Firma, encadenado y envío a la administración |

## Nivel 1: solo datos

Copia la estructura de [openfactu-plugin-template](https://github.com/OpenFactu/openfactu-plugin-template) y añade una carpeta `data/`. No hace falta `index.ts`: un plugin solo de datos es válido.

```
mi-pais/
├── manifest.json
└── data/
    ├── pack.json              ← obligatorio
    ├── taxes.json
    ├── accounts.json
    ├── account-mappings.json
    ├── payroll-concepts.json
    ├── document-types.json
    ├── terminology.json
    └── legal-texts.json
```

`pack.json` dice qué es y a qué países aplica:

```json
{ "id": "ejemplo", "name": "Ejemplo", "version": "1.0.0", "countries": ["XX"] }
```

`taxes.json` lleva un tipo por entrada. La vigencia es opcional:

```json
[{ "code": "GST5", "rate": 5, "category": "gst", "validFrom": "2026-01-01" }]
```

`terminology.json` dice cómo se llaman las cosas en cada idioma. Todo lo que no declares sigue siendo genérico ("Impuesto", "Identificación fiscal"):

```json
{ "es": { "tax": "GST", "taxId": "BN" }, "en": { "tax": "GST", "taxId": "Business number" } }
```

Claves disponibles: `tax`, `taxId`, `withholding`, `incomeTax`, `socialEmployee`, `socialEmployer`.

`account-mappings.json` asocia cada concepto contable a una cuenta de `accounts.json`. Conceptos: `sales_revenue`, `tax_output`, `customer_receivable`, `withholding_receivable`, `purchase_expense`, `tax_input`, `supplier_payable`, `withholding_payable`, `cash`, `bank`, `payroll_gross`, `payroll_income_tax`, `payroll_social_employee`, `payroll_social_employer`, `payroll_net`, `retained_earnings`, `result`.

En `payroll-concepts.json`, la `category` (`income_tax`, `social_employee`, `social_employer`) decide sobre qué base se calcula el concepto y en qué total va. Sin categoría, es una deducción más.

Antes de publicar, comprueba el paquete. Da los errores en lenguaje llano:

```bash
npx openfactu-validate-pack .
```

### Qué pasa al instalarlo

- Al activarlo en una empresa se añade lo que le falte. **Lo que la empresa ya tenga no se pisa.**
- Con la misma `version` no se vuelve a tocar nada, así que lo que una empresa borre no reaparece. Para publicar un cambio, sube la versión.
- El plan contable no se instala solo si la empresa aún no tiene contabilidad: generaría asientos que antes no existían. Se instala con "Configurar en 1 clic" en el plan contable.
- Una empresa cuyo país esté en `countries` recibe el paquete activado al darse de alta o al arrancar el servidor. Si alguien lo desactiva a propósito, no se reactiva.

## Nivel 2: código ligero

Añade un `index.ts` que exporte `init`. Instala `@openfactu/plugin-sdk` para tener los tipos. **No instales `drizzle-orm`**: usa los operadores de `context.db.ops`, porque los de otra copia no los reconoce el cliente.

```ts
import type { PluginContext } from '@openfactu/plugin-sdk';

export const init = async ({ taxes, taxIds, payroll, reports, db }: PluginContext) => {
  // Devuelve los impuestos de la línea, o null para dejar el cálculo estándar.
  taxes.registerResolver(({ partner, line }) => {
    if (partner?.countryCode !== 'XX') return null;
    return [
      { code: 'GST5', rate: 5 },
      { code: 'PST7', rate: 7, label: 'Provincial', accountKind: 'tax_provincial_output' },
    ];
  });

  // El formato básico ya lo comprueba el regex de Country.
  taxIds.registerValidator('XX', (value) => (value.endsWith('0') ? null : 'Dígito de control'));

  // Recibe el resultado estándar; devuelve null para dejarlo.
  payroll.registerCalculator(({ standard }) => standard);

  // Aparece en el catálogo de informes, con su PDF y bajo el permiso de libros fiscales.
  reports.register({
    id: 'libro',
    title: 'Libro fiscal',
    run: async ({ db: tenantDb, filters }) => ({ sections: [] }),
  });
};
```

Un componente de impuesto admite:

| Campo | Para qué |
|---|---|
| `rate` | Porcentaje |
| `base`, `amount` | Base o cuota explícitas (por defecto, sobre el neto de la línea) |
| `isWithholding` | Se resta del total en vez de sumarse |
| `accountKind` | Concepto contable al que va la cuota |
| `label` | Nombre propio en el PDF |
| `packId`, `packVersion` | Norma con la que se calculó |

Lo calculado se guarda en `DocumentLineTax`. **Una norma nueva nunca cambia un documento ya emitido.**

## Nivel 3: integración con la administración

```ts
fiscal.registerConnector({
  id: 'mi-administracion',
  name: 'Mi administración',
  onPost: async ({ document, db }) => ({ fiscalHash: '...', fiscalStatus: 'sent' }),
  onCancel: async ({ document }) => ({ fiscalStatus: 'cancelled' }),
});
```

`onPost` corre dentro de la transacción de asentar. **Si lanza un error, la factura se queda en borrador.** Lo que devuelva se guarda en los campos `fiscal*` de la factura.

También hay hooks de ciclo de vida: `documents.onBeforePost`, `onAfterPost`, `onBeforeCancel`, `onAfterCancel`, y `lifecycle.onActivate`, `onDeactivate`.

## Formatos PDF

Los documentos de fábrica salen en formato neutro: negro sobre blanco, sin adornos, igual en todos los países. Un plugin aporta términos y textos legales, no diseño. Quien quiera otro aspecto lo crea en el diseñador de plantillas, que sigue admitiendo colores.

## Desarrollo y despliegue

En desarrollo, `npm run link:local` enlaza `plugins/openfactu-plugin-es` al repositorio del plugin. Para otro plugin, añádelo a `PLUGIN_LINKS` en `scripts/link-local.mjs`.

El servidor compilado no carga TypeScript, así que un plugin con código tiene que compilar a `index.js` (`npm run build`). `data/` se lee en caliente y no necesita compilarse.

**Al desplegar, instala primero los plugins y luego actualiza el servidor.** Si falta el plugin de una empresa, sus facturas siguen funcionando con los datos que ya tiene, pero sin reglas ni informes legales: el log y los ajustes fiscales lo avisan.

## Mantener el núcleo neutro

```bash
npm run check:neutral --workspace=@openfactu/server
```

Falla si aparece normativa de un país en el código o en las traducciones. Las excepciones están en `apps/server/src/scripts/check-neutral-core.ts`, cada una con su motivo.

## Pendiente

- Retirar las columnas `irpfAmount`, `ssEmployee` y `ssEmployer` de `Payroll` y `taxableIrpf` y `taxableSs` de `PayrollConcept`, más las copias antiguas de `AccountMapping`. Se siguen escribiendo para poder volver atrás; se quitan en una migración cuando esto lleve un tiempo en producción.
- La columna `nif` de los interlocutores conserva su nombre: renombrarla no compensa el riesgo.
- `seedDocumentTypes.ts` aún contiene los tipos de documento de otros países (México, Chile, Colombia, Perú, Argentina), a la espera de sus paquetes.
- Valores por defecto de formularios (país, moneda) y el símbolo `€` escrito en algunas pantallas.
