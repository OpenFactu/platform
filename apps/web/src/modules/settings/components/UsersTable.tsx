import React from 'react';
import { Table, Badge, type TableColumn, type RowAction } from '@openfactu/ui';
import { Building2, Edit2, Trash2 } from 'lucide-react';

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface UserRow {
  id: string;
  username: string;
  email: string;
  role: string;
  tenantName?: string | null;
  membershipCount: number;
  avatarImageUrl?: string | null;
}

interface UsersTableProps {
  users: UserRow[];
  loading: boolean;
  canWrite: boolean;
  canDelete: boolean;
  onEdit: (user: UserRow) => void;
  onDelete: (id: string) => void;
}

// ─── Componente ───────────────────────────────────────────────────────────────

/**
 * Tabla de usuarios globales. Extraída de `pages/Users.tsx` y montada sobre el
 * componente `Table` de `@openfactu/ui` para unificar estilo y comportamiento
 * (loading, vacío, hover de fila) con el resto de listados.
 */
export const UsersTable: React.FC<UsersTableProps> = ({
  users,
  loading,
  canWrite,
  canDelete,
  onEdit,
  onDelete,
}) => {
  const columns: TableColumn<UserRow>[] = [
    {
      header: 'Usuario',
      cell: (u) => (
        <div className="flex items-center gap-3 ">
          {u.avatarImageUrl ? (
            <img
              src={u.avatarImageUrl}
              alt={u.username}
              className="w-9 h-9 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-xs font-black text-slate-600 dark:text-slate-200">
              {u.username?.charAt(0).toUpperCase()}
            </div>
          )}
          <span className="font-black text-slate-800 dark:text-slate-100">{u.username}</span>
        </div>
      ),
    },
    {
      header: 'Email',
      cell: (u) => <span className="text-sm text-slate-500 dark:text-slate-400">{u.email}</span>,
    },
    {
      header: 'Rol Global',
      cell: (u) => (
        <Badge
          variant={u.role === 'SUPERUSER' ? 'warning' : u.role === 'ADMIN' ? 'info' : 'neutral'}
        >
          {u.role === 'SUPERUSER' ? '⚡ Superadmin' : u.role === 'ADMIN' ? 'Admin' : 'Usuario'}
        </Badge>
      ),
    },
    {
      header: 'Empresas',
      cell: (u) => {
        if (u.role === 'SUPERUSER') {
          return (
            <span className="text-xs text-amber-600 dark:text-amber-300 font-bold">
              Todas las empresas
            </span>
          );
        }
        if (u.membershipCount > 0) {
          return (
            <div className="flex items-center gap-1.5">
              <Building2 size={13} className="text-slate-400 dark:text-slate-500" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                {u.membershipCount} empresa{u.membershipCount !== 1 ? 's' : ''}
              </span>
            </div>
          );
        }
        if (u.tenantName) {
          return (
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              {u.tenantName}
            </span>
          );
        }
        return <span className="text-xs text-rose-400 font-bold">Sin asignar</span>;
      },
    },
  ];

  // Un solo sitio para las acciones de fila: la Table las ofrece en el botón ⋯
  // del hover y en el menú de click derecho, así que los permisos se declaran
  // una vez en lugar de duplicarse entre una columna de botones y el menú.
  const rowActions = (u: UserRow): RowAction[] => [
    { label: 'Editar', icon: <Edit2 size={14} />, disabled: !canWrite, onClick: () => onEdit(u) },
    ...(u.role !== 'SUPERUSER'
      ? [
          {
            label: 'Eliminar',
            icon: <Trash2 size={14} />,
            destructive: true,
            disabled: !canDelete,
            onClick: () => onDelete(u.id),
          },
        ]
      : []),
  ];

  return (
    <Table
      columns={columns}
      data={users}
      isLoading={loading}
      emptyMessage="No hay usuarios registrados."
      rowKey={(u: UserRow) => u.id}
      rowActions={rowActions}
    />
  );
};
