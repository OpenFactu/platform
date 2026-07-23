export interface Vehicle {
  id: string;
  code: string;
  plate: string;
  brand: string | null;
  model: string | null;
  capacityKg: number | null;
  capacityM3: number | null;
  status: 'active' | 'maintenance' | 'retired';
  defaultDriverEmployeeId: string | null;
  notes: string | null;
  archivedAt: string | null;
}
