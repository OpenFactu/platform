// PWA completa (manifest + service worker) en el servidor de desarrollo.
//
// Lo importa `vite.https.config.ts` ANTES de la config base: `vite.config.ts`
// lee `VITE_PWA_DEV` al cargarse, y los imports se evalúan en orden. Ese
// servidor es el de las pruebas desde el móvil (origen seguro, túnel), que es
// justo donde hace falta poder instalar la app.
//
// Ojo: con el service worker activo, una versión nueva no entra hasta cerrar
// todas las pestañas de la app (ver el comentario de `devOptions`).
process.env.VITE_PWA_DEV ??= 'true';

export {};
