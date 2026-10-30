import { coreApi } from '@/shared/api';
import React, { useEffect, useState } from 'react';
import { Card, Button, Input, FileDropzone, PageHeader, useToast, usePopup } from '@openfactu/ui';
import { UserCircle, Upload, X as XIcon, Save, PenLine, ImageIcon, Languages } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useI18n } from '@/i18n/I18nContext';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
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
  const { t } = useI18n();
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
      toast.success(t('settings.profile.updated'));
      await load();
    } catch (e) {
      toast.error((e instanceof Error ? e.message : undefined) || t('settings.profile.error'));
    } finally {
      setSaving(false);
    }
  };

  const uploadSignature = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(t('settings.profile.onlyPngJpg'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('settings.profile.max5mb'));
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await coreApi.postForm('/api/profile/me/signature', form);
      toast.success(t('settings.profile.signatureUploaded'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : undefined);
    } finally {
      setUploading(false);
    }
  };

  const deleteSignature = async () => {
    const ok = await popup.confirm({
      title: t('settings.profile.deleteSignatureTitle'),
      message: t('settings.profile.deleteSignatureMessage'),
      tone: 'danger',
      confirmLabel: t('settings.profile.delete'),
    });
    if (!ok) return;
    try {
      const res = await coreApi.raw('DELETE', '/api/profile/me/signature');
      if (!res.ok) throw new Error(res.data.error);
      toast.success(t('settings.profile.signatureDeleted'));
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
      toast.error(t('settings.profile.onlyImages'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(t('settings.profile.max5mb'));
      return;
    }
    setUploadingAvatar(true);
    try {
      const form = new FormData();
      form.append('file', file);
      await coreApi.postForm('/api/profile/me/avatar', form);
      toast.success(t('settings.profile.avatarUpdated'));
      await load();
      await refreshUser();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.profile.error'));
    } finally {
      setUploadingAvatar(false);
    }
  };

  const deleteAvatar = async () => {
    const ok = await popup.confirm({
      title: t('settings.profile.deleteAvatarTitle'),
      message: t('settings.profile.deleteAvatarMessage'),
      tone: 'danger',
      confirmLabel: t('settings.profile.delete'),
    });
    if (!ok) return;
    try {
      const res = await coreApi.raw('DELETE', '/api/profile/me/avatar');
      if (!res.ok) throw new Error(res.data.error);
      toast.success(t('settings.profile.avatarDeleted'));
      await load();
      await refreshUser();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('settings.profile.error'));
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
      <PageHeader
        title={t('settings.profile.title')}
        subtitle={t('settings.profile.subtitle')}
        icon={<UserCircle size={18} />}
        size="lg"
      />

      <Card className="p-6 space-y-4 border-border-subtle">
        <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2">
          <ImageIcon size={14} /> {t('settings.profile.avatarSection')}
        </h2>
        <p className="text-[11px] text-fg-muted">{t('settings.profile.avatarHelp')}</p>
        <div className="flex items-center gap-4">
          {profile?.avatarImageUrl ? (
            <img
              src={profile.avatarImageUrl}
              alt={t('settings.profile.avatarAlt')}
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
              label={
                profile?.avatarImageUrl
                  ? t('settings.profile.replace')
                  : t('settings.profile.uploadPhoto')
              }
              isUploading={uploadingAvatar}
              uploadingLabel={t('settings.profile.uploading')}
              disabled={uploadingAvatar}
              onFiles={(files) => {
                if (files[0]) uploadAvatar(files[0]);
              }}
              onReject={(reason) =>
                toast.error(
                  reason === 'size'
                    ? t('settings.profile.max5mb')
                    : t('settings.profile.onlyPngJpgWebp'),
                )
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
                <XIcon size={14} /> {t('settings.profile.delete')}
              </Button>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6 space-y-4 border-border-subtle">
        <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2">
          <UserCircle size={14} /> {t('settings.profile.accountSection')}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input label={t('settings.profile.email')} value={profile?.email || ''} disabled />
          <Input label={t('settings.profile.username')} value={profile?.username || ''} disabled />
        </div>
        <p className="text-[11px] text-fg-subtle">{t('settings.profile.accountHelp')}</p>
      </Card>

      <Card className="p-6 space-y-4 border-border-subtle">
        <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2">
          <Languages size={14} /> {t('settings.profile.preferencesSection')}
        </h2>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm font-black text-fg-default">{t('settings.profile.language')}</p>
            <p className="text-[11px] text-fg-subtle font-medium max-w-sm">
              {t('settings.profile.languageHelp')}
            </p>
          </div>
          <LanguageSwitcher />
        </div>
      </Card>

      <TwoFactorSettings />

      <Card className="p-6 space-y-4 border-border-subtle">
        <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2">
          <PenLine size={14} /> {t('settings.profile.signatureSection')}
        </h2>
        <p className="text-[11px] text-fg-muted">{t('settings.profile.signatureHelp')}</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label={t('settings.profile.signerName')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('settings.profile.signerNamePlaceholder')}
          />
          <Input
            label={t('settings.profile.signerRole')}
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder={t('settings.profile.signerRolePlaceholder')}
          />
        </div>

        <div>
          <label className="block text-xs text-fg-muted mb-1">
            {t('settings.profile.signatureImage')}
          </label>
          <div className="flex items-center gap-3 flex-wrap">
            {profile?.signatureImageUrl && signaturePreview && (
              <div className="p-2 border border-border-default rounded-md bg-bg-card">
                <img
                  src={signaturePreview}
                  alt={t('settings.profile.currentSignature')}
                  className="h-14 object-contain"
                />
              </div>
            )}
            <FileDropzone
              variant="button"
              accept="image/png,image/jpeg"
              maxSizeMb={5}
              icon={<Upload size={18} />}
              label={
                profile?.signatureImageUrl
                  ? t('settings.profile.replace')
                  : t('settings.profile.uploadPngJpg')
              }
              isUploading={uploading}
              uploadingLabel={t('settings.profile.uploading')}
              disabled={uploading}
              onFiles={(files) => {
                if (files[0]) uploadSignature(files[0]);
              }}
              onReject={(reason) =>
                toast.error(
                  reason === 'size'
                    ? t('settings.profile.max5mb')
                    : t('settings.profile.onlyPngJpg'),
                )
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
                <XIcon size={14} /> {t('settings.profile.delete')}
              </Button>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <Button onClick={saveMeta} disabled={saving} className="flex items-center gap-2">
            <Save size={16} />
            {saving ? t('settings.profile.saving') : t('settings.profile.saveSignature')}
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default UserProfile;
