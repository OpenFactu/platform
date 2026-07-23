export interface Department {
  id: string;
  code: string;
  name: string;
  parentId?: string | null;
  costCenterId?: string | null;
  [key: string]: unknown;
}
