/**
 * Render de Markdown para los mensajes del asistente de IA.
 *
 * react-markdown + remark-gfm (tablas, listas de tareas, tachado). Los
 * elementos se estilan a mano con Tailwind porque el proyecto no usa el plugin
 * de tipografía; las tablas van envueltas en un contenedor con scroll
 * horizontal para no romper el ancho de la burbuja del chat.
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export const Markdown: React.FC<{ children: string }> = ({ children }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      p: (props) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
      strong: (props) => <strong className="font-bold" {...props} />,
      a: (props) => (
        <a
          className="text-accent underline underline-offset-2"
          target="_blank"
          rel="noreferrer"
          {...props}
        />
      ),
      ul: (props) => <ul className="list-disc pl-5 mb-2 space-y-0.5" {...props} />,
      ol: (props) => <ol className="list-decimal pl-5 mb-2 space-y-0.5" {...props} />,
      li: (props) => <li className="leading-relaxed" {...props} />,
      h1: (props) => <h3 className="text-base font-bold mt-3 mb-1" {...props} />,
      h2: (props) => <h3 className="text-base font-bold mt-3 mb-1" {...props} />,
      h3: (props) => <h4 className="text-sm font-bold mt-2 mb-1" {...props} />,
      code: ({ className, children: codeChildren, ...props }) => {
        const isBlock = /language-/.test(className || '');
        return isBlock ? (
          <code
            className={`block text-[11px] font-mono bg-bg-muted rounded p-2 overflow-x-auto custom-scrollbar ${className || ''}`}
            {...props}
          >
            {codeChildren}
          </code>
        ) : (
          <code className="text-[0.85em] font-mono bg-bg-muted rounded px-1 py-0.5" {...props}>
            {codeChildren}
          </code>
        );
      },
      pre: (props) => (
        <pre className="mb-2 max-w-full overflow-x-auto custom-scrollbar" {...props} />
      ),
      blockquote: (props) => (
        <blockquote
          className="border-l-2 border-border-strong pl-3 text-fg-muted mb-2"
          {...props}
        />
      ),
      table: (props) => (
        <div className="overflow-x-auto custom-scrollbar mb-2">
          <table
            className="text-xs border-collapse [&_th]:border [&_td]:border [&_th]:border-slate-200 [&_td]:border-slate-200 dark:[&_th]:border-slate-600 dark:[&_td]:border-slate-600 [&_th]:px-2 [&_th]:py-1 [&_td]:px-2 [&_td]:py-1 [&_th]:bg-slate-50 dark:[&_th]:bg-slate-800 [&_th]:font-bold [&_th]:text-left"
            {...props}
          />
        </div>
      ),
      hr: () => <hr className="my-3 border-border-default" />,
    }}
  >
    {children}
  </ReactMarkdown>
);
