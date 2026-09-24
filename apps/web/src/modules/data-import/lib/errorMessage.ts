/**
 * Texto que se le enseña al usuario cuando una llamada falla.
 *
 * `apiClient` normaliza todo a `ApiError`, cuyo `message` ya viene del cuerpo
 * de la respuesta del servidor; el resto de casos (un fallo de red, algo que
 * se lanzó sin ser un Error) caen al texto por defecto.
 */
export function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
