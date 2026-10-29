import React, { useState } from 'react';
import { Button, Input } from '@openfactu/ui';
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react';

interface Props {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}

/** Lista editable de textos (catálogos cortos: motivos, orígenes…). */
export const StringListEditor: React.FC<Props> = ({
  label,
  values,
  onChange,
  placeholder,
  disabled,
}) => {
  const [draft, setDraft] = useState('');

  const add = () => {
    const v = draft.trim();
    if (!v || values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    onChange([...values, v]);
    setDraft('');
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold text-fg-muted">{label}</div>
      <ul className="divide-y divide-border-subtle rounded-xs border border-border-default bg-bg-card">
        {values.map((v, i) => (
          <li key={v} className="flex items-center gap-1 px-3 py-1.5">
            <span className="flex-1 text-sm text-fg-body">{v}</span>
            {!disabled && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Subir ${v}`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowUp size={12} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Bajar ${v}`}
                  disabled={i === values.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowDown size={12} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Quitar ${v}`}
                  onClick={() => onChange(values.filter((x) => x !== v))}
                >
                  <X size={12} />
                </Button>
              </>
            )}
          </li>
        ))}
        {values.length === 0 && <li className="px-3 py-2 text-sm text-fg-subtle">Vacío</li>}
      </ul>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
            placeholder={placeholder}
            containerClassName="flex-1"
          />
          <Button type="button" variant="secondary" onClick={add} disabled={!draft.trim()}>
            <Plus size={14} /> Añadir
          </Button>
        </div>
      )}
    </div>
  );
};
