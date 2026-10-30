import React, { useEffect, useState } from 'react';
import { WorkLoader } from '@/components/loaders/WorkLoader';
import { AboutKeirost } from './AboutKeirost';

/**
 * Contenido del panel de marca: una escena del almacén que cambia cada 5 s y
 * el texto de qué es Keirost. Va sobre el color primario (el panel del login
 * en escritorio y la página «Qué es Keirost» del móvil).
 */
export const BrandShowcase: React.FC = () => {
  const [scene, setScene] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setScene((n) => (n + 1) % 4), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="space-y-4">
      {/* Trazo y suelo claros sobre el primario; cajas con el acento. */}
      <div
        className="pb-6 -ml-2"
        style={
          {
            '--fg-muted': 'rgb(var(--color-primary-fg-rgb) / 0.7)',
            '--border-strong': 'rgb(var(--color-primary-fg-rgb) / 0.25)',
            '--bg-card': 'rgb(var(--color-primary-fg-rgb) / 0.92)',
          } as React.CSSProperties
        }
      >
        <WorkLoader key={scene} scene={scene} className="h-auto w-60" />
      </div>
      <AboutKeirost tone="brand" />
    </div>
  );
};
