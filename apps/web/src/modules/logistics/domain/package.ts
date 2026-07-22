export interface Package {
  id: string;
  code: string;
  status: 'open' | 'sealed' | 'shipped' | 'delivered' | 'returned';
  boxItemId: string | null;
  stagingAreaId: string | null;
  shipmentId: string | null;
  weightKg: number | null;
  sealedAt?: string | null;
  [key: string]: unknown;
}

export interface PackageLine {
  id: string;
  packageId: string;
  itemId: string;
  quantity: number;
  sourceLineId: string | null;
}
