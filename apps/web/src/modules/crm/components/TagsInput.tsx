import React, { useState } from 'react';
import { Badge, Input } from '@openfactu/ui';
import { X } from 'lucide-react';

interface Props {
  value: string[];
  onChange: (tags: string[]) => void;
  label?: string;
  disabled?: boolean;
}

/** Etiquetas libres: Intro o coma para añadir, × para quitar. */
export const TagsInput: React.FC<Props> = ({ value, onChange, label = 'Etiquetas', disabled }) => {
  const [draft, setDraft] = useState('');

  const add = () => {
    const t = draft.trim().replace(/,$/, '');
    setDraft('');
    if (!t || value.some((v) => v.toLowerCase() === t.toLowerCase())) return;
    onChange([...value, t]);
  };

  return (
    <div className="space-y-1.5">
      <Input
        label={label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !draft && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={disabled ? '' : 'Escribe y pulsa Intro'}
        disabled={disabled}
      />
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((t) => (
            <Badge key={t} variant="accent" className="gap-1">
              {t}
              {!disabled && (
                <button
                  type="button"
                  aria-label={`Quitar ${t}`}
                  onClick={() => onChange(value.filter((v) => v !== t))}
                  className="hover:opacity-70"
                >
                  <X size={10} />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
};
