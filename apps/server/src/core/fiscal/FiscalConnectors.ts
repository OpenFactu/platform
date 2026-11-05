/**
 * Conectores fiscales: firma, encadenado y envío a la administración de cada
 * país. El núcleo solo sabe cuándo avisar y dónde guardar el resultado (los
 * campos `fiscal*` de la factura); el protocolo es cosa del plugin.
 */
import { TenantScopedRegistry } from '../plugins/TenantScopedRegistry';

export interface FiscalResult {
  fiscalHash?: string | null;
  fiscalHashPrev?: string | null;
  fiscalStatus?: string | null;
  fiscalRef?: string | null;
  fiscalSentAt?: Date | null;
}

export interface FiscalContext {
  tenantId: string;
  /** Transacción abierta: si el conector lanza, el documento no se asienta. */
  db: any;
  user: any;
  docType: string;
  side: 'sales' | 'purchase';
  document: any;
  lines: any[];
  /** En un abono, la factura que corrige: su número, fecha y campos fiscales. */
  rectifies?: any;
}

export interface FiscalConnector {
  id: string;
  name: string;
  /** Al asentar. Lo que devuelva se guarda en la factura. */
  onPost?: (ctx: FiscalContext) => Promise<FiscalResult | void> | FiscalResult | void;
  /** Al cancelar una factura ya asentada. */
  onCancel?: (ctx: FiscalContext) => Promise<FiscalResult | void> | FiscalResult | void;
}

const connectors = new TenantScopedRegistry<FiscalConnector>();

export const FiscalConnectors = {
  register(pluginId: string, connector: FiscalConnector): void {
    if (!connector?.id) throw new Error(`[Plugin ${pluginId}] fiscal.registerConnector: falta id`);
    connectors.add(pluginId, connector);
  },

  activeFor(tenantId: string | undefined): FiscalConnector[] {
    return connectors.activeFor(tenantId);
  },

  /** Solo para los tests. */
  clear(): void {
    connectors.clear();
  },
};
