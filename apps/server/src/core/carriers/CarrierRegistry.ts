import type { ICarrierAdapter } from './ICarrierAdapter';

/**
 * Registro en memoria de adapters de transportista disponibles.
 *
 * Módulos (incluso plugins externos) pueden llamar a `register()` al arranque
 * para añadir sus adapters al catálogo. El `id` del adapter es la clave —
 * un `Carrier` tiene `adapterId = <id>` para enlazar con él.
 */

class Registry {
  private readonly map = new Map<string, ICarrierAdapter>();

  register(adapter: ICarrierAdapter) {
    if (this.map.has(adapter.id)) {
      console.warn(`[CarrierRegistry] adapter "${adapter.id}" ya registrado, sobrescribiendo`);
    }
    this.map.set(adapter.id, adapter);
  }

  /**
   * Registra el adapter sólo si no hay ya uno con ese id. Lo usan los
   * adapters del core para no machacar los que un plugin haya registrado
   * primero — los plugins se cargan antes que `bootstrapCarrierAdapters()`,
   * así que mantienen prioridad con este método.
   */
  registerIfAbsent(adapter: ICarrierAdapter) {
    if (!this.map.has(adapter.id)) {
      this.map.set(adapter.id, adapter);
    }
  }

  get(id: string | null | undefined): ICarrierAdapter | null {
    if (!id) return null;
    return this.map.get(id) || null;
  }

  list(): Array<Pick<ICarrierAdapter, 'id' | 'name' | 'credentialFields' | 'manual'>> {
    return [...this.map.values()].map((a) => ({
      id: a.id,
      name: a.name,
      manual: !!a.manual,
      credentialFields: a.credentialFields,
    }));
  }
}

export const CarrierRegistry = new Registry();
