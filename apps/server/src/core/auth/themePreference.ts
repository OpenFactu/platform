/**
 * Tema personal del usuario (`GlobalUser.themePreset` / `themeMode`).
 *
 * El catálogo de presets vive en la web y los plugins pueden añadir los suyos,
 * así que aquí no se puede comprobar que el preset exista: solo que tiene forma
 * de id. La web trata un id que no conoce como si no hubiera preset.
 */
const PRESET_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

export type ThemePatch = { themePreset?: string | null; themeMode?: 'light' | 'dark' | null };

/** Saca del cuerpo los campos de tema que traiga; `null` o vacío los borra. Lanza si no valen. */
export function parseThemePatch(body: Record<string, unknown>): ThemePatch {
  const patch: ThemePatch = {};
  if ('themePreset' in body) {
    const value = body.themePreset;
    if (value === null || value === '') patch.themePreset = null;
    else if (typeof value === 'string' && PRESET_ID.test(value)) patch.themePreset = value;
    else throw new Error('Tema no válido');
  }
  if ('themeMode' in body) {
    const value = body.themeMode;
    if (value === null || value === '') patch.themeMode = null;
    else if (value === 'light' || value === 'dark') patch.themeMode = value;
    else throw new Error('Modo de tema no válido');
  }
  return patch;
}
