export interface BrandingConfig {
  colorPrimary: string;
  colorAccent: string;
  logoUrl: string;
  appName: string;
  fontFamily: 'sans' | 'serif' | 'mono';
  themeMode: 'light' | 'dark';
}

export interface FormatConfig {
  locale: string;
  dateFormat: string;
  decimalPrecision: number;
  quantityPrecision: number;
}

export interface FlagsConfig {
  allowNegativeStock: boolean;
  autoConfirmBatches: boolean;
  watermarkDraft: boolean;
  /** Añade la marca de agua "PAGADA" a los PDFs de facturas ya cobradas. */
  watermarkPaid: boolean;
  confirmBeforeCancel: boolean;
  enforceWarehouseZones: boolean;
  /** Dónde se captura el almacén en documentos con movimiento de stock.
   *  `'header'` — un almacén único para todo el documento (default).
   *  `'line'` — cada línea lleva su almacén + ubicación. */
  warehouseLocation: 'header' | 'line';
  /** Activa el módulo de logística / seguimiento de envíos y rutas.
   *  Cuando está false, nada del menú de logística aparece. */
  logisticsEnabled: boolean;
  /** Activa el chat de Keiro en la página pública de seguimiento
   *  (/track/:token, sin login). Off por defecto: es una superficie nueva,
   *  pública y con coste de IA — cada tenant lo activa explícitamente. */
  trackingChatEnabled: boolean;
  /** Modo "sólo logística" — oculta ventas, compras, contabilidad, RRHH y
   *  analítica. Útil para clientes que nos contratan únicamente la logística
   *  sin el resto del ERP. */
  logisticsOnly: boolean;
  /** Sub-módulos de RRHH avanzado. Cada uno es independiente y desbloquea
   *  un menú/ruta distinta sobre el módulo HR base. */
  hrShiftsEnabled: boolean;
  hrTimeclockEnabled: boolean;
  hrIncidentsEnabled: boolean;
  hrPlanningEnabled: boolean;
  /** RRHH avanzado+ : convenios, evaluaciones, comisiones, rendimiento,
   *  coste laboral, tareas y Gantt. */
  hrAdvancedEnabled: boolean;
}

export const BRANDING_DEFAULTS: BrandingConfig = {
  colorPrimary: '#0A1628',
  colorAccent: '#0D9488',
  logoUrl: '',
  appName: 'Keirost',
  fontFamily: 'sans',
  themeMode: 'light',
};

export const FORMAT_DEFAULTS: FormatConfig = {
  locale: 'es-ES',
  dateFormat: 'dd/MM/yyyy',
  decimalPrecision: 2,
  quantityPrecision: 2,
};

export const FLAGS_DEFAULTS: FlagsConfig = {
  allowNegativeStock: false,
  autoConfirmBatches: false,
  watermarkDraft: true,
  watermarkPaid: false,
  confirmBeforeCancel: true,
  enforceWarehouseZones: false,
  warehouseLocation: 'header',
  logisticsEnabled: false,
  trackingChatEnabled: false,
  logisticsOnly: false,
  hrShiftsEnabled: false,
  hrTimeclockEnabled: false,
  hrIncidentsEnabled: false,
  hrPlanningEnabled: false,
  hrAdvancedEnabled: false,
};

/**
 * Ajustes del despliegue de la app (URL pública, etc.). Se fija en el
 * SetupWizard y es editable desde Ajustes → Empresa.
 */
export interface AppConfig {
  /** URL base pública desde la que los clientes finales abrirán enlaces
   *  (emails de tracking, webhooks externos, etc.). */
  publicBaseUrl: string;
}

export const APP_DEFAULTS: AppConfig = {
  publicBaseUrl: '',
};

export type ConfigSectionName = 'branding' | 'format' | 'flags' | 'app';
