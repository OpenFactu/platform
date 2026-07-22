export interface PartnerAddress {
  id?: string;
  name: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
  /** 'B' facturación · 'S' envío. */
  type: string;
  isDefault: boolean;
  countryCode?: string;
  subRegionId?: string | number | null;
  localityId?: string | number | null;
  [key: string]: unknown;
}

export interface Partner {
  id: string;
  code?: string | null;
  name: string;
  foreignName?: string | null;
  nif?: string | null;
  groupId?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  priceListId?: string | null;
  countryCode?: string | null;
  defaultDocumentTypeId?: string | null;
  defaultPaymentMethodId?: string | null;
  defaultPaymentTermId?: string | null;
  defaultWithholdingRate?: number | string | null;
  iban?: string | null;
  bankName?: string | null;
  bankSwift?: string | null;
  addresses?: PartnerAddress[];
  [key: string]: unknown;
}

export interface PartnerGroup {
  id: string;
  name: string;
  code?: string | null;
  [key: string]: unknown;
}
