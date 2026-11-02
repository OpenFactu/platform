/**
 * Validación de identificaciones fiscales por país. El formato básico sale del
 * regex de `Country`; un plugin puede añadir lo que un regex no alcanza, como
 * la letra de control.
 */
import { TenantScopedRegistry } from '../plugins/TenantScopedRegistry';

/** Devuelve un mensaje si el valor no es válido, o null si lo es. */
export type TaxIdValidator = (value: string) => string | null | undefined;

const validators = new TenantScopedRegistry<{ country: string; validate: TaxIdValidator }>();

export const TaxIdValidators = {
  register(pluginId: string, country: string, validate: TaxIdValidator): void {
    validators.add(pluginId, { country: country.toUpperCase(), validate });
  },

  check(tenantId: string | undefined, country: string, value: string): string | null {
    for (const v of validators.activeFor(tenantId)) {
      if (v.country !== country.toUpperCase()) continue;
      const error = v.validate(value);
      if (error) return error;
    }
    return null;
  },

  /** Solo para los tests. */
  clear(): void {
    validators.clear();
  },
};
