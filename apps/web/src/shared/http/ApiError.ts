/**
 * Error normalizado de la API. Toda respuesta non-ok del ApiClient se lanza
 * como ApiError, con el status HTTP y el body parseado (json o texto) para
 * que la UI pueda decidir el mensaje del toast.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Extrae un mensaje legible del body de error del servidor (formato {error} o {message}). */
export function extractErrorMessage(status: number, body: unknown): string {
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    if (typeof b.error === 'string' && b.error) return b.error;
    if (typeof b.message === 'string' && b.message) return b.message;
  }
  if (typeof body === 'string' && body.trim()) return body.trim().slice(0, 300);
  return `Error HTTP ${status}`;
}
