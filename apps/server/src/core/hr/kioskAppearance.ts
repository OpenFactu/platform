import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { systemConfigs } from '../../db/schema';

export const kioskAppearanceKey = (id: string) => `hr.kiosk.appearance.${id}`;
export function parseKioskAppearance(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('Aspecto inválido.');
  const data = input as Record<string, unknown>;
  const color = data.backgroundColor ?? '#020617';
  if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
    throw new Error('Selecciona un color de fondo válido.');
  const welcome = data.welcomeMessage ?? 'Acerca tu tarjeta';
  if (typeof welcome !== 'string' || !welcome.trim() || welcome.trim().length > 120)
    throw new Error('La bienvenida debe tener entre 1 y 120 caracteres.');
  const sound = data.soundEnabled ?? true;
  if (typeof sound !== 'boolean') throw new Error('La opción de sonido no es válida.');
  const image = (key: string, maxBytes: number) => {
    const value = data[key] ?? '';
    if (value === '') return '';
    if (typeof value !== 'string' || value.length > Math.ceil((maxBytes * 4) / 3) + 40)
      throw new Error('La imagen es demasiado grande. Vuelve a seleccionarla.');
    const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
    if (!match) throw new Error('Usa una imagen PNG, JPG o WebP.');
    const bytes = Buffer.from(match[2], 'base64');
    const valid =
      match[1] === 'png'
        ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
        : match[1] === 'jpeg'
          ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
          : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
    if (!valid || bytes.length > maxBytes)
      throw new Error('El archivo no contiene una imagen válida.');
    return value;
  };
  return {
    backgroundColor: color,
    backgroundImage: image('backgroundImage', 256000),
    logoImage: image('logoImage', 96000),
    welcomeMessage: welcome.trim(),
    soundEnabled: sound,
  };
}
export async function getKioskAppearance(client: any, kioskId: string) {
  const [row] = await client
    .select({ value: systemConfigs.value })
    .from(systemConfigs)
    .where(eq(systemConfigs.key, kioskAppearanceKey(kioskId)));
  try {
    return parseKioskAppearance(row?.value ? JSON.parse(row.value) : {});
  } catch {
    return parseKioskAppearance({});
  }
}
export async function saveKioskAppearance(
  client: any,
  kioskId: string,
  appearance: ReturnType<typeof parseKioskAppearance>,
) {
  await client
    .insert(systemConfigs)
    .values({
      id: crypto.randomUUID(),
      key: kioskAppearanceKey(kioskId),
      value: JSON.stringify(appearance),
      description: 'Aspecto del kiosco de fichaje',
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemConfigs.key,
      set: { value: JSON.stringify(appearance), updatedAt: new Date() },
    });
}
