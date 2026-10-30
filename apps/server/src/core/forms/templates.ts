/**
 * Puntos de partida al crear un formulario. Cada uno es una definición v2
 * normal: se edita igual que uno en blanco.
 */
import type { FormDefinition, Question } from './engine';
import { DEFAULT_SETTINGS, type FormSettings } from './settings';

export type TemplateId = 'blank' | 'contact' | 'satisfaction' | 'event' | 'quiz';

const q = (
  id: string,
  type: Question['type'],
  title: string,
  extra: Partial<Question> = {},
): Question => ({
  kind: 'question',
  id,
  type,
  title,
  ...extra,
});
const opts = (...labels: string[]) => labels.map((label, i) => ({ id: `o${i + 1}`, label }));

export const TEMPLATES: Record<
  TemplateId,
  {
    label: string;
    kind: 'form' | 'survey';
    definition: FormDefinition;
    settings?: Partial<FormSettings>;
  }
> = {
  blank: {
    label: 'En blanco',
    kind: 'form',
    definition: {
      version: 2,
      sections: [{ id: 's1', items: [q('q1', 'shortText', 'Pregunta sin título')] }],
    },
  },
  contact: {
    label: 'Contacto',
    kind: 'form',
    definition: {
      version: 2,
      sections: [
        {
          id: 's1',
          items: [
            q('nombre', 'shortText', 'Nombre', { required: true, mapTo: 'prospectName' }),
            q('empresa', 'shortText', 'Empresa', { mapTo: 'prospectCompany' }),
            q('correo', 'email', 'Correo', { required: true, mapTo: 'prospectEmail' }),
            q('telefono', 'phone', 'Teléfono', { mapTo: 'prospectPhone' }),
            q('mensaje', 'paragraph', '¿En qué podemos ayudarte?', { mapTo: 'message' }),
          ],
        },
      ],
    },
    settings: { crm: { createLead: true } },
  },
  satisfaction: {
    label: 'Satisfacción (NPS)',
    kind: 'survey',
    definition: {
      version: 2,
      sections: [
        {
          id: 's1',
          items: [
            q('nps', 'scale', '¿Con qué probabilidad nos recomendarías a un amigo o colega?', {
              required: true,
              scale: { min: 0, max: 10, minLabel: 'Nada probable', maxLabel: 'Muy probable' },
            }),
            q('motivo', 'paragraph', '¿Qué es lo que más ha influido en tu puntuación?'),
            q('aspectos', 'gridRadio', 'Valora estos aspectos', {
              rows: opts('Calidad', 'Precio', 'Atención', 'Plazos'),
              columns: opts('Mal', 'Regular', 'Bien', 'Muy bien'),
            }),
          ],
        },
      ],
    },
  },
  event: {
    label: 'Inscripción a un evento',
    kind: 'form',
    definition: {
      version: 2,
      sections: [
        {
          id: 's1',
          title: 'Tus datos',
          items: [
            q('nombre', 'shortText', 'Nombre y apellidos', {
              required: true,
              mapTo: 'prospectName',
            }),
            q('correo', 'email', 'Correo', { required: true, mapTo: 'prospectEmail' }),
            q('asistes', 'radio', '¿Vendrás?', {
              required: true,
              options: [
                { id: 'si', label: 'Sí' },
                { id: 'no', label: 'No puedo' },
              ],
              goTo: { no: 'submit' },
            }),
          ],
        },
        {
          id: 's2',
          title: 'Detalles',
          items: [
            q('acompanantes', 'number', '¿Cuántos acompañantes?', {
              validation: { kind: 'range', min: 0, max: 5 },
            }),
            q('dieta', 'checkbox', 'Necesidades de comida', {
              options: opts('Vegetariana', 'Sin gluten', 'Sin lactosa'),
              hasOther: true,
            }),
          ],
        },
      ],
    },
    settings: { collectEmail: 'none', allowEdit: true },
  },
  quiz: {
    label: 'Cuestionario',
    kind: 'form',
    definition: {
      version: 2,
      sections: [
        {
          id: 's1',
          items: [
            q('p1', 'radio', 'Pregunta de ejemplo', {
              required: true,
              options: opts('Respuesta correcta', 'Respuesta incorrecta'),
              quiz: { points: 1, correct: ['o1'] },
            }),
          ],
        },
      ],
    },
    settings: { collectEmail: 'required', quiz: { ...DEFAULT_SETTINGS.quiz, enabled: true } },
  },
};
