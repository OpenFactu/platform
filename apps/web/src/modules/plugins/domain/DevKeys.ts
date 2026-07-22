export interface DevKey {
  id: string;
  clientId: string;
  name: string;
  permissions: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}
