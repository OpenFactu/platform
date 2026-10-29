import type { Question, Validation } from '@forms-engine';

/** Qué validaciones admite cada tipo (las mismas que aplica el motor). */
export function validationKinds(type: Question['type']): Validation['kind'][] {
  if (type === 'shortText' || type === 'paragraph' || type === 'phone')
    return type === 'shortText' ? ['length', 'url', 'regex'] : ['length', 'regex'];
  if (type === 'number') return ['range'];
  if (type === 'checkbox') return ['count'];
  return [];
}
