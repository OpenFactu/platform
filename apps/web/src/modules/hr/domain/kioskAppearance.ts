export interface KioskAppearance {
  backgroundColor: string;
  backgroundImage: string;
  logoImage: string;
  welcomeMessage: string;
  soundEnabled: boolean;
}
export const DEFAULT_KIOSK_APPEARANCE: KioskAppearance = {
  backgroundColor: '#020617',
  backgroundImage: '',
  logoImage: '',
  welcomeMessage: 'Acerca tu tarjeta',
  soundEnabled: true,
};

export async function prepareKioskImage(
  file: File,
  kind: 'backgroundImage' | 'logoImage',
): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
    throw new Error('Elige una imagen JPG, PNG o WebP de hasta 5 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const max = kind === 'logoImage' ? 512 : 1600;
    const limit = kind === 'logoImage' ? 96000 : 256000;
    let scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    for (let attempt = 0; attempt < 6; attempt++) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No se pudo preparar la imagen.');
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL(kind === 'logoImage' ? 'image/png' : 'image/jpeg', 0.8);
      if (result.length <= Math.ceil((limit * 4) / 3)) return result;
      scale *= 0.75;
    }
    throw new Error('La imagen es demasiado compleja. Prueba con otra más pequeña.');
  } finally {
    bitmap.close();
  }
}
