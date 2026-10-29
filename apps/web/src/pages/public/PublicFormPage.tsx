import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Button, Card, EmptyState, Loader, applyTheme, getThemePreset } from '@openfactu/ui';
import { CheckCircle2, FileQuestion } from 'lucide-react';
import { apiClient, ApiError } from '@/shared/http';
import { FormRenderer } from '@/modules/crm/components/forms/FormRenderer';
import { missingRequired, type Answers, type FormField } from '@/modules/crm/domain/forms';

interface PublicForm {
  form: {
    id: string;
    kind: 'form' | 'survey';
    title: string;
    intro: string | null;
    fields: FormField[];
    submitLabel: string | null;
    successMessage: string | null;
  };
  invitee: { name: string | null; responded: boolean } | null;
  branding: {
    appName: string;
    logoUrl: string;
    colorPrimary: string;
    colorAccent: string;
    themeMode: 'light' | 'dark';
    themePreset: string;
  };
}

/**
 * Formulario o encuesta del CRM abierto al público: /f/:tenantId/:slug
 * (con ?t=token si es una invitación personal). Sin sesión, con la marca de
 * la empresa.
 */
export const PublicFormPage: React.FC = () => {
  const { tenantId = '', slug = '' } = useParams();
  const [search] = useSearchParams();
  const token = search.get('t') ?? undefined;
  // Incrustado en la web de la empresa (bloque «Formulario del CRM»): sin
  // cabecera ni fondo propios, y avisando del alto para que el iframe no tenga scroll.
  const embed = search.get('embed') === '1';
  const [data, setData] = useState<PublicForm | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState<Answers>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Campo trampa: los humanos no lo ven; si llega relleno es un bot.
  const [website, setWebsite] = useState('');

  useEffect(() => {
    apiClient
      .get<PublicForm>(`/api/public/forms/${tenantId}/${slug}${token ? `?t=${token}` : ''}`, {
        auth: false,
      })
      .then((d) => {
        setData(d);
        document.title = d.form.title;
        const preset = d.branding.themePreset ? getThemePreset(d.branding.themePreset) : undefined;
        applyTheme(
          preset
            ? preset.theme
            : {
                mode: d.branding.themeMode,
                colors: { primary: d.branding.colorPrimary, accent: d.branding.colorAccent },
              },
        );
      })
      .catch(() => setNotFound(true));
  }, [tenantId, slug, token]);

  useEffect(() => {
    if (!embed) return;
    document.body.style.background = 'transparent';
    const notify = () =>
      window.parent?.postMessage(
        { type: 'keirost-form-height', height: document.documentElement.scrollHeight },
        '*',
      );
    const observer = new ResizeObserver(notify);
    observer.observe(document.body);
    notify();
    return () => observer.disconnect();
  }, [embed]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!data) return;
    const missing = missingRequired(data.form.fields, answers);
    setErrors(missing);
    setSubmitError(null);
    if (Object.keys(missing).length) return;
    setSending(true);
    try {
      const res = await apiClient.post<{ ok: boolean; message: string | null }>(
        `/api/public/forms/${tenantId}/${slug}`,
        { answers, t: token, website },
        { auth: false },
      );
      setSentMessage(res.message || '¡Gracias! Hemos recibido tu respuesta.');
    } catch (err) {
      const body =
        err instanceof ApiError ? (err.body as { errors?: Record<string, string> }) : null;
      if (body?.errors) setErrors(body.errors);
      setSubmitError(err instanceof Error ? err.message : 'No se pudo enviar');
    } finally {
      setSending(false);
    }
  };

  const shell = (children: React.ReactNode) =>
    embed ? (
      <div className="text-fg-body p-1">{children}</div>
    ) : (
      <div className="min-h-screen bg-bg-app text-fg-body py-10 px-4">
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

  if (notFound)
    return shell(
      <EmptyState
        icon={<FileQuestion size={20} />}
        title="Formulario no disponible"
        hint="El enlace no es correcto o el formulario ya no acepta respuestas."
      />,
    );
  if (!data)
    return shell(
      <div className="flex justify-center py-20">
        <Loader />
      </div>,
    );
  if (sentMessage || data.invitee?.responded)
    return shell(
      <Card>
        <div className="flex flex-col items-center text-center gap-3 py-8">
          <CheckCircle2 size={36} className="text-success-fg" />
          <p className="text-lg font-semibold text-fg-default">
            {sentMessage ?? 'Ya respondiste a esta encuesta. ¡Gracias!'}
          </p>
        </div>
      </Card>,
    );

  return shell(
    <Card>
      <form onSubmit={submit} className="space-y-6" noValidate>
        <div>
          <h1 className="text-2xl font-bold text-fg-default">{data.form.title}</h1>
          {data.invitee?.name && (
            <p className="text-sm text-fg-muted mt-1">Hola, {data.invitee.name}.</p>
          )}
          {data.form.intro && (
            <p className="text-sm text-fg-muted mt-2 whitespace-pre-wrap">{data.form.intro}</p>
          )}
        </div>
        <FormRenderer
          fields={data.form.fields}
          answers={answers}
          errors={errors}
          onChange={(id, v) => setAnswers((a) => ({ ...a, [id]: v as Answers[string] }))}
          disabled={sending}
        />
        <input
          type="text"
          name="website"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          className="hidden"
        />
        {submitError && <p className="text-sm text-danger-fg">{submitError}</p>}
        <Button type="submit" size="lg" isLoading={sending} className="w-full sm:w-auto">
          {data.form.submitLabel || 'Enviar'}
        </Button>
      </form>
    </Card>,
  );
};

export default PublicFormPage;
