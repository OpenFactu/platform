import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, useToast } from '@openfactu/ui';
import { UserCircle, Upload, X as XIcon, Save, PenLine, ImageIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { TwoFactorSettings } from '../components/TwoFactorSettings';

interface Profile {
  id: string;
  email: string;
  username: string;
  role: string;
  signatureName: string | null;
  signatureRole: string | null;
  signatureImageUrl: string | null;
  avatarImageUrl: string | null;
}

/**
 * "Mi perfil" — permite al usuario configurar su firma personal (nombre,
 * cargo, imagen). Cuando está informada, prevalece sobre la firma de empresa
 * al generar PDFs de documentos creados por este usuario.
 */
export const UserProfile: React.FC = () => {
  const { token, user, refreshUser } = useAuth();
  const toast = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'x-tenant-id': user?.tenantId || '',
  };

  const load = async () => {
    const res = await coreApi.raw('GET', '/api/profile/me');
    if (res.ok) {
      const d = (res.data) as Profile;
      setProfile(d);
      setName(d.signatureName || '');
      setRole(d.signatureRole || '');
    }
  };

  /**
   * Descarga la firma con auth y la convierte a blob URL para <img>. Como
   * los tags <img> no mandan Authorization, no podemos poner la URL
   * directamente; hacemos fetch manual.
   */
  const loadSignaturePreview = async () => {
    // Limpieza previa del blob URL anterior (evitar leaks).
    if (signaturePreview?.startsWith('blob:')) URL.revokeObjectURL(signaturePreview);
    setSignaturePreview(null);
    try {
      const { blob } = await coreApi.getBlob('/api/profile/me/signature');
      setSignaturePreview(URL.createObjectURL(blob));
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    if (user?.tenantId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.tenantId]);

  // Cuando el perfil cambia, refresca el blob preview si hay firma.
  useEffect(() => {
    if (profile?.signatureImageUrl) loadSignaturePreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.signatureImageUrl]);

  // Cleanup blob URL al desmontar.
  useEffect(() => {
    return () => {
      if (signaturePreview?.startsWith('blob:')) URL.revokeObjectURL(signaturePreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMeta = async () => {
    setSaving(true);
    try {
      const res = await coreApi.raw('PATCH', '/api/profile/me', { signatureName: name, signatureRole: role });
      if (!res.ok) throw new Error((res.data).error);
      toast.success('Perfil actualizado');
      await load();
    } catch (e: any) {
      toast.error(e.message || 'Error');
    } finally {
      setSaving(false);
    }
  };

  const uploadSignature = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo PNG o JPG');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Máximo 5 MB');
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await coreApi.postForm('/api/profile/me/signature', form);
      toast.success('Firma subida');
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setUploading(false);
    }
  };

  const deleteSignature = async () => {
    if (!confirm('¿Eliminar la firma actual?')) return;
    try {
      const res = await coreApi.raw('DELETE', '/api/profile/me/signature');
      if (!res.ok) throw new Error((res.data).error);
      toast.success('Firma eliminada');
      if (signaturePreview?.startsWith('blob:')) URL.revokeObjectURL(signaturePreview);
      setSignaturePreview(null);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // La foto de perfil se sirve sin auth (ver GET /api/profile/avatar/:userId),
  // así que a diferencia de la firma no hace falta el blob-fetch: un <img
  // src> directo basta.
  const uploadAvatar = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Solo imágenes');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Máximo 5 MB');
      return;
    }
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await coreApi.postForm('/api/profile/me/avatar', form);
      toast.success('Foto de perfil actualizada');
      await load();
      await refreshUser();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const deleteAvatar = async () => {
    if (!confirm('¿Eliminar la foto de perfil?')) return;
    try {
      const res = await coreApi.raw('DELETE', '/api/profile/me/avatar');
      if (!res.ok) throw new Error((res.data).error);
      toast.success('Foto eliminada');
      await load();
      await refreshUser();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-3 tracking-tight">
          <UserCircle className="text-blue-600 dark:text-blue-300" size={32} />
          Mi perfil
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
          Tu firma personal aparecerá en los PDFs de los documentos que tú emitas, sustituyendo a la
          firma genérica de la empresa.
        </p>
      </div>

      <Card className="p-6 space-y-4 border-slate-100 dark:border-slate-800">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
          <ImageIcon size={14} /> Foto de perfil
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Se usa en la tabla de Usuarios y en tus mensajes del asistente de IA (PNG o JPG, máx. 5
          MB).
        </p>
        <div className="flex items-center gap-4">
          {profile?.avatarImageUrl ? (
            <img
              src={profile.avatarImageUrl}
              alt="Foto de perfil"
              className="w-16 h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
            />
          ) : (
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-xl font-black text-slate-600 dark:text-slate-200">
              {profile?.username?.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <label className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-bold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <Upload size={14} />
              {uploadingAvatar
                ? 'Subiendo…'
                : profile?.avatarImageUrl
                  ? 'Reemplazar'
                  : 'Subir foto'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={uploadingAvatar}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatar(f);
                  e.target.value = '';
                }}
              />
            </label>
            {profile?.avatarImageUrl && (
              <button
                type="button"
                onClick={deleteAvatar}
                className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors text-sm"
              >
                <XIcon size={14} /> Eliminar
              </button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4 border-slate-100 dark:border-slate-800">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
          <UserCircle size={14} /> Datos de la cuenta
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Email" value={profile?.email || ''} disabled />
          <Input label="Usuario" value={profile?.username || ''} disabled />
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Para cambiar email o contraseña, ve a la sección Usuarios (requiere permisos).
        </p>
      </Card>

      <TwoFactorSettings />

      <Card className="p-6 space-y-4 border-slate-100 dark:border-slate-800">
        <h2 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
          <PenLine size={14} /> Firma para PDFs
        </h2>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Rellena tu nombre y cargo. Opcionalmente sube una imagen de tu firma (PNG o JPG, máx. 5
          MB). Si rellenas estos campos, prevalecen sobre la firma de la empresa en tus PDFs.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Nombre del firmante"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej. Juan García"
          />
          <Input
            label="Cargo"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="Ej. Director Comercial"
          />
        </div>

        <div>
          <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
            Imagen de firma
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            {profile?.signatureImageUrl && signaturePreview && (
              <div className="p-2 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-900">
                <img src={signaturePreview} alt="Firma actual" className="h-14 object-contain" />
              </div>
            )}
            <label className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-sm font-bold cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
              <Upload size={14} />
              {uploading
                ? 'Subiendo…'
                : profile?.signatureImageUrl
                  ? 'Reemplazar'
                  : 'Subir PNG/JPG'}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadSignature(f);
                  e.target.value = '';
                }}
              />
            </label>
            {profile?.signatureImageUrl && (
              <button
                type="button"
                onClick={deleteSignature}
                className="flex items-center gap-2 px-3 py-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10 rounded-lg transition-colors text-sm"
              >
                <XIcon size={14} /> Eliminar
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={saveMeta} disabled={saving} className="flex items-center gap-2">
            <Save size={16} />
            {saving ? 'Guardando…' : 'Guardar nombre y cargo'}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default UserProfile;
