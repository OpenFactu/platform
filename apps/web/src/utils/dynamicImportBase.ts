/**
 * Base URL absoluta para `import()` dinámicos de módulos ESM servidos por el
 * server (plugins, widgets de código). Tiene que ser absoluta porque Vite
 * intercepta los imports dinámicos relativos en dev — solo puede proxiar
 * `fetch()` normal, no `import()`. Deriva host/protocolo del propio navegador
 * (en vez de hardcodear `localhost`) para que funcione también accediendo por
 * IP de LAN u otro host, asumiendo que el server vive en el puerto 3000 del
 * mismo host que sirve la web.
 */
export const getDynamicImportApiBase = (): string => {
  // La instalación nativa de Windows sirve la web con un proxy propio que
  // publica aquí el origen efectivo. Manda sobre el resto porque es lo único
  // que conoce el puerto real: el del `.env` se decide al instalar, y la app
  // de escritorio usa un puerto local que cambia en cada arranque.
  const runtimeBase = (window as { __KEIROST_API_BASE__?: string }).__KEIROST_API_BASE__;
  if (runtimeBase) return runtimeBase.replace(/\/$/, '');

  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  // En producción nginx (y Caddy delante) sirve la API en el mismo origen; ir al
  // puerto 3000 fallaría: está cerrado hacia fuera y sería contenido mixto en HTTPS.
  if (import.meta.env.PROD) return window.location.origin;
  // En dev el server (apps/server) no tiene TLS — siempre habla HTTP plano en
  // el puerto 3000, aunque la web se sirva por HTTPS (modo
  // `npm run dev:web:https`). No copiar `window.location.protocol` acá.
  return `http://${window.location.hostname}:3000`;
};
