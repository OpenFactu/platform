export interface Carrier {
  id: string;
  name: string;
  code: string | null;
  logoUrl: string | null;
  isActive: boolean;
  adapterId: string | null;
  notes: string | null;
  [key: string]: unknown;
}

export interface CarrierCredentialField {
  key: string;
  label: string;
  type?: 'text' | 'password' | 'checkbox';
  required?: boolean;
  placeholder?: string;
}

/** Adapter del core disponible para conectar un carrier (Seur, DHL...). */
export interface CarrierAdapterInfo {
  id: string;
  name: string;
  /** Sin API detrás: el número lo escribe quien despacha. */
  manual: boolean;
  credentialFields: CarrierCredentialField[];
}

export interface CarrierAccount {
  id: string;
  carrierId: string;
  name: string;
  sandbox: boolean;
  isDefault: boolean;
  credentials: Record<string, unknown>;
}

export interface CarrierTestResult {
  ok: boolean;
  manual?: boolean;
  message?: string;
  error?: string;
}

/** Una cuenta entre las que elegir al despachar, sin sus credenciales. */
export interface CarrierAccountOption {
  id: string;
  name: string;
  isDefault: boolean;
  carrierName: string;
  manual: boolean;
}
