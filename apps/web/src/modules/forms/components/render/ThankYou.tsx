import React from 'react';
import { Badge, Button, Card, Input, useToast } from '@openfactu/ui';
import { CheckCircle2, Copy } from 'lucide-react';
import { allQuestions, type FormDefinition } from '@forms-engine';
import type { SubmitResult } from '../../hooks/usePublicForm';

interface Props {
  result: SubmitResult;
  definition: FormDefinition;
  editLink: string | null;
  onAnother?: () => void;
}

/** Pantalla tras enviar: mensaje, enlace para editar y, en un cuestionario, la nota. */
export const ThankYou: React.FC<Props> = ({ result, definition, editLink, onAnother }) => {
  const toast = useToast();
  const score = result.score;
  const titles = new Map(allQuestions(definition).map((q) => [q.id, q]));
  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <CheckCircle2 size={36} className="text-success-fg" />
          <p className="text-lg font-semibold text-fg-default">
            {result.message || '¡Gracias! Hemos recibido tu respuesta.'}
          </p>
          {score && (
            <p className="text-3xl font-bold tabular-nums text-fg-default">
              {score.score}{' '}
              <span className="text-base font-normal text-fg-muted">/ {score.maxScore} puntos</span>
            </p>
          )}
          {score?.pending && (
            <p className="text-sm text-fg-muted">
              Algunas preguntas se corrigen a mano: la nota puede cambiar.
            </p>
          )}
        </div>
        {editLink && (
          <div className="space-y-2 border-t border-border-subtle pt-4">
            <p className="text-sm text-fg-muted">
              Guarda este enlace si quieres cambiar tu respuesta más tarde:
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex-1 min-w-0">
                <Input
                  aria-label="Enlace para editar"
                  value={editLink}
                  readOnly
                  onFocus={(e) => e.target.select()}
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  navigator.clipboard
                    .writeText(editLink)
                    .then(() => toast.success('Enlace copiado'))
                    .catch(() => toast.error('No se pudo copiar'))
                }
              >
                <Copy size={14} /> Copiar
              </Button>
            </div>
          </div>
        )}
        {onAnother && (
          <div className="flex justify-center pt-4">
            <Button type="button" variant="link" onClick={onAnother}>
              Enviar otra respuesta
            </Button>
          </div>
        )}
      </Card>

      {score?.questions &&
        Object.entries(score.questions).map(([id, g]) => {
          const q = titles.get(id);
          if (!q) return null;
          const correct = (g.correctAnswer ?? []).map(
            (c) => q.options?.find((o) => o.id === c)?.label ?? c,
          );
          return (
            <Card key={id} bodyClassName="space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <span className="text-sm font-medium text-fg-default">{q.title}</span>
                {g.correct === true && (
                  <Badge variant="success">
                    {g.points}/{g.max}
                  </Badge>
                )}
                {g.correct === false && (
                  <Badge variant="error">
                    {g.points}/{g.max}
                  </Badge>
                )}
                {g.correct === null && <Badge variant="warning">Por corregir</Badge>}
              </div>
              {g.correct === false && correct.length > 0 && (
                <p className="text-sm text-fg-body">Respuesta correcta: {correct.join(', ')}</p>
              )}
              {g.feedback && (
                <p className="text-sm text-fg-muted whitespace-pre-wrap">{g.feedback}</p>
              )}
            </Card>
          );
        })}
    </div>
  );
};
