import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, Loader, useToast, SearchableSelect } from '@openfactu/ui';
import { useAuth } from '@/context/AuthContext';
import {
  UserPlus,
  Mail,
  ShieldCheck,
  Lock,
  Building2,
  ChevronDown,
  ChevronUp,
  Plus,
  X,
  Settings,
  BookOpen,
  Users as UsersIcon,
  ShoppingCart,
  TrendingUp,
  Calendar,
  Eye,
  EyeOff,
  KeyRound,
  Pencil,
  AlertTriangle,
  UsersRound,
  Route,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { UsersTable } from '../components/UsersTable';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PermSet = { read: boolean; write: boolean; delete: boolean };
type Permissions = Record<string, PermSet>;

type MembershipEntry = {
  id?: string;
  tenantId: string;
  tenantName?: string;
  role: 'USER' | 'ADMIN' | 'DRIVER';
  permissions: Permissions;
  isNew?: boolean;
  isDeleted?: boolean;
  expanded?: boolean;
};

// ─── Grupos de permisos ───────────────────────────────────────────────────────

const PERMISSION_GROUPS = [
  {
    group: 'Sistema',
    icon: Settings,
    items: [
      { label: 'Dashboard', path: '/dashboard' },
      { label: 'Plugins', path: '/plugins' },
      { label: 'Usuarios', path: '/users' },
      { label: 'Auditoría', path: '/audit-logs' },
    ],
  },
  {
    group: 'Catálogos',
    icon: BookOpen,
    items: [
      { label: 'Artículos', path: '/items' },
      { label: 'Categorías', path: '/categories' },
      { label: 'Unidades', path: '/uom' },
      { label: 'Tarifas', path: '/pricelists' },
      { label: 'Almacenes', path: '/warehouses' },
      { label: 'Impuestos', path: '/taxes' },
    ],
  },
  {
    group: 'Terceros',
    icon: UsersIcon,
    items: [
      { label: 'Grupos', path: '/partner-groups' },
      { label: 'Directorio', path: '/partners' },
    ],
  },
  {
    group: 'Compras',
    icon: ShoppingCart,
    items: [
      { label: 'Pedidos', path: '/purchase-orders' },
      { label: 'Albaranes', path: '/purchases/delivery-notes' },
      { label: 'Facturas', path: '/purchases/invoices' },
    ],
  },
  {
    group: 'Ventas',
    icon: TrendingUp,
    items: [
      { label: 'Pedidos', path: '/sales-orders' },
      { label: 'Albaranes', path: '/sales/delivery-notes' },
      { label: 'Facturas', path: '/sales/invoices' },
    ],
  },
  {
    group: 'Contabilidad',
    icon: Calendar,
    items: [
      { label: 'Periodos', path: '/accounting-periods' },
      { label: 'Series Doc.', path: '/document-series' },
    ],
  },
  {
    group: 'Recursos Humanos',
    icon: UsersRound,
    items: [
      { label: 'Empleados', path: '/hr/employees' },
      { label: 'Departamentos', path: '/hr/departments' },
      { label: 'Nóminas', path: '/hr/payrolls' },
      { label: 'Conceptos nómina', path: '/hr/payroll-concepts' },
      { label: 'Tipos de incidencia', path: '/hr/incident-types' },
      { label: 'Incidencias', path: '/hr/incidents' },
      { label: 'Plantillas de turno', path: '/hr/shift-templates' },
      { label: 'Patrones de turno', path: '/hr/shift-patterns' },
      { label: 'Planificación', path: '/hr/planning' },
      { label: 'Fichajes', path: '/hr/timeclock' },
      { label: 'Kioskos de fichaje', path: '/hr/kiosks' },
    ],
  },
  {
    group: 'RRHH avanzado+',
    icon: UsersRound,
    items: [
      { label: 'Convenios colectivos', path: '/hr/collective-agreements' },
      { label: 'Evaluaciones', path: '/hr/evaluations' },
      { label: 'Objetivos', path: '/hr/objectives' },
      { label: 'Comisiones', path: '/hr/commissions' },
      { label: 'Rendimiento', path: '/hr/performance' },
      { label: 'Coste laboral', path: '/hr/labor-cost' },
      { label: 'Tareas', path: '/hr/tasks' },
      { label: 'Gantt', path: '/hr/gantt' },
    ],
  },
  {
    group: 'Logística',
    icon: Route,
    items: [
      { label: 'Envíos', path: '/logistics/shipments' },
      { label: 'Rutas', path: '/logistics/routes' },
      { label: 'Transportistas', path: '/logistics/carriers' },
      { label: 'Zonas de almacén', path: '/logistics/zones' },
      { label: 'Movimientos de stock', path: '/logistics/stock-movements' },
    ],
  },
];

const EMPTY_PERM: PermSet = { read: false, write: false, delete: false };

const defaultPermissions = (): Permissions => {
  const perms: Permissions = {};
  PERMISSION_GROUPS.forEach((g) =>
    g.items.forEach((i) => {
      perms[i.path] = { ...EMPTY_PERM };
    }),
  );
  return perms;
};

// ─── Sub-componentes ──────────────────────────────────────────────────────────

const PermToggle: React.FC<{
  active: boolean;
  color: 'emerald' | 'blue' | 'rose';
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}> = ({ active, color, label, icon, disabled, onChange }) => {
  const activeClass = {
    emerald:
      'bg-emerald-100 dark:bg-emerald-500/25 text-emerald-700 dark:text-emerald-200 ring-1 ring-emerald-300 dark:ring-emerald-500/50',
    blue: 'bg-accent/15 dark:bg-accent/30 text-accent dark:text-accent ring-1 ring-accent/40 dark:ring-accent/60',
    rose: 'bg-rose-100 dark:bg-rose-500/25 text-rose-700 dark:text-rose-200 ring-1 ring-rose-300 dark:ring-rose-500/50',
  }[color];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!active)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[10px] font-bold uppercase tracking-wide transition-all
 ${active ? activeClass : 'bg-line-2 dark:bg-ink-800 text-ink-500 dark:text-slate-300 ring-1 ring-line dark:ring-ink-700 hover:text-accent dark:hover:text-accent'}
 ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:opacity-90 active:scale-95'}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-current' : 'bg-ink-400 dark:bg-ink-500'}`}
      />
      {icon}
      {label}
    </button>
  );
};

const PermissionsEditor: React.FC<{
  permissions: Permissions;
  disabled?: boolean;
  onChange: (p: Permissions) => void;
}> = ({ permissions, disabled, onChange }) => {
  const togglePerm = (path: string, key: keyof PermSet, value: boolean) => {
    onChange({ ...permissions, [path]: { ...(permissions[path] || EMPTY_PERM), [key]: value } });
  };

  const toggleGroup = (
    group: (typeof PERMISSION_GROUPS)[0],
    key: keyof PermSet,
    value: boolean,
  ) => {
    const next = { ...permissions };
    group.items.forEach((i) => {
      next[i.path] = { ...(next[i.path] || EMPTY_PERM), [key]: value };
    });
    onChange(next);
  };

  const allGroupActive = (group: (typeof PERMISSION_GROUPS)[0], key: keyof PermSet) =>
    group.items.every((i) => permissions[i.path]?.[key]);

  return (
    <div className="space-y-3 pt-2">
      {PERMISSION_GROUPS.map((group) => {
        const Icon = group.icon;
        return (
          <div
            key={group.group}
            className="border border-line dark:border-ink-700 rounded-sm overflow-hidden"
          >
            {/* Header del grupo */}
            <div className="flex items-center justify-between px-3 py-2 bg-line-2 dark:bg-ink-800">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-ink-700 dark:text-slate-200 uppercase tracking-widest">
                <Icon size={11} />
                {group.group}
              </span>
              <div className="flex gap-1">
                {(['read', 'write', 'delete'] as (keyof PermSet)[]).map((key) => {
                  const all = allGroupActive(group, key);
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleGroup(group, key, !all)}
                      className={`px-2 py-0.5 rounded-xs text-[9px] font-bold uppercase transition-all
 ${
   all
     ? {
         read: 'bg-emerald-500 text-white shadow-sm',
         write: 'bg-accent text-white shadow-sm',
         delete: 'bg-rose-500 text-white shadow-sm',
       }[key]
     : 'bg-white dark:bg-ink-900 text-ink-500 dark:text-slate-300 border border-line dark:border-ink-700 hover:text-accent hover:border-accent/40'
 }
 ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                    >
                      {key === 'read' ? 'Ver' : key === 'write' ? 'Crear' : 'Borrar'}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Filas de ítems */}
            <div className="divide-y divide-line dark:divide-ink-700 bg-white dark:bg-ink-900">
              {group.items.map((item) => {
                const p = permissions[item.path] || EMPTY_PERM;
                return (
                  <div key={item.path} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-xs text-ink-700 dark:text-slate-200 font-medium">
                      {item.label}
                    </span>
                    <div className="flex gap-1.5">
                      <PermToggle
                        active={p.read}
                        color="emerald"
                        label="Ver"
                        icon={<Eye size={9} />}
                        disabled={disabled}
                        onChange={(v) => togglePerm(item.path, 'read', v)}
                      />
                      <PermToggle
                        active={p.write}
                        color="blue"
                        label="Crear"
                        icon={<Pencil size={9} />}
                        disabled={disabled}
                        onChange={(v) => togglePerm(item.path, 'write', v)}
                      />
                      <PermToggle
                        active={p.delete}
                        color="rose"
                        label="Borrar"
                        icon={<AlertTriangle size={9} />}
                        disabled={disabled}
                        onChange={(v) => togglePerm(item.path, 'delete', v)}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ─── Componente principal ─────────────────────────────────────────────────────

export const Users: React.FC = () => {
  const { token, user: currentUser } = useAuth();
  const location = useLocation();
  const canWrite =
    currentUser?.role === 'SUPERUSER' ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.permissions?.[location.pathname]?.write;
  const canDelete =
    currentUser?.role === 'SUPERUSER' ||
    currentUser?.role === 'ADMIN' ||
    currentUser?.permissions?.[location.pathname]?.delete;
  const isPrivileged = currentUser?.role === 'SUPERUSER' || currentUser?.role === 'ADMIN';

  const toast = useToast();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Campos identidad
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [globalRole, setGlobalRole] = useState('USER');

  // Genera una contraseña robusta y la revela para que el admin la copie.
  // Sirve como "resetear contraseña" al editar un usuario existente.
  const generatePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    const pwd = Array.from(bytes, (b) => chars[b % chars.length]).join('');
    setPassword(pwd);
    setShowPassword(true);
  };

  // Memberships
  const [memberships, setMemberships] = useState<MembershipEntry[]>([]);
  const [allTenants, setAllTenants] = useState<{ id: string; name: string }[]>([]);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await coreApi.raw('GET', '/api/users');
      setUsers(res.data);
    } catch {
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  const fetchTenants = async () => {
    try {
      const data = await coreApi.get('/api/auth/tenants');
      if (Array.isArray(data)) setAllTenants(data);
    } catch {}
  };

  useEffect(() => {
    fetchUsers();
    fetchTenants();
  }, []);

  // ── Formulario ─────────────────────────────────────────────────────────────

  const resetForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setUsername('');
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setGlobalRole('USER');
    setMemberships([]);
  };

  const startEdit = async (u: any) => {
    setEditingUser(u);
    setUsername(u.username);
    setEmail(u.email);
    setPassword('');
    setGlobalRole(u.role);

    try {
      const res = await coreApi.raw('GET', `/api/memberships?userId=${u.id}`);
      const data = res.data;
      setMemberships(
        data.map((m: any) => ({
          id: m.id,
          tenantId: m.tenantId,
          tenantName: m.tenantName,
          role: m.role,
          permissions: m.permissions ? JSON.parse(m.permissions) : defaultPermissions(),
          isNew: false,
          isDeleted: false,
          expanded: false,
        })),
      );
    } catch {
      setMemberships([]);
    }

    setShowForm(true);
  };

  const addMembership = () => {
    const usedTenants = memberships.filter((m) => !m.isDeleted).map((m) => m.tenantId);
    const available = allTenants.find((t) => !usedTenants.includes(t.id));
    if (!available) return toast.error('Ya has asignado todas las empresas disponibles');
    setMemberships((prev) => [
      ...prev,
      {
        tenantId: available.id,
        tenantName: available.name,
        role: 'USER',
        permissions: defaultPermissions(),
        isNew: true,
        isDeleted: false,
        expanded: true,
      },
    ]);
  };

  const updateMembership = (idx: number, patch: Partial<MembershipEntry>) => {
    setMemberships((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        const updated = { ...m, ...patch };
        // Al cambiar tenant, actualizar tenantName
        if (patch.tenantId)
          updated.tenantName = allTenants.find((t) => t.id === patch.tenantId)?.name;
        return updated;
      }),
    );
  };

  const removeMembership = (idx: number) => {
    setMemberships((prev) =>
      prev.map((m, i) => {
        if (i !== idx) return m;
        if (m.isNew) return { ...m, isDeleted: true }; // se filtrará al renderizar
        return { ...m, isDeleted: true };
      }),
    );
  };

  // ── Guardar ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      // 1. Guardar identidad del usuario
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PATCH' : 'POST';
      const payload: any = { username, email, role: globalRole };
      if (password) payload.password = password;

      const savedUser: any = await coreApi.raw(method, url, payload).then((r) => {
        if (!r.ok) throw new Error(r.data?.error || 'Error al guardar usuario');
        return r.data;
      });
      const userId = savedUser.id || editingUser?.id;

      // 2. Procesar memberships
      for (const m of memberships) {
        const permStr = JSON.stringify(m.permissions);
        if (m.isNew && !m.isDeleted) {
          await coreApi.raw('POST', '/api/memberships', {
              userId,
              tenantId: m.tenantId,
              role: m.role,
              permissions: permStr,
            });
        } else if (!m.isNew && m.isDeleted && m.id) {
          await coreApi.raw('DELETE', `/api/memberships/${m.id}`);
        } else if (!m.isNew && !m.isDeleted && m.id) {
          await coreApi.raw('PATCH', `/api/memberships/${m.id}`, { role: m.role, permissions: permStr });
        }
      }

      toast.success(editingUser ? 'Usuario actualizado' : 'Usuario creado');
      resetForm();
      fetchUsers();
    } catch (err) {
      toast.error((err instanceof Error ? err.message : undefined) || 'Error de conexión');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
    try {
      const res = await coreApi.raw('DELETE', `/api/users/${id}`);
      if (res.ok) {
        fetchUsers();
        toast.success('Usuario eliminado');
      }
    } catch {
      toast.error('Fallo al eliminar');
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  const visibleMemberships = memberships.filter((m) => !m.isDeleted || (m.isDeleted && !m.isNew));
  const activeMemberships = memberships.filter((m) => !m.isDeleted);

  return (
    <div className="p-4 space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-blue-600 rounded-lg text-white">
              <UsersIcon size={20} />
            </span>
            <span className="text-[10px] font-black text-blue-600 dark:text-blue-300 uppercase tracking-[0.2em]">
              Gestión Central
            </span>
          </div>
          <h1 className="text-4xl font-black text-slate-900 dark:text-slate-100 tracking-tight">
            Usuarios
          </h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium">
            Gestiona accesos, roles y permisos por empresa.
          </p>
        </div>
        {!showForm && (
          <Button
            onClick={() => setShowForm(true)}
            disabled={!canWrite}
            className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
          >
            <UserPlus size={18} /> Nuevo Usuario
          </Button>
        )}
      </header>

      {/* Formulario */}
      {showForm && (
        <Card className="border-0">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-slate-900 dark:text-slate-100">
              {editingUser ? `Editando: ${editingUser.username}` : 'Nuevo Usuario'}
            </h2>
            <button
              onClick={resetForm}
              className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Identidad */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  Nombre de Usuario
                </label>
                <Input
                  type="text"
                  placeholder="jdoe"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                  <Mail size={10} className="inline mr-1" />
                  Email
                </label>
                <Input
                  type="email"
                  placeholder="ejemplo@empresa.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                    {editingUser ? 'Nueva Contraseña (vacío = no cambiar)' : 'Contraseña'}
                  </label>
                  <button
                    type="button"
                    onClick={generatePassword}
                    className="inline-flex items-center gap-1 text-[10px] font-black text-accent hover:text-accent/80 uppercase tracking-widest"
                  >
                    <KeyRound size={11} /> Generar
                  </button>
                </div>
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required={!editingUser}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-accent transition-colors"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {editingUser && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">
                    Escribe o genera una nueva contraseña para restablecer el acceso del usuario.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <ShieldCheck
                    size={11}
                    className={
                      isPrivileged
                        ? 'text-blue-500 dark:text-blue-300'
                        : 'text-slate-300 dark:text-slate-600'
                    }
                  />
                  Rol Global {!isPrivileged && <Lock size={9} className="text-rose-400" />}
                </label>
                {isPrivileged ? (
                  <SearchableSelect
                    value={globalRole}
                    onChange={(v) => setGlobalRole(v)}
                    options={[
                      { label: 'Usuario estándar', value: 'USER' },
                      { label: 'Administrador', value: 'ADMIN' },
                      ...(currentUser?.role === 'SUPERUSER'
                        ? [{ label: 'Superadministrador', value: 'SUPERUSER' }]
                        : []),
                    ]}
                  />
                ) : (
                  <div className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg py-2 px-3 text-sm text-slate-500 dark:text-slate-400 font-bold">
                    {globalRole === 'USER'
                      ? 'Usuario estándar'
                      : globalRole === 'ADMIN'
                        ? 'Administrador'
                        : globalRole === 'DRIVER'
                          ? 'Conductor (Reparto)'
                          : globalRole === 'SUPERUSER'
                            ? 'Superadministrador'
                            : globalRole}
                  </div>
                )}
              </div>
            </div>

            {/* Memberships de empresa */}
            <div className="space-y-4 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                    Acceso a Empresas
                  </h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold mt-0.5">
                    {activeMemberships.length === 0
                      ? 'Sin empresas asignadas — este usuario no podrá iniciar sesión'
                      : `${activeMemberships.length} empresa${activeMemberships.length > 1 ? 's' : ''} asignada${activeMemberships.length > 1 ? 's' : ''}`}
                  </p>
                </div>
                {isPrivileged && globalRole !== 'SUPERUSER' && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={addMembership}
                    className="gap-1.5"
                  >
                    <Plus size={14} /> Añadir Empresa
                  </Button>
                )}
              </div>

              {globalRole === 'SUPERUSER' && (
                <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-500/5 border border-amber-100 dark:border-amber-500/30 rounded-xl text-amber-700 dark:text-amber-200">
                  <ShieldCheck size={18} className="shrink-0" />
                  <p className="text-sm font-bold">
                    Los SUPERUSER tienen acceso global a todas las empresas sin necesidad de
                    asignación.
                  </p>
                </div>
              )}

              {activeMemberships.length === 0 && globalRole !== 'SUPERUSER' && (
                <div className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-200 dark:border-slate-700 rounded-xl text-slate-400 dark:text-slate-500">
                  <Building2 size={18} className="shrink-0" />
                  <p className="text-sm font-medium">
                    Pulsa"Añadir Empresa"para asignar acceso a una empresa.
                  </p>
                </div>
              )}

              <div className="space-y-3">
                {memberships.map((m, idx) => {
                  if (m.isDeleted && m.isNew) return null;
                  if (m.isDeleted)
                    return (
                      <div
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-rose-50 dark:bg-rose-500/5 border border-rose-100 dark:border-rose-500/30 rounded-xl opacity-60"
                      >
                        <span className="text-xs text-rose-600 dark:text-rose-300 font-bold line-through">
                          {m.tenantName}
                        </span>
                        <span className="text-[10px] text-rose-500 font-black uppercase">
                          Se eliminará al guardar
                        </span>
                        <button
                          type="button"
                          className="ml-auto text-rose-400 hover:text-rose-600 dark:hover:text-rose-300"
                          onClick={() => updateMembership(idx, { isDeleted: false })}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    );

                  const usedTenantIds = memberships
                    .filter((mm, ii) => ii !== idx && !mm.isDeleted)
                    .map((mm) => mm.tenantId);

                  return (
                    <div
                      key={idx}
                      className={`border rounded-sm overflow-hidden transition-all ${m.isNew ? 'border-accent/40 bg-accent/5' : 'border-line dark:border-ink-700 bg-white dark:bg-ink-900'}`}
                    >
                      {/* Cabecera de la membership */}
                      <div className="flex items-center gap-3 p-4">
                        <div
                          className={`w-9 h-9 rounded-xs flex items-center justify-center ${m.isNew ? 'bg-accent/15 text-accent' : 'bg-line-2 dark:bg-ink-800 text-ink-700 dark:text-slate-200'}`}
                        >
                          <Building2 size={18} />
                        </div>

                        {/* Selector de empresa */}
                        <select
                          value={m.tenantId}
                          onChange={(e) => updateMembership(idx, { tenantId: e.target.value })}
                          disabled={!isPrivileged}
                          className="flex-1 bg-transparent border-0 text-sm font-bold text-ink-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent/30 rounded-xs px-2 py-1 disabled:cursor-not-allowed"
                        >
                          {allTenants
                            .filter((t) => !usedTenantIds.includes(t.id) || t.id === m.tenantId)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                        </select>

                        {/* Rol de membership */}
                        <select
                          value={m.role}
                          onChange={(e) =>
                            updateMembership(idx, {
                              role: e.target.value as 'USER' | 'ADMIN' | 'DRIVER',
                            })
                          }
                          disabled={!isPrivileged}
                          className="bg-white dark:bg-ink-900 border border-line dark:border-ink-700 rounded-xs py-1.5 px-2 text-xs font-bold text-ink-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:bg-line-2 dark:disabled:bg-ink-800"
                        >
                          <option value="USER">USER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="DRIVER">DRIVER</option>
                        </select>

                        {/* Toggle permisos */}
                        {m.role === 'USER' && (
                          <button
                            type="button"
                            onClick={() => updateMembership(idx, { expanded: !m.expanded })}
                            className="p-2 text-slate-400 dark:text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all"
                            title="Configurar permisos"
                          >
                            {m.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </button>
                        )}
                        {m.role === 'ADMIN' && (
                          <span className="text-[10px] font-black text-blue-600 dark:text-blue-300 uppercase bg-blue-50 dark:bg-blue-500/10 px-2 py-1 rounded-lg">
                            Acceso Total
                          </span>
                        )}

                        {/* Eliminar */}
                        {isPrivileged && (
                          <button
                            type="button"
                            onClick={() => removeMembership(idx)}
                            className="p-2 text-slate-300 dark:text-slate-600 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-all"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>

                      {/* Panel de permisos expandido */}
                      {m.role === 'USER' && m.expanded && (
                        <div className="px-4 pb-4 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex justify-end gap-2 pt-3 pb-1">
                            <button
                              type="button"
                              disabled={!isPrivileged}
                              onClick={() => {
                                const all = defaultPermissions();
                                Object.keys(all).forEach((p) => {
                                  all[p] = { read: true, write: true, delete: true };
                                });
                                updateMembership(idx, { permissions: all });
                              }}
                              className="text-[10px] font-black text-blue-600 dark:text-blue-300 hover:underline disabled:opacity-40"
                            >
                              Activar Todo
                            </button>
                            <span className="text-slate-300 dark:text-slate-600">|</span>
                            <button
                              type="button"
                              disabled={!isPrivileged}
                              onClick={() =>
                                updateMembership(idx, { permissions: defaultPermissions() })
                              }
                              className="text-[10px] font-black text-slate-400 dark:text-slate-500 hover:underline disabled:opacity-40"
                            >
                              Limpiar
                            </button>
                          </div>
                          <PermissionsEditor
                            permissions={m.permissions}
                            disabled={!isPrivileged}
                            onChange={(p) => updateMembership(idx, { permissions: p })}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Acciones */}
            <div className="flex gap-3 justify-end pt-4 border-t border-slate-100 dark:border-slate-800">
              <Button variant="secondary" type="button" onClick={resetForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || !canWrite}>
                {isSubmitting && <Loader size="sm" variant="white" className="mr-2" />}
                {editingUser ? 'Guardar Cambios' : 'Crear Usuario'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Tabla de usuarios */}
      <UsersTable
        users={users}
        loading={loading}
        canWrite={canWrite}
        canDelete={canDelete}
        onEdit={startEdit}
        onDelete={handleDelete}
      />
    </div>
  );
};
