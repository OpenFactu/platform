import { useI18n } from '@/i18n/I18nContext';
import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, SkeletonPage } from '@openfactu/ui';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { formsApi } from '../api/formsApi';
import type { FormDoc } from '../domain/types';
import { FormRunner } from '../components/render/FormRunner';
import { themeStyle } from '../domain/theme';

/** Vista previa: el mismo formulario que verá quien responde, sin enviar nada. */
export const FormPreview: React.FC = () => {
  const { t } = useI18n();
  const { formId = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [form, setForm] = useState<FormDoc | null>(null);

  useEffect(() => {
    if (!user?.tenantId) return;
    formsApi
      .get(formId)
      .then(setForm)
      .catch(() => navigate('/forms'));
  }, [formId, user?.tenantId, navigate]);

  if (!form || !user?.tenantId) return <SkeletonPage />;
  const assetUrl = (id: string) => formsApi.publicAssetUrl(user.tenantId!, form.slug, id);

  return (
    <div className="min-h-full p-4" style={themeStyle(form.theme)}>
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => navigate(`/forms/${form.id}`)}
          >
            <ArrowLeft size={14} /> {t('forms.preview.backToEditor')}
          </Button>
          <span className="text-xs text-fg-muted">{t('forms.preview.notice')}</span>
        </div>
        <FormRunner
          title={form.title || form.name}
          titleEffect={form.theme.titleEffect}
          intro={form.intro}
          definition={form.definition}
          settings={form.settings}
          headerImageUrl={form.theme.headerAssetId ? assetUrl(form.theme.headerAssetId) : null}
          assetUrl={assetUrl}
        />
      </div>
    </div>
  );
};

export default FormPreview;
