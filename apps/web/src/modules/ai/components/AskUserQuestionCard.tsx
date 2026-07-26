import React, { useState } from 'react';
import { Button, Input } from '@openfactu/ui';
import { HelpCircle, Check, Send } from 'lucide-react';

export interface QuestionOption {
  label: string;
  description?: string;
}

export interface QuestionStep {
  current: number;
  total: number;
  title?: string;
}

/**
 * Tarjeta de pregunta de Keiro — equivalente a AskUserQuestion pero para el
 * chat del ERP. Soporta opciones (botones), texto libre, o ambas a la vez.
 * Al responder, la respuesta se envía como el siguiente mensaje del usuario
 * y la conversación continúa normalmente; no es una confirmación de acción
 * (no toca datos), solo una forma más rápida/guiada de responder.
 *
 * Con `step` se muestra además "Paso X de Y" + barra de progreso — usado en
 * flujos guiados (Keiro pidiendo campos uno a uno, p.ej. dar de alta un
 * cliente) para que el usuario vea cuánto queda sin que la sensación de
 * "guía paso a paso" se rompa a mitad de camino.
 */
export const AskUserQuestionCard: React.FC<{
  question: string;
  options: QuestionOption[];
  multiSelect?: boolean;
  allowFreeText?: boolean;
  freeTextPlaceholder?: string;
  step?: QuestionStep;
  disabled?: boolean;
  onAnswer: (text: string) => void;
}> = ({
  question,
  options,
  multiSelect,
  allowFreeText,
  freeTextPlaceholder,
  step,
  disabled,
  onAnswer,
}) => {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [freeText, setFreeText] = useState('');
  const [answered, setAnswered] = useState(false);

  const answer = (text: string) => {
    if (!text.trim()) return;
    setAnswered(true);
    onAnswer(text.trim());
  };

  const toggle = (label: string) => {
    if (disabled || answered) return;
    if (!multiSelect) {
      answer(label);
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const confirmMulti = () => {
    if (selected.size === 0) return;
    answer(Array.from(selected).join(', '));
  };

  const submitFreeText = () => answer(freeText);

  return (
    <div className="border-2 border-accent/30 rounded-md p-3 space-y-2.5 bg-accent/5 dark:bg-accent/10 w-full">
      {step && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-accent/80">
            <span>{step.title || 'Paso a paso'}</span>
            <span>
              Paso {step.current} de {step.total}
            </span>
          </div>
          <div className="h-1 rounded-full bg-accent/15 overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${Math.min(100, (step.current / step.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 text-accent text-xs font-bold">
        <HelpCircle size={14} className="shrink-0" />
        {question}
      </div>

      {options.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {options.map((opt) => {
            const isSelected = selected.has(opt.label);
            return (
              <button
                key={opt.label}
                type="button"
                disabled={disabled || answered}
                onClick={() => toggle(opt.label)}
                className={`text-left px-3 py-1.5 rounded-lg border text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSelected
                    ? 'border-accent bg-accent text-white'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-accent hover:text-accent'
                }`}
              >
                <div className="font-bold flex items-center gap-1">
                  {multiSelect && isSelected && <Check size={12} />}
                  {opt.label}
                </div>
                {opt.description && (
                  <div
                    className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-slate-400'}`}
                  >
                    {opt.description}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {multiSelect && options.length > 0 && !answered && (
        <Button size="sm" onClick={confirmMulti} disabled={disabled || selected.size === 0}>
          Confirmar selección
        </Button>
      )}

      {allowFreeText && (
        <div className="flex items-center gap-2">
          <Input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitFreeText();
              }
            }}
            placeholder={freeTextPlaceholder || 'Escribe tu respuesta…'}
            disabled={disabled || answered}
            autoFocus={options.length === 0}
            inputSize="sm"
            containerClassName="flex-1"
          />
          <Button
            type="button"
            variant="accent"
            size="sm"
            onClick={submitFreeText}
            disabled={disabled || answered || !freeText.trim()}
            title="Enviar respuesta"
            className="shrink-0"
          >
            <Send size={14} />
          </Button>
        </div>
      )}

      {answered && (
        <p className="text-[10px] text-accent/70">Respondido — sigue la conversación abajo.</p>
      )}
    </div>
  );
};
