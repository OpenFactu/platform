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
  const envUrl = import.meta.env.VITE_API_URL;
  if (envUrl) return envUrl;
  // El server (apps/server) no tiene TLS configurado — siempre habla HTTP
  // plano en el puerto 3000, aunque la web se sirva por HTTPS (modo
  // `npm run dev:web:https`). No copiar `window.location.protocol` acá.
  return `http://${window.location.hostname}:3000`;
};
