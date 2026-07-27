import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@openfactu/ui';

interface Props {
  title: string;
  icon?: React.ReactNode;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  subtle?: boolean;
}

export const Section: React.FC<Props> = ({
  title,
  icon,
  defaultExpanded = false,
  children,
  subtle = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <div
      className={cn(
        'border rounded-lg overflow-hidden transition-all',
        subtle ? 'border-border-subtle bg-bg-card' : 'border-border-default bg-bg-card shadow-sm',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
          'hover:bg-bg-hover',
          expanded && 'bg-bg-muted',
        )}
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-fg-muted flex-shrink-0">{icon}</span>}
          <span className="text-xs font-black text-fg-body uppercase tracking-widest">{title}</span>
        </div>
        {expanded ? (
          <ChevronDown size={16} className="text-fg-subtle" />
        ) : (
          <ChevronRight size={16} className="text-fg-subtle" />
        )}
      </button>
      {expanded && (
        <div className="px-4 py-4 border-t border-border-subtle animate-in fade-in duration-200">
          {children}
        </div>
      )}
    </div>
  );
};
