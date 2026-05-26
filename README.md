<div align="center">

# Keirost ERP

> **Keirost** es un ERP open-source construido sobre el motor **OpenFactu**.
>
> - **Keirost** → la experiencia de producto (marca, UI, módulos operativos).
> - **OpenFactu** → el núcleo técnico: runtime, plugin SDK, librerías `@openfactu/*`, CLI de despliegue. Es el framework sobre el que puedes construir tu propio ERP si no quieres la marca Keirost.

Multi-tenant, extensible con plugins, desplegable con Docker en Windows, macOS y Linux.

## Instalación rápida

```bash
# 1. Instalar el CLI
npm i -g @openfactu/cli

# 2. Descargar Keirost (el CLI te deja elegir versión)
openfactu install

# 3. Desplegar
cd keirost
openfactu deploy
```

El CLI descarga la release, levanta Docker y configura todo.

## Qué incluye

| Área               | Detalles                                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| **Facturación**    | Pedidos, albaranes, facturas (ventas y compras), series, periodos                                                            |
| **Inventario**     | Almacenes, zonas, lotes, series, stock por ubicación                                                                         |
| **Partners**       | Clientes y proveedores con grupos, direcciones, tarifas                                                                      |
| **Impuestos**      | IVA configurable por grupo fiscal, desglose por factura                                                                      |
| **Plantillas PDF** | Documentos personalizables con HTML+Handlebars y editor visual (drag & drop)                                                 |
| **Trazabilidad**   | Lotes/series embebidos en PDFs + QR de verificación + Code-128 + hash SHA-256 del documento                                  |
| **Escáner**        | Soporte HID (USB/Bluetooth) y cámara (ZXing) — lee código → busca artículo → añade línea                                     |
| **Plugins**        | Extensiones activables por empresa, con SDK (`@openfactu/plugin-sdk`)                                                        |
| **API REST**       | CRUD completo + FactuAPI (transacciones atómicas, IDs pre-asignados)                                                         |
| **Temas**          | 9 presets visuales (Keirost Classic, Midnight, Carbon, Deep Ocean, Forest, Plum, Nebula…). Plugins pueden aportar los suyos. |
| **Mobile**         | UI adaptable con drawer + bottom nav + botón central para escáner                                                            |
| **Audit log**      | Registro inmutable de cambios por tenant                                                                                     |

## Stack tecnológico

| Capa           | Tecnología                                |
| -------------- | ----------------------------------------- |
| Frontend       | React 19, Tailwind CSS, Vite              |
| Backend        | Express, TypeScript, Drizzle ORM          |
| Base de datos  | PostgreSQL 15 (schema por tenant)         |
| PDF            | Puppeteer + Handlebars (`@openfactu/pdf`) |
| Escáner cámara | `@zxing/browser`                          |
| Infra          | Docker, Docker Compose                    |
| CLI            | Commander.js, Inquirer                    |

## Arquitectura: Keirost sobre OpenFactu

```
┌───────────────────────────────────────────────┐
│  Keirost ERP — aplicación visible             │
│  (marca, módulos operativos, plantillas PDF)  │
└───────────────────────────────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────────┐
│  OpenFactu — motor open-source                │
│  @openfactu/ui      componentes compartidos   │
│  @openfactu/common  hooks + modelos           │
│  @openfactu/pdf     renderer PDF + plantillas │
│  @openfactu/plugin-sdk  SDK de extensiones    │
│  @openfactu/cli     instalador + despliegue   │
└───────────────────────────────────────────────┘
```

Esto permite:

- Consumir OpenFactu directamente como framework para levantar tu propio ERP con otra marca.
- Plugins portables entre instancias Keirost y forks basados en OpenFactu.
- Publicar piezas técnicas de forma independiente (bump semver de `@openfactu/pdf` sin tocar Keirost).

## Estructura del monorepo

```
apps/
  server/          API REST + lógica de negocio
  web/             Frontend React (Keirost)

plugins/           Plugins instalados localmente

# Paquetes npm externos (repos propios en la org OpenFactu):
#   @openfactu/ui
#   @openfactu/common
#   @openfactu/pdf
#   @openfactu/plugin-sdk
#   @openfactu/cli
#   @openfactu/sdk
```

## CLI

```bash
npm i -g @openfactu/cli
```

### Despliegue y configuración

| Comando                   | Descripción                                    |
| ------------------------- | ---------------------------------------------- |
| `openfactu install`       | Descarga e instala (elige release de GitHub)   |
| `openfactu deploy`        | Configura acceso externo (LAN / internet)      |
| `openfactu deploy:status` | Estado de los contenedores                     |
| `openfactu setup`         | Configuración inicial de BD                    |
| `openfactu update`        | Actualiza a una nueva versión sin perder datos |
| `openfactu version`       | Muestra las versiones del sistema              |

### Migraciones

| Comando                    | Descripción                      |
| -------------------------- | -------------------------------- |
| `openfactu migrate`        | Ejecuta migraciones pendientes   |
| `openfactu migrate:status` | Estado de migraciones por tenant |

### Tenants y plugins

| Comando                   | Descripción                           |
| ------------------------- | ------------------------------------- |
| `openfactu tenant list`   | Lista las empresas registradas        |
| `openfactu tenant create` | Crea una empresa nueva                |
| `openfactu plugin list`   | Lista plugins y su estado por empresa |

## Plugins

Los plugins se colocan en la carpeta `/plugins/` y se activan o desactivan por empresa desde la interfaz web (**Gestor de Plugins**) o mediante la API:

```
POST /api/plugins/{pluginId}/activate
POST /api/plugins/{pluginId}/deactivate
GET  /api/plugins/available
```

### Crear tu primer plugin

```typescript
// plugins/mi-plugin/index.ts
export const init = async ({ hooks, migration, factuApi }) => {
  // Añadir un campo personalizado a la BD
  await migration.addCustomField({
    pluginId: 'mi-plugin',
    tableName: 'BusinessPartner',
    fieldName: 'loyalty_points',
    type: 'INTEGER',
    label: 'Puntos de fidelidad',
  });

  // Registrar un hook antes de crear una factura
  hooks.register('salesInvoice.beforeCreate', async (ctx) => {
    // Tu lógica aquí
  });
};
```

Los plugins pueden declarar migraciones propias, registrar hooks en el ciclo de vida de los documentos, añadir campos personalizados y exponer sus propios endpoints REST, todo ello sin modificar el núcleo de OpenFactu.

Plugins también pueden aportar módulos/sub-tabs, temas visuales y widgets de dashboard vía el manifest `ui`.

## Desarrollo

```bash
git clone https://github.com/AngelAcedo12/OpenFactu.git
cd OpenFactu
npm install
npm run dev:all
```

Leva PostgreSQL en Docker y arranca server + web en modo desarrollo.

### Trabajar en los paquetes `@openfactu/*`

Los paquetes externos viven en repos propios clonados junto al monorepo (p.ej. `../openfactu_package/pdf`). Para desarrollar sin publicar cada vez:

```bash
rm -rf node_modules/@openfactu/pdf
ln -s /ruta/a/openfactu_package/pdf node_modules/@openfactu/pdf
```

El server ya vigila cambios en `node_modules/@openfactu/pdf/dist` vía `ts-node-dev --watch`.

### Flujo de trabajo habitual

Crear un plugin mínimo:

```typescript
// plugins/mi-plugin/index.ts
export const init = async ({ hooks, migration, factuApi }) => {
  await migration.addCustomField({
    pluginId: 'mi-plugin',
    tableName: 'BusinessPartner',
    fieldName: 'loyalty_points',
    type: 'INTEGER',
    label: 'Puntos de fidelidad',
  });

  hooks.register('salesInvoice.beforeCreate', async (ctx) => {
    // tu lógica
  });
};
```

## Licencia

Distribuido bajo la licencia **MIT**. Consulta el archivo [LICENSE](LICENSE) para más información.
