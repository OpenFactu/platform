import React from 'react';

/**
 * Un correo tal como lo verá el cliente. Va en un iframe sin permisos porque es una página
 * entera con sus propios estilos, y sobre blanco porque así llega, con cualquier tema.
 */
export const LetterFrame: React.FC<{ html: string; title: string }> = ({ html, title }) => (
  <iframe
    title={title}
    srcDoc={html}
    sandbox=""
    className="w-full h-[28rem] rounded-lg border border-border-default bg-white"
  />
);
