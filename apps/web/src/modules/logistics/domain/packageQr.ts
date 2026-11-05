/** El bulto que dice la etiqueta (`logisticsPdf.ts`), o `null` si el QR es otra cosa. */
export function parsePackageQr(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw);
    return parsed?.v === 1 && parsed.type === 'package' && parsed.id ? parsed.id : null;
  } catch {
    return null;
  }
}
