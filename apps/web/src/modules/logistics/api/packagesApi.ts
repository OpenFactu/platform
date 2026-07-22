import { apiClient } from '@/shared/http';
import type { Package, PackageLine } from '../domain/package';

export type PackageInput = Record<string, unknown>;

export const packagesApi = {
  list: () => apiClient.get<Package[]>('/api/logistics/packages'),
  /** Nota: no existe GET /packages/:id single en el server; se conserva el
   *  mismo comportamiento previo (usado al escanear un QR de paquete). */
  get: (id: string) => apiClient.get<Package>(`/api/logistics/packages/${id}`),
  create: (data: PackageInput) => apiClient.post<Package>('/api/logistics/packages', data),
  update: (id: string, data: PackageInput) =>
    apiClient.patch<Package>(`/api/logistics/packages/${id}`, data),
  remove: (id: string) => apiClient.delete<void>(`/api/logistics/packages/${id}`),

  listLines: (packageId: string) =>
    apiClient.get<PackageLine[]>(`/api/logistics/packages/${packageId}/lines`),
  addLine: (packageId: string, data: { itemId: string; quantity: number }) =>
    apiClient.post<PackageLine>(`/api/logistics/packages/${packageId}/lines`, data),
  removeLine: (packageId: string, lineId: string) =>
    apiClient.delete<void>(`/api/logistics/packages/${packageId}/lines/${lineId}`),
};
