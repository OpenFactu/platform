import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import {
  Card,
  Badge,
  Button,
  Input,
  PasswordInput,
  Select,
  SearchableSelect,
  Loader,
  PageHeader,
  useToast,
  usePopup,
} from '@openfactu/ui';
import type { PasswordRequirement } from '@openfactu/ui';
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
  Pencil,
  AlertTriangle,
  UsersRound,
  Route,
  FileText,
  FileBarChart,
  PieChart,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { UsersTable } from '../components/UsersTable';
import { permissionsApi, type PermissionGroup } from '../api/permissionsApi';

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
//
// La lista NO vive aquí: se pide a GET /api/permissions/catalog, que es la
// misma que usa el gate de la API. Cuando estuvo escrita en este fichero se
// desincronizó — 27 pantallas exigían permisos que no salían en esta pantalla
// y por tanto nadie podía concederlos.
//
// Lo único local es el icono de cada grupo, que es decoración y no cabe en un
// JSON.
const GROUP_ICONS: Record<string, LucideIcon> = {
  Catálogos: BookOpen,
  Terceros: UsersIcon,
  Ventas: TrendingUp,
  Compras: ShoppingCart,
  Documentos: FileText,
  Contabilidad: Calendar,
  Analítica: PieChart,
  Informes: FileBarChart,
  'Recursos humanos': UsersRound,
  'RRHH avanzado': UsersRound,
  Logística: Route,
  Website: Globe,
  Configuración: Settings,
};

const iconForGroup = (group: string): LucideIcon => GROUP_ICONS[group] || Settings;

const EMPTY_PERM: PermSet = { read: false, write: false, delete: false };

/**
 * Requisitos que se muestran bajo el campo de contraseña. Son informativos —
 * no bloquean el submit (el backend es la autoridad); solo guían al admin
 * cuando escribe una contraseña a mano en lugar de generarla.
 */
const PASSWORD_REQUIREMENTS: PasswordRequirement[] = [
  { label: 'Al menos 8 caracteres', test: (v) => v.length >= 8 },
  { label: 'Mayúsculas y minúsculas', test: (v) => /[a-z]/.test(v) && /[A-Z]/.test(v) },
  { label: 'Al menos un número', test: (v) => /\d/.test(v) },
];

/** Roles de membership por empresa. */
const MEMBERSHIP_ROLE_OPTIONS = [
  { value: 'USER', label: 'USER' },
  { value: 'ADMIN', label: 'ADMIN' },
  { value: 'DRIVER', label: 'DRIVER' },
];

/**
 * Catálogo cargado del servidor.
 *
 * Se guarda a nivel de módulo y no en el estado de un componente porque
 * `defaultPermissions()` lo necesita desde media docena de sitios que no son
 * componentes. Se rellena una vez, al montar la pantalla.
 */
let catalogGroups: PermissionGroup[] = [];

const defaultPermissions = (): Permissions => {
  const perms: Permissions = {};
  catalogGroups.forEach((g) =>
    g.items.forEach((i) => {
      perms[i.path] = { ...EMPTY_PERM };
    }),
  );
  return perms;
};

/** Trae el catálogo una vez y lo deja disponible para toda la pantalla. */
function usePermissionCatalog(): { groups: PermissionGroup[]; loading: boolean } {
  const [groups, setGroups] = useState<PermissionGroup[]>(catalogGroups);
  const [loading, setLoading] = useState(catalogGroups.length === 0);

  useEffect(() => {
    if (catalogGroups.length > 0) return;
    permissionsApi
      .catalog()
      .then((res) => {
        catalogGroups = res.groups || [];
        setGroups(catalogGroups);
      })
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }, []);

  return { groups, loading };
}

// ─── Sub-componentes ──────────────────────────────────────────────────────────

const PermToggle: React.FC<{
  active: boolean;
  /**
   * El tono es semántico, no un color: leer va en `success`, escribir en el
   * acento de la marca y borrar en `danger`. Así el chip sigue al tema del
   * tenant en vez de quedarse verde-esmeralda pase lo que pase.
   */
  tone: 'success' | 'accent' | 'danger';
  label: string;
  icon: React.ReactNode;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}> = ({ active, tone, label, icon, disabled, onChange }) => {
  // Los `-bg`/`-fg` semánticos ya traen su versión oscura puesta (en modo
  // oscuro el fondo pasa a un 12% de la tinta y el texto se aclara), así que
  // aquí no hace falta ningún `dark:`.
  //
  // El anillo va con el triplete `--k-*-rgb` y no con `ring-success/45`:
  // `success` es un `var()` plano, sin `<alpha-value>`, y ante eso Tailwind
  // NO genera la clase — ni error ni aviso, simplemente no habría anillo.
  const activeClass = {
    success: 'bg-success-bg text-success-fg ring-1 ring-[rgb(var(--k-success-rgb)/0.45)]',
    accent: 'bg-accent/15 text-accent ring-1 ring-accent/40',
    danger: 'bg-danger-bg text-danger-fg ring-1 ring-[rgb(var(--k-danger-rgb)/0.45)]',
  }[tone];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!active)}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xs text-[10px] font-bold uppercase tracking-wide transition-all
 ${active ? activeClass : 'bg-bg-muted text-fg-muted ring-1 ring-border-default hover:text-accent'}
 ${disabled ? 'cursor-not-allowed opacity-40' : 'cursor-pointer hover:opacity-90 active:scale-95'}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-current' : 'bg-border-strong'}`} />
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
  const { groups, loading } = usePermissionCatalog();

  const togglePerm = (path: string, key: keyof PermSet, value: boolean) => {
    onChange({ ...permissions, [path]: { ...(permissions[path] || EMPTY_PERM), [key]: value } });
  };

  const toggleGroup = (group: PermissionGroup, key: keyof PermSet, value: boolean) => {
    const next = { ...permissions };
    group.items.forEach((i) => {
      next[i.path] = { ...(next[i.path] || EMPTY_PERM), [key]: value };
    });
    onChange(next);
  };

  const allGroupActive = (group: PermissionGroup, key: keyof PermSet) =>
    group.items.every((i) => permissions[i.path]?.[key]);

  if (loading) {
    return <p className="pt-2 text-xs text-fg-muted">Cargando el catálogo de permisos…</p>;
  }

  return (
    <div className="space-y-3 pt-2">
      {groups.map((group) => {
        const Icon = iconForGroup(group.group);
        return (
          <div
            key={group.group}
            className="border border-border-default rounded-sm overflow-hidden"
          >
            {/* Header del grupo */}
            <div className="flex items-center justify-between px-3 py-2 bg-bg-muted">
              <span className="flex items-center gap-1.5 text-[10px] font-bold text-fg-muted uppercase tracking-widest">
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
         read: 'bg-success text-[var(--k-success-on)] shadow-sm',
         write: 'bg-accent text-accent-fg shadow-sm',
         delete: 'bg-danger text-[var(--k-danger-on)] shadow-sm',
       }[key]
     : 'bg-bg-card text-fg-muted border border-border-default hover:text-accent hover:border-accent/40'
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
            <div className="divide-y divide-border-subtle bg-bg-card">
              {group.items.map((item) => {
                const p = permissions[item.path] || EMPTY_PERM;
                return (
                  <div key={item.path} className="flex items-center justify-between px-3 py-1.5">
                    <span className="text-xs text-fg-body font-medium">{item.label}</span>
                    <div className="flex gap-1.5">
                      <PermToggle
                        active={p.read}
                        tone="success"
                        label="Ver"
                        icon={<Eye size={18} />}
                        disabled={disabled}
                        onChange={(v) => togglePerm(item.path, 'read', v)}
                      />
                      <PermToggle
                        active={p.write}
                        tone="accent"
                        label="Crear"
                        icon={<Pencil size={18} />}
                        disabled={disabled}
                        onChange={(v) => togglePerm(item.path, 'write', v)}
                      />
                      <PermToggle
                        active={p.delete}
                        tone="danger"
                        label="Borrar"
                        icon={<AlertTriangle size={18} />}
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
  const popup = usePopup();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Campos identidad
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [globalRole, setGlobalRole] = useState('USER');
  // El generar/mostrar contraseña (y su estado `showPassword`) los aporta
  // ahora PasswordInput: `generator` rellena el campo y lo revela solo.

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
          await coreApi.raw('PATCH', `/api/memberships/${m.id}`, {
            role: m.role,
            permissions: permStr,
          });
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
    const ok = await popup.confirm({
      title: 'Eliminar usuario',
      message:
        'Se eliminará el usuario y sus accesos a las empresas asignadas. No se puede deshacer.',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
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
      <PageHeader
        title="Usuarios"
        subtitle="Gestiona accesos, roles y permisos por empresa."
        eyebrow="Gestión Central"
        icon={<UsersIcon size={18} />}
        size="lg"
        actions={
          !showForm && (
            <Button
              type="button"
              onClick={() => setShowForm(true)}
              disabled={!canWrite}
              className="flex items-center gap-2 disabled:opacity-50 disabled:grayscale"
            >
              <UserPlus size={18} /> Nuevo Usuario
            </Button>
          )
        }
      />

      {/* Formulario */}
      {showForm && (
        <Card className="border-0">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-black text-fg-default">
              {editingUser ? `Editando: ${editingUser.username}` : 'Nuevo Usuario'}
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetForm}
              title="Cerrar formulario"
            >
              <X size={18} />
            </Button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* Identidad */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Nombre de Usuario"
                type="text"
                placeholder="jdoe"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
              <Input
                label={
                  <span className="inline-flex items-center gap-1">
                    <Mail size={10} /> Email
                  </span>
                }
                type="email"
                placeholder="ejemplo@empresa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <div className="space-y-1.5">
                {/* PasswordInput trae el ojo de mostrar/ocultar y el botón de
                    generar (que además revela el valor), así que sustituye al
                    Input de tipo password + los dos botones sueltos que había.
                    `required={!editingUser}` se mantiene: al editar, vacío
                    significa «no cambiar». Fortaleza y requisitos solo cuando
                    hay algo escrito, para no pintar 3 avisos en rojo en el
                    caso normal de edición sin tocar la contraseña. */}
                <PasswordInput
                  label={editingUser ? 'Nueva Contraseña (vacío = no cambiar)' : 'Contraseña'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required={!editingUser}
                  generator={{ length: 14 }}
                  showStrength={!!password}
                  requirements={password ? PASSWORD_REQUIREMENTS : undefined}
                />
                {editingUser && (
                  <p className="text-[10px] text-fg-subtle">
                    Escribe o genera una nueva contraseña para restablecer el acceso del usuario.
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-fg-subtle uppercase tracking-widest flex items-center gap-1.5">
                  <ShieldCheck
                    size={11}
                    className={isPrivileged ? 'text-accent' : 'text-fg-subtle'}
                  />
                  Rol Global {!isPrivileged && <Lock size={9} className="text-fg-subtle" />}
                </label>
                {isPrivileged ? (
                  // 2–3 opciones fijas → Select. La etiqueta con iconos se queda
                  // arriba (Select solo acepta `label` de texto), de ahí ariaLabel.
                  <Select
                    ariaLabel="Rol global"
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
                  <div className="w-full bg-bg-muted border border-border-default rounded-lg py-2 px-3 text-sm text-fg-muted font-bold">
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
            <div className="space-y-4 pt-2 border-t border-border-subtle">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-fg-default uppercase tracking-tight">
                    Acceso a Empresas
                  </h3>
                  <p className="text-[10px] text-fg-subtle font-bold mt-0.5">
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
                <div className="flex items-center gap-3 p-4 bg-warning-bg border border-[rgb(var(--k-warning-rgb)/0.35)] rounded-lg text-warning-fg">
                  <ShieldCheck size={18} className="shrink-0" />
                  <p className="text-sm font-bold">
                    Los SUPERUSER tienen acceso global a todas las empresas sin necesidad de
                    asignación.
                  </p>
                </div>
              )}

              {activeMemberships.length === 0 && globalRole !== 'SUPERUSER' && (
                <div className="flex items-center gap-3 p-4 bg-bg-muted border border-dashed border-border-default rounded-lg text-fg-subtle">
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
                        className="flex items-center gap-3 p-3 bg-danger-bg border border-[rgb(var(--k-danger-rgb)/0.35)] rounded-lg opacity-60"
                      >
                        <span className="text-xs text-danger-fg font-bold line-through">
                          {m.tenantName}
                        </span>
                        <span className="text-[10px] text-danger font-black uppercase">
                          Se eliminará al guardar
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="ml-auto"
                          title="Deshacer eliminación"
                          onClick={() => updateMembership(idx, { isDeleted: false })}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    );

                  const usedTenantIds = memberships
                    .filter((mm, ii) => ii !== idx && !mm.isDeleted)
                    .map((mm) => mm.tenantId);

                  return (
                    <div
                      key={idx}
                      className={`border rounded-sm overflow-hidden transition-all ${m.isNew ? 'border-accent/40 bg-accent/5' : 'border-border-default bg-bg-card'}`}
                    >
                      {/* Cabecera de la membership */}
                      <div className="flex items-center gap-3 p-4">
                        <div
                          className={`w-9 h-9 rounded-xs flex items-center justify-center ${m.isNew ? 'bg-accent/15 text-accent' : 'bg-bg-muted text-fg-body'}`}
                        >
                          <Building2 size={18} />
                        </div>

                        {/* Selector de empresa — lista de servidor → SearchableSelect */}
                        <div className="flex-1">
                          <SearchableSelect
                            options={allTenants
                              .filter((t) => !usedTenantIds.includes(t.id) || t.id === m.tenantId)
                              .map((t) => ({ value: t.id, label: t.name }))}
                            value={m.tenantId}
                            onChange={(v) => updateMembership(idx, { tenantId: v })}
                            disabled={!isPrivileged}
                            placeholder="Elige empresa"
                          />
                        </div>

                        {/* Rol de membership — 3 opciones fijas → Select */}
                        <Select
                          ariaLabel="Rol en la empresa"
                          options={MEMBERSHIP_ROLE_OPTIONS}
                          value={m.role}
                          onChange={(v) =>
                            updateMembership(idx, { role: v as 'USER' | 'ADMIN' | 'DRIVER' })
                          }
                          disabled={!isPrivileged}
                          containerClassName="w-32"
                        />

                        {/* Toggle permisos */}
                        {m.role === 'USER' && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => updateMembership(idx, { expanded: !m.expanded })}
                            title="Configurar permisos"
                          >
                            {m.expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                          </Button>
                        )}
                        {m.role === 'ADMIN' && <Badge variant="info">Acceso Total</Badge>}

                        {/* Eliminar — sigue siendo solo para roles privilegiados */}
                        {isPrivileged && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeMembership(idx)}
                            title="Quitar acceso a esta empresa"
                          >
                            <X size={15} />
                          </Button>
                        )}
                      </div>

                      {/* Panel de permisos expandido */}
                      {m.role === 'USER' && m.expanded && (
                        <div className="px-4 pb-4 border-t border-border-subtle">
                          <div className="flex justify-end gap-2 pt-3 pb-1">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!isPrivileged}
                              onClick={() => {
                                const all = defaultPermissions();
                                Object.keys(all).forEach((p) => {
                                  all[p] = { read: true, write: true, delete: true };
                                });
                                updateMembership(idx, { permissions: all });
                              }}
                            >
                              Activar Todo
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={!isPrivileged}
                              onClick={() =>
                                updateMembership(idx, { permissions: defaultPermissions() })
                              }
                            >
                              Limpiar
                            </Button>
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
            <div className="flex gap-3 justify-end pt-4 border-t border-border-subtle">
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
