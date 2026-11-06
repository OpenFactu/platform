/**
 * Cuándo una plantilla "de fábrica" deja de serlo. Esas filas se regeneran solas
 * (al arrancar y con "Regenerar estándares"), así que una edición que se quede en
 * ellas se pierde sin avisar.
 */

/** Un layout del diseñador con algo dentro: los vacíos no son un diseño de nadie. */
export function hasDesignedElements(layout: unknown): boolean {
  const bands = (layout as any)?.bands;
  return Array.isArray(bands) && bands.some((b: any) => b?.elements?.length > 0);
}

/** Lo que llega por `PUT` cambia de verdad la plantilla estándar. */
export function isFactoryTemplateEdit(
  existing: { isFactoryDefault?: boolean | null; html?: string | null },
  incoming: { html?: unknown; canvasLayout?: unknown },
): boolean {
  if (!existing.isFactoryDefault) return false;
  const htmlChanged = typeof incoming.html === 'string' && incoming.html !== existing.html;
  return htmlChanged || hasDesignedElements(incoming.canvasLayout);
}
