import React, { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Card, EmptyState, Loader } from '@openfactu/ui';
import { FileQuestion, Lock } from 'lucide-react';
import { usePublicForm } from '@/modules/forms/hooks/usePublicForm';
import { FormRunner } from '@/modules/forms/components/render/FormRunner';
import { ThankYou } from '@/modules/forms/components/render/ThankYou';
import { themeStyle } from '@/modules/forms/domain/theme';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Formulario abierto al público: /f/:tenantId/:slug (con ?t=token si es una
 * invitación personal, ?e=token para cambiar una respuesta enviada). Sin
 * sesión, con la marca de la empresa y el tema del formulario.
 */
export const PublicFormPage: React.FC = () => {
  const { tenantId = '', slug = '' } = useParams();
  const [search] = useSearchParams();
  const token = search.get('t') ?? undefined;
  const editToken = search.get('e') ?? undefined;
  const pf = usePublicForm(tenantId, slug, token, editToken);
  const { t } = useI18n();
  // Cambia al enviar otra respuesta: monta un FormRunner nuevo, vacío.
  const [round, setRound] = useState(0);
  const { data } = pf;

  const shell = (children: React.ReactNode) => (
    <div
      className="min-h-screen bg-bg-app px-4 py-10 text-fg-body"
      style={themeStyle(data?.form.theme)}
    >
      <div className="mx-auto w-full max-w-2xl space-y-6">
        {data && (
          <div className="flex items-center gap-3">
            {data.branding.logoUrl && (
              <img src={data.branding.logoUrl} alt="" className="h-9 w-auto object-contain" />
            )}
            <span className="text-sm font-semibold text-fg-muted">{data.branding.appName}</span>
          </div>
        )}
        {children}
      </div>
    </div>
  );

  if (pf.notFound)
    return shell(
      <EmptyState
        icon={<FileQuestion size={20} />}
        title={t('app.publicForm.unavailable')}
        hint={t('app.publicForm.unavailableHint')}
      />,
    );
  if (!data)
    return shell(
      <div className="flex justify-center py-20">
        <Loader />
      </div>,
    );

  const s = data.form.settings;
  if (pf.result)
    return shell(
      <ThankYou
        result={pf.result}
        definition={data.form.definition}
        editLink={s.allowEdit && pf.result.editToken ? pf.editLink(pf.result.editToken) : null}
        onAnother={
          !s.onePerPerson && !token && !pf.editing
            ? () => {
                setRound((r) => r + 1);
                pf.reset();
              }
            : undefined
        }
      />,
    );
  if (pf.blocked)
    return shell(
      <Card>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <Lock size={32} className="text-fg-muted" />
          <h1 className="text-lg font-semibold text-fg-default">{data.form.title}</h1>
          <p className="text-sm text-fg-muted whitespace-pre-wrap">{pf.blocked}</p>
        </div>
      </Card>,
    );

  return shell(
    <>
      {data.invitee?.name && (
        <p className="text-sm text-fg-muted">
          {t('app.publicForm.hello', { name: data.invitee.name })}
        </p>
      )}
      {pf.editing && (
        <p className="rounded-xs bg-info-bg px-3 py-2 text-sm text-info-fg">
          {t('app.publicForm.editing')}
        </p>
      )}
      <FormRunner
        key={round}
        title={data.form.title}
        titleEffect={data.form.theme.titleEffect}
        intro={data.form.intro}
        definition={data.form.definition}
        settings={s}
        headerImageUrl={
          data.form.theme.headerAssetId ? pf.assetUrl(data.form.theme.headerAssetId) : null
        }
        assetUrl={pf.assetUrl}
        initialAnswers={pf.editing ? data.editing?.answers : undefined}
        initialEmail={pf.editing ? data.editing?.email : undefined}
        hideEmail={!!data.invitee || pf.editing}
        upload={pf.upload}
        onSubmit={pf.submit}
        submitting={pf.sending}
        submitError={pf.submitError}
      />
      {/* Campo trampa para bots: no hay equivalente en @openfactu/ui y no debe verse. */}
      <input
        type="text"
        name="website"
        value={pf.website}
        onChange={(e) => pf.setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="hidden"
      />
    </>,
  );
};

export default PublicFormPage;
