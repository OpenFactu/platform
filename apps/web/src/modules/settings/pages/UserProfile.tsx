import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, FileDropzone, PageHeader, useToast, usePopup } from '@openfactu/ui';
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
  const popup = usePopup();
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
      const d = res.data as Profile;
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
      const res = await coreApi.raw('PATCH', '/api/profile/me', {
        signatureName: name,
        signatureRole: role,
      });
      if (!res.ok) throw new Error(res.data.error);
      toast.success('Perfil actualizado');
      await load();
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || 'Error');
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
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  const deleteSignature = async () => {
    const ok = await popup.confirm({
      title: 'Eliminar firma',
      message: 'Se borrará la imagen de tu firma. Tus PDFs volverán a usar la firma de la empresa.',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      const res = await coreApi.raw('DELETE', '/api/profile/me/signature');
      if (!res.ok) throw new Error(res.data.error);
      toast.success('Firma eliminada');
      if (signaturePreview?.startsWith('blob:')) URL.revokeObjectURL(signaturePreview);
      setSignaturePreview(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
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
    const ok = await popup.confirm({
      title: 'Eliminar foto de perfil',
      message: 'Volverás a mostrar la inicial de tu usuario en la tabla de Usuarios y en el chat.',
      tone: 'danger',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    try {
      const res = await coreApi.raw('DELETE', '/api/profile/me/avatar');
      if (!res.ok) throw new Error(res.data.error);
      toast.success('Foto eliminada');
      await load();
      await refreshUser();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error');
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title="Mi perfil"
        subtitle="Tu firma personal aparecerá en los PDFs de los documentos que tú emitas, sustituyendo a la firma genérica de la empresa."
        icon={<UserCircle size={18} />}
        size="lg"
      />

      <Card className="p-6 space-y-4 border-border-subtle">
        <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2">
          <ImageIcon size={14} /> Foto de perfil
        </h2>
        <p className="text-[11px] text-fg-muted">
          Se usa en la tabla de Usuarios y en tus mensajes del asistente de IA (PNG o JPG, máx. 5
          MB).
        </p>
        <div className="flex items-center gap-4">
          {profile?.avatarImageUrl ? (
            <img
              src={profile.avatarImageUrl}
              alt="Foto de perfil"
              className="w-16 h-16 rounded-lg object-cover border border-border-default"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center text-xl font-black text-fg-body">
              {profile?.username?.charAt(0).toUpperCase()}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Zona de subida visible: FileDropzone en variante botón, que además
                acepta arrastrar la imagen encima. */}
            <FileDropzone
              variant="button"
              accept="image/png,image/jpeg,image/webp"
              maxSizeMb={5}
              icon={<Upload size={18} />}
              label={profile?.avatarImageUrl ? 'Reemplazar' : 'Subir foto'}
              isUploading={uploadingAvatar}
              uploadingLabel="Subiendo…"
              disabled={uploadingAvatar}
              onFiles={(files) => {
                if (files[0]) uploadAvatar(files[0]);
              }}
              onReject={(reason) =>
                toast.error(reason === 'size' ? 'Máximo 5 MB' : 'Solo PNG, JPG o WebP')
              }
            />
            {profile?.avatarImageUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={deleteAvatar}
                className="flex items-center gap-2"
              >
                <XIcon size={14} /> Eliminar
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4 border-border-subtle">
        <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2">
          <UserCircle size={14} /> Datos de la cuenta
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label="Email" value={profile?.email || ''} disabled />
          <Input label="Usuario" value={profile?.username || ''} disabled />
        </div>
        <p className="text-[11px] text-fg-subtle">
          Para cambiar email o contraseña, ve a la sección Usuarios (requiere permisos).
        </p>
      </Card>

      <TwoFactorSettings />

      <Card className="p-6 space-y-4 border-border-subtle">
        <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2">
          <PenLine size={14} /> Firma para PDFs
        </h2>
        <p className="text-[11px] text-fg-muted">
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
          <label className="block text-xs text-fg-muted mb-1">Imagen de firma</label>
          <div className="flex items-center gap-3 flex-wrap">
            {profile?.signatureImageUrl && signaturePreview && (
              <div className="p-2 border border-border-default rounded-md bg-bg-card">
                <img src={signaturePreview} alt="Firma actual" className="h-14 object-contain" />
              </div>
            )}
            <FileDropzone
              variant="button"
              accept="image/png,image/jpeg"
              maxSizeMb={5}
              icon={<Upload size={18} />}
              label={profile?.signatureImageUrl ? 'Reemplazar' : 'Subir PNG/JPG'}
              isUploading={uploading}
              uploadingLabel="Subiendo…"
              disabled={uploading}
              onFiles={(files) => {
                if (files[0]) uploadSignature(files[0]);
              }}
              onReject={(reason) =>
                toast.error(reason === 'size' ? 'Máximo 5 MB' : 'Solo PNG o JPG')
              }
            />
            {profile?.signatureImageUrl && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={deleteSignature}
                className="flex items-center gap-2"
              >
                <XIcon size={14} /> Eliminar
              </Button>
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
