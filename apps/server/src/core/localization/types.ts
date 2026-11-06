/**
 * Paquete de localización: lo que un plugin declara, sin programar, para que
 * una empresa cumpla la normativa de un país o una zona.
 *
 * El núcleo no conoce ningún país: todo lo que varía con la ley llega por aquí
 * o por los puntos de extensión con código de `PluginContext`.
 */

export interface LocalizationTerminology {
  /** Nombre del impuesto en la factura, p. ej. "GST". */
  tax?: string;
  /** Identificación fiscal, p. ej. "VAT number". */
  taxId?: string;
  withholding?: string;
  /** Retención sobre la renta en la nómina. */
  incomeTax?: string;
  socialEmployee?: string;
  socialEmployer?: string;
}

export interface PackTax {
  code: string;
  /** Porcentaje, p. ej. 21 para el 21 %. */
  rate: number;
  category?: string;
  validFrom?: string;
  validTo?: string;
}

export interface PackAccount {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
}

export interface PackAccountMapping {
  kind: string;
  code: string;
}

export type PayrollConceptCategory = 'income_tax' | 'social_employee' | 'social_employer';

export interface PackPayrollConcept {
  code: string;
  name: string;
  kind: 'devengo' | 'deduccion' | 'aportacion_empresa';
  calculation?: 'fixed' | 'percent_of_base' | 'per_hour';
  defaultPercent?: number;
  category?: PayrollConceptCategory;
  taxableIncomeTax?: boolean;
  taxableSocial?: boolean;
}

export interface PackLegalText {
  /** Tipos de documento a los que aplica. Sin indicar: todos. */
  docTypes?: string[];
  /** Idioma, p. ej. 'es'. Sin indicar: todos. */
  locale?: string;
  text: string;
}

export interface PackDocumentType {
  code: string;
  name: string;
  docCategory: 'invoice' | 'credit_note' | 'debit_note' | 'ticket';
  isRectify?: boolean;
  sortOrder?: number;
}

export interface LocalizationPack {
  id: string;
  name: string;
  version: string;
  /** Países ISO 3166-1 alpha-2 a los que se aplica el paquete. */
  countries: string[];
  /**
   * Cómo reconocer empresas que ya usaban esta normativa antes de existir el
   * paquete, además de por su país.
   */
  adoption?: { taxCodePrefixes?: string[] };
  /** Términos por idioma: `{ es: {...}, en: {...} }`. */
  terminology?: Record<string, LocalizationTerminology>;
  taxes?: PackTax[];
  accounts?: PackAccount[];
  accountMappings?: PackAccountMapping[];
  payrollConcepts?: PackPayrollConcept[];
  /** Tipos de documento fiscal (factura, rectificativa...) del país. */
  documentTypes?: PackDocumentType[];
  legalTexts?: PackLegalText[];
}
