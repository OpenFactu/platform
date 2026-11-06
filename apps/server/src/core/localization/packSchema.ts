import { z } from 'zod';
import type { LocalizationPack } from './types';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha en formato AAAA-MM-DD');

const terminology = z
  .object({
    tax: z.string().min(1),
    taxId: z.string().min(1),
    withholding: z.string().min(1),
    incomeTax: z.string().min(1),
    socialEmployee: z.string().min(1),
    socialEmployer: z.string().min(1),
  })
  .partial()
  .strict();

const packSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9_-]*$/, 'Solo minúsculas, números, - y _'),
    name: z.string().min(1),
    version: z.string().min(1),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/, 'Código ISO de 2 letras')),
    adoption: z
      .object({ taxCodePrefixes: z.array(z.string().min(1)).optional() })
      .strict()
      .optional(),
    terminology: z.record(z.string(), terminology).optional(),
    taxes: z
      .array(
        z
          .object({
            code: z.string().min(1),
            rate: z.number().min(0).max(999.99),
            category: z.string().min(1).optional(),
            validFrom: isoDate.optional(),
            validTo: isoDate.optional(),
          })
          .strict(),
      )
      .optional(),
    accounts: z
      .array(
        z
          .object({
            code: z.string().min(1),
            name: z.string().min(1),
            type: z.enum(['asset', 'liability', 'equity', 'income', 'expense']),
          })
          .strict(),
      )
      .optional(),
    accountMappings: z
      .array(z.object({ kind: z.string().min(1), code: z.string().min(1) }).strict())
      .optional(),
    payrollConcepts: z
      .array(
        z
          .object({
            code: z.string().min(1),
            name: z.string().min(1),
            kind: z.enum(['devengo', 'deduccion', 'aportacion_empresa']),
            calculation: z.enum(['fixed', 'percent_of_base', 'per_hour']).optional(),
            defaultPercent: z.number().min(0).optional(),
            category: z.enum(['income_tax', 'social_employee', 'social_employer']).optional(),
            taxableIncomeTax: z.boolean().optional(),
            taxableSocial: z.boolean().optional(),
          })
          .strict(),
      )
      .optional(),
    documentTypes: z
      .array(
        z
          .object({
            code: z.string().min(1),
            name: z.string().min(1),
            docCategory: z.enum(['invoice', 'credit_note', 'debit_note', 'ticket']),
            isRectify: z.boolean().optional(),
            sortOrder: z.number().optional(),
          })
          .strict(),
      )
      .optional(),
    legalTexts: z
      .array(
        z
          .object({
            docTypes: z.array(z.string().min(1)).optional(),
            locale: z.string().min(1).optional(),
            text: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

/** Comprobaciones que el esquema solo no puede hacer: referencias internas. */
function crossChecks(pack: LocalizationPack): string[] {
  const errors: string[] = [];
  const codes = new Set((pack.accounts ?? []).map((a) => a.code));
  for (const m of pack.accountMappings ?? []) {
    if (!codes.has(m.code)) {
      errors.push(`accountMappings: "${m.kind}" apunta a la cuenta ${m.code}, que no se declara`);
    }
  }
  const duplicates = (values: string[]) =>
    values.filter((v, i) => values.indexOf(v) !== i).filter((v, i, all) => all.indexOf(v) === i);
  for (const code of duplicates((pack.taxes ?? []).map((t) => t.code))) {
    errors.push(`taxes: el código ${code} está repetido`);
  }
  for (const code of duplicates((pack.accounts ?? []).map((a) => a.code))) {
    errors.push(`accounts: el código ${code} está repetido`);
  }
  return errors;
}

/** Valida un paquete. Lanza con todos los errores juntos, para corregirlos de una vez. */
export function parseLocalizationPack(input: unknown): LocalizationPack {
  const parsed = packSchema.safeParse(input);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Paquete de localización inválido:\n  ${lines.join('\n  ')}`);
  }
  const pack = parsed.data as LocalizationPack;
  const errors = crossChecks(pack);
  if (errors.length > 0) {
    throw new Error(`Paquete de localización inválido:\n  ${errors.join('\n  ')}`);
  }
  return pack;
}
