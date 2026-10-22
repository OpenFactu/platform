export type PunchKind = 'in' | 'out' | 'break_start' | 'break_end';
export type WorkState = 'closed' | 'working' | 'on_break';
export type PunchMethod = 'account' | 'pin' | 'qr' | 'rfid';
export type DeviceMode = 'paired' | 'standalone';
export interface Terminal {
  tenantId: string;
  actorKey: string;
  kind: 'kiosk' | 'device';
  row: any;
}
export interface PunchResult {
  entry: any;
  state: WorkState;
  allowedActions: PunchKind[];
  replayed: boolean;
}
export class TimeclockError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public retryable = false,
  ) {
    super(message);
  }
}
export function fail(status: number, code: string, message: string): never {
  throw new TimeclockError(status, code, message);
}
export function requestId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  )
    fail(400, 'INVALID_INPUT', 'Identificador de petición inválido.');
  return value;
}
