/** Coste del artículo: lo calcula el servidor, aquí solo se decide qué enseñar. */
export interface ItemCostMovement {
  id: string;
  kind: string;
  quantity: string | number;
  unitCost: string | number;
  costBefore: string | number;
  costAfter: string | number;
  createdAt: string;
}

interface PermissionUser {
  role?: string;
  permissions?: Record<string, { read?: boolean; write?: boolean } | undefined>;
}

const isAdmin = (user?: PermissionUser | null) =>
  user?.role === 'SUPERUSER' || user?.role === 'ADMIN';

export const canSeeItemCosts = (user?: PermissionUser | null) =>
  isAdmin(user) || !!user?.permissions?.['/item-costs']?.read;

/** Poner coste a una entrada manual mueve la media, así que pide escritura. */
export const canSetItemCosts = (user?: PermissionUser | null) =>
  isAdmin(user) || !!user?.permissions?.['/item-costs']?.write;

export const stockValue = (stock: unknown, cost: unknown) => Number(stock || 0) * Number(cost || 0);
