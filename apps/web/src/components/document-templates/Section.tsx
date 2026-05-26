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
        'border rounded-xl overflow-hidden transition-all',
        subtle
          ? 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-sm',
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className={cn(
          'w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
          'hover:bg-slate-50 dark:hover:bg-slate-800/50',
          expanded && 'bg-slate-50 dark:bg-slate-800/50',
        )}
      >
        <div className="flex items-center gap-2.5">
          {icon && <span className="text-slate-500 dark:text-slate-400 flex-shrink-0">{icon}</span>}
          <span className="text-xs font-black text-slate-700 dark:text-slate-200 uppercase tracking-widest">
            {title}
          </span>
        </div>
        {expanded ? (
          <ChevronDown size={16} className="text-slate-400 dark:text-slate-500" />
        ) : (
          <ChevronRight size={16} className="text-slate-400 dark:text-slate-500" />
        )}
      </button>
      {expanded && (
        <div className="px-4 py-4 border-t border-slate-100 dark:border-slate-800 animate-in fade-in duration-200">
          {children}
        </div>
      )}
    </div>
  );
};
