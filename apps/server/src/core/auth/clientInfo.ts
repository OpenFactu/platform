/** Lo que se sabe del cliente que hace una petición: red, navegador y app de escritorio. */
export interface ClientInfo {
  ip: string;
  userAgent: string;
  clientKind: 'web' | 'desktop';
  clientVersion?: string;
  deviceId?: string;
}

function header(req: any, name: string): string {
  const v = req?.headers?.[name];
  return String(Array.isArray(v) ? v[0] : (v ?? '')).trim();
}

export function clientInfo(req: any): ClientInfo {
  const ip = String(req?.ip || req?.socket?.remoteAddress || '');
  const userAgent = header(req, 'user-agent').slice(0, 300);

  const kind = header(req, 'x-keirost-client');
  const desktop = /^desktop\/(.+)$/.exec(kind);
  const info: ClientInfo = { ip, userAgent, clientKind: desktop ? 'desktop' : 'web' };
  if (desktop) info.clientVersion = desktop[1].slice(0, 40);

  const device = header(req, 'x-keirost-device').slice(0, 100);
  if (device && /^[A-Za-z0-9_-]+$/.test(device)) info.deviceId = device;
  return info;
}
