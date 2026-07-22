/**
 * Convierte el valor de "Carpeta raíz" (campo de la UI, texto libre — un
 * nombre o una ruta tipo "Backups/Keirost") en segmentos a resolver/crear
 * por NOMBRE bajo la raíz del drive. Nunca se interpreta como un ID técnico
 * de Google Drive/OneDrive — pedir eso al usuario no es razonable, ya que
 * no hay forma sencilla de obtenerlo desde la propia interfaz de Drive.
 */
export function parseFolderPath(value?: string): string[] {
  return (value || '')
    .split('/')
    .map((s) => s.trim())
    .filter(Boolean);
}
