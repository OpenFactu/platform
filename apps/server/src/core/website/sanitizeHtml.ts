/**
 * Sanitizador de HTML para bloques richText del módulo Website. Se aplica UNA
 * vez al publicar (no por visita). Lista blanca de tags/atributos: el
 * contenido lo escriben admins del tenant, pero la página es pública — nada
 * de scripts, estilos inline arbitrarios ni handlers de eventos.
 */

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'hr',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'blockquote',
  'ul',
  'ol',
  'li',
  'a',
  'img',
  'span',
  'div',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'figure',
  'figcaption',
  'code',
  'pre',
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan']),
};

function sanitizeAttrs(tag: string, attrsRaw: string): string {
  const allowed = ALLOWED_ATTRS[tag];
  if (!allowed) return '';
  let out = '';
  const attrRe = /([a-zA-Z-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(attrsRaw))) {
    const name = m[1].toLowerCase();
    const value = m[3] ?? m[4] ?? '';
    if (!allowed.has(name)) continue;
    // Bloquear javascript:/data: en URLs (permitimos data:image para pegado simple)
    if ((name === 'href' || name === 'src') && /^\s*(javascript|vbscript):/i.test(value)) continue;
    if (name === 'href' && /^\s*data:/i.test(value)) continue;
    out += ` ${name}="${value.replace(/"/g, '&quot;')}"`;
  }
  // Los enlaces externos siempre con rel seguro
  if (tag === 'a' && out.includes('target=')) out += ' rel="noopener noreferrer"';
  return out;
}

export function sanitizeHtml(input: string): string {
  if (!input) return '';
  let html = String(input);

  // Fuera bloques peligrosos completos (script/style/iframe/etc.)
  html = html.replace(/<(script|style|iframe|object|embed|form|svg|math)[\s\S]*?<\/\1\s*>/gi, '');
  // Fuera comentarios HTML
  html = html.replace(/<!--[\s\S]*?-->/g, '');

  // Reescribir cada tag: se conservan solo los de la lista blanca con
  // atributos filtrados; el resto se elimina (conservando su texto interior).
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s[^<>]*)?)>/g, (full, rawTag, rawAttrs) => {
    const tag = String(rawTag).toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) return '';
    if (full.startsWith('</')) return `</${tag}>`;
    const selfClose = tag === 'br' || tag === 'hr' || tag === 'img' ? ' /' : '';
    return `<${tag}${sanitizeAttrs(tag, String(rawAttrs))}${selfClose}>`;
  });

  return html;
}
