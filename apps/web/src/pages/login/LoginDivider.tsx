/** Línea con «o» en medio: separa el acceso principal de las otras formas de entrar. */
import React from 'react';

export const LoginDivider: React.FC<{ label: string }> = ({ label }) => (
  <div className="flex items-center gap-3 text-xs text-fg-subtle" role="separator">
    <span className="h-px flex-1 bg-border-default" />
    <span>{label}</span>
    <span className="h-px flex-1 bg-border-default" />
  </div>
);
