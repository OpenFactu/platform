/** Un 500 sin el detalle: el mensaje de un error puede llevar SQL o rutas del servidor. */
export function internalError(res: any, where: string, e: any) {
  console.error(`[auth] ${where}:`, e?.message);
  res.status(500).json({ error: 'Error interno', code: 'INTERNAL_ERROR' });
}
