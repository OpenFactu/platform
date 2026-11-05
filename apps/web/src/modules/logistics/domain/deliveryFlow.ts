/**
 * Cómo reparte la empresa, tal y como lo manda el servidor (`core/logistics/deliveryFlow.ts`,
 * que es quien tiene las reglas). Los valores de aquí solo cubren el rato antes de recibirlo.
 */
export type Requirement = 'off' | 'optional' | 'required';
export type PackageCheck = 'off' | 'check' | 'scan';
export type ReasonKind = 'postpone' | 'incident';
export type Handover = 'customer' | 'other' | 'concierge' | 'neighbor' | 'safePlace';
export type NavigationApp = 'google' | 'waze' | 'apple';
export type MapProvider = 'standard' | 'light' | 'dark' | 'mono' | 'custom';
export type MapView = 'standard' | 'satellite';

export const HANDOVERS: Handover[] = ['customer', 'other', 'concierge', 'neighbor', 'safePlace'];

export interface StopReason {
  id: string;
  kind: ReasonKind;
  enabled: boolean;
  /** Solo en los motivos propios de la empresa; los de serie llevan su traducción. */
  label?: string;
}

export interface MapSettings {
  provider: MapProvider;
  /** En la configuración, con `{key}`; los mapas la reciben ya completa. */
  tileUrl: string;
  /** Solo llega a la configuración. */
  apiKey: string;
  attribution: string;
  maxZoom: number | null;
  satelliteUrl: string;
  satellite: boolean;
  defaultStyle: MapView;
  navigationApp: NavigationApp;
}

export interface DeliveryFlow {
  loadOut: PackageCheck;
  loadOutRequired: boolean;
  packageCheck: PackageCheck;
  arrive: boolean;
  handover: Handover[];
  signature: Requirement;
  allowDocument: boolean;
  photo: Requirement;
  stagingDrop: boolean;
  reasons: StopReason[];
  map: MapSettings;
}

export const DEFAULT_MAP_SETTINGS: MapSettings = {
  provider: 'standard',
  tileUrl: '',
  apiKey: '',
  attribution: '',
  maxZoom: null,
  satelliteUrl: '',
  satellite: true,
  defaultStyle: 'satellite',
  navigationApp: 'google',
};

export const DEFAULT_DELIVERY_FLOW: DeliveryFlow = {
  loadOut: 'check',
  loadOutRequired: false,
  packageCheck: 'check',
  arrive: true,
  handover: ['customer', 'other'],
  signature: 'required',
  allowDocument: true,
  photo: 'optional',
  stagingDrop: true,
  reasons: [
    { id: 'nobody', kind: 'postpone', enabled: true },
    { id: 'otherDay', kind: 'postpone', enabled: true },
    { id: 'noTime', kind: 'postpone', enabled: true },
    { id: 'wrongAddress', kind: 'incident', enabled: true },
    { id: 'refused', kind: 'incident', enabled: true },
    { id: 'damaged', kind: 'incident', enabled: true },
    { id: 'missingPackage', kind: 'incident', enabled: true },
    { id: 'other', kind: 'incident', enabled: true },
  ],
  map: DEFAULT_MAP_SETTINGS,
};
