/**
 * Por qué no se ha podido entregar. El conductor elige lo que ha pasado; si eso aplaza
 * la parada o abre una incidencia lo decide la empresa, y él no tiene por qué saberlo.
 */
import type { StopReason } from './deliveryFlow';

export const OTHER_PROBLEM = 'other';
export const MISSING_PACKAGE = 'missingPackage';

export function enabledProblems(reasons: StopReason[]): StopReason[] {
  return reasons.filter((reason) => reason.enabled);
}

/** Basta con elegir el motivo; "otro" pide además escribirlo. */
export function problemReady(id: string | null, text: string): boolean {
  if (!id) return false;
  return id !== OTHER_PROBLEM || !!text.trim();
}
