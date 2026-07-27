# Despliegue del módulo Website (dominios y TLS)

El módulo Website sirve las webs públicas de los tenants por tres vías. La
resolución petición → tenant la hace el server con la tabla `public."WebsiteHost"`
(una query indexada por slug/hostname); este documento cubre la infraestructura
externa (DNS y certificados) necesaria para las vías 2 y 3.

## 1. Slug en el path (activa por defecto)

`https://<host-del-erp>/site/<slug>` funciona sin ninguna configuración extra:
mismo dominio y certificado que el ERP. Es la URL que la UI enseña en
Website → Ajustes.

## 2. Subdominio por tenant (`acme.webs.example.com`)

1. **DNS**: un registro wildcard apuntando al servidor:
   `*.webs.example.com  A  <IP del servidor>` (o CNAME al host del ERP).
2. **TLS**: certificado wildcard `*.webs.example.com` en el reverse proxy
   (una vez, no por tenant). Con Caddy:

   ```caddyfile
   *.webs.example.com {
     tls { dns <tu-proveedor-dns> ... }   # wildcard vía DNS-01
     reverse_proxy localhost:3000
   }
   ```

3. **Alta**: el admin del tenant añade el subdominio en Website → Ajustes →
   Dominios (kind `subdomain`, queda activo al instante: `verified` es true
   porque el wildcard es nuestro).

El `publicSiteHostMiddleware` del server hace el resto: si el `Host` entrante
está en `WebsiteHost`, sirve la web del site en la raíz del dominio; cualquier
otro host (incluido el del ERP) pasa de largo.

## 3. Dominio propio del cliente (`www.acme.com`)

1. El admin lo añade en Website → Ajustes → Dominios (kind `domain`). Queda
   **pendiente de verificación** (`verified = false`) y el server NO lo sirve
   hasta verificarlo.
2. El cliente apunta su DNS al servidor (`A`/`CNAME`).
3. **Verificación** (pendiente de automatizar; hoy manual): comprobar la
   titularidad (p.ej. TXT `_keirost-verify.<dominio>` con un token) y marcar
   `verified = true` en `public."WebsiteHost"`.
4. **TLS por dominio**: la opción recomendada es Caddy con _on-demand TLS_,
   que emite el certificado de cada dominio en el primer acceso y solo si
   nosotros lo autorizamos:

   ```caddyfile
   {
     on_demand_tls {
       ask http://localhost:3000/site-hosts/check
     }
   }

   https:// {
     tls { on_demand }
     reverse_proxy localhost:3000
   }
   ```

   El endpoint `ask` (`GET /site-hosts/check?domain=<host>`) debe responder
   200 solo si el host existe en `WebsiteHost` con `verified = true`
   (pendiente de implementar: es una consulta a la misma tabla, ~10 líneas).

## Notas

- La caché de resolución por Host es en memoria con TTL 60 s: tras verificar
  un dominio puede tardar hasta un minuto en servirse (o reiniciar el server).
- La caché de HTML renderizado es por proceso y se invalida al publicar; si
  algún día hay múltiples instancias del server detrás del proxy, añadir TTL
  o invalidación compartida (comentado en `core/website/renderSite.ts`).
- El formulario de contacto usa el header `Referer` para volver a la página:
  no configurar el proxy con `Referrer-Policy: no-referrer` para estas rutas.
