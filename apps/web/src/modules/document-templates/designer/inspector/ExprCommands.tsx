import React from 'react';
import { Button } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { Section } from './controls';
import { EXPR_COMMANDS } from './exprCommands.data';

/** Expresiones listas para insertar en un texto. Un clic la añade al final. */
export const ExprCommands: React.FC<{ onInsert: (snippet: string) => void; label?: string }> = ({
  onInsert,
  label,
}) => {
  const { t } = useI18n();
  const groups = Array.from(new Set(EXPR_COMMANDS.map((c) => c.group)));
  return (
    <Section title={label ?? t('templates.designer.expr.available')} defaultOpen={false}>
      {groups.map((g) => (
        <div key={g}>
          <div className="text-[10px] uppercase tracking-wide text-fg-subtle mb-0.5">{t(g)}</div>
          <div className="flex flex-wrap gap-1">
            {EXPR_COMMANDS.filter((c) => c.group === g).map((c) => (
              <Button
                key={c.label}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => onInsert(c.snippet)}
                title={`${c.hint ? t(c.hint) + ' — ' : ''}${c.snippet}`}
              >
                {t(c.label)}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <div className="text-[10px] text-fg-subtle pt-1">{t('templates.designer.expr.hint')}</div>
    </Section>
  );
};
