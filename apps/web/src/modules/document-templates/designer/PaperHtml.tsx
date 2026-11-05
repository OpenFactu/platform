import React, { useLayoutEffect, useRef } from 'react';
import { PAPER_CSS, sanitizedFragment } from './paperRender';
import { useDesignerPreview } from './PreviewContext';

/**
 * HTML ya resuelto, igual que en el PDF. Va en un shadow DOM para que no le afecten los estilos
 * de la aplicación. No recibe el ratón: quien lo mueve y lo selecciona es su caja en el lienzo.
 */
export const PaperHtml: React.FC<{ html: string; className?: string }> = ({
  html,
  className = 'w-full h-full',
}) => {
  const { customCss } = useDesignerPreview();
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    const root = node.shadowRoot ?? node.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = `${PAPER_CSS}\n${customCss ?? ''}`;
    root.replaceChildren(style, sanitizedFragment(html));
  }, [html, customCss]);
  return <div ref={host} className={`pointer-events-none ${className}`} />;
};
