import { useEffect, useState } from 'react';
import { applyTheme, getThemePreset } from '@openfactu/ui';
import type { Answers, FormDefinition } from '@forms-engine';
import { apiClient, ApiError } from '@/shared/http';
import type { FormTheme } from '../domain/types';
import type { UploadedFile } from '../components/render/QuestionField';

export interface PublicFormData {
  form: {
    id: string;
    title: string;
    intro: string | null;
    definition: FormDefinition;
    settings: {
      submitLabel: string | null;
      successMessage: string | null;
      collectEmail: 'none' | 'optional' | 'required';
      onePerPerson: boolean;
      allowEdit: boolean;
      showProgress: boolean;
      shuffleQuestions: boolean;
      quiz: { release: 'immediate' | 'later' | 'never'; showCorrect: boolean } | null;
    };
    theme: FormTheme;
  };
  closed: string | null;
  invitee: { name: string | null; responded: boolean } | null;
  editing: { answers: Answers; email: string | null } | null;
  branding: {
    appName: string;
    logoUrl: string;
    colorPrimary: string;
    colorAccent: string;
    themeMode: 'light' | 'dark';
    themePreset: string;
  };
}

export interface QuizResult {
  score: number;
  maxScore: number;
  pending: boolean;
  questions?: Record<
    string,
    {
      points: number;
      max: number;
      correct: boolean | null;
      correctAnswer: string[] | null;
      feedback?: string;
    }
  >;
}

export interface SubmitResult {
  message: string | null;
  editToken: string | null;
  score: QuizResult | null;
}

/** Marca anónima del navegador para «una respuesta por persona» sin correo. */
function browserKey(): string | undefined {
  try {
    const k = 'keirost:forms:browser';
    let v = localStorage.getItem(k);
    if (!v) {
      v = crypto.randomUUID();
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return undefined;
  }
}

/**
 * Formulario público: carga (con la marca de la empresa), subida de archivos,
 * envío y edición con `?e=`. Sin sesión.
 */
export function usePublicForm(tenantId: string, slug: string, token?: string, editToken?: string) {
  const base = `/api/public/forms/${tenantId}/${slug}`;
  const [data, setData] = useState<PublicFormData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [sending, setSending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** Motivo por el que ya no se puede responder (cerrado, ya respondiste…). */
  const [blocked, setBlocked] = useState<string | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  // Campo trampa: los humanos no lo ven; si llega relleno es un bot.
  const [website, setWebsite] = useState('');

  useEffect(() => {
    const q = new URLSearchParams();
    if (token) q.set('t', token);
    if (editToken) q.set('e', editToken);
    const qs = q.toString();
    apiClient
      .get<PublicFormData>(`${base}${qs ? `?${qs}` : ''}`, { auth: false })
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
  }, [base, token, editToken]);

  const editing = !!(editToken && data?.editing);

  const upload = async (questionId: string, file: File): Promise<UploadedFile> => {
    const body = new FormData();
    body.append('file', file);
    body.append('questionId', questionId);
    const r = await apiClient.postForm<{ token: string; fileName: string }>(
      `${base}/upload`,
      body,
      { auth: false },
    );
    return { token: r.token, fileName: r.fileName };
  };

  const submit = async (answers: Answers, email: string | null) => {
    setSending(true);
    setSubmitError(null);
    setResult(null);
    try {
      const res = editing
        ? await apiClient.put<SubmitResult>(
            `${base}/edit/${editToken}`,
            { answers },
            { auth: false },
          )
        : await apiClient.post<SubmitResult>(
            base,
            { answers, email, t: token, browserKey: browserKey(), website },
            { auth: false },
          );
      setResult(res);
      return undefined;
    } catch (err) {
      const body =
        err instanceof ApiError
          ? (err.body as { errors?: Record<string, string>; error?: string })
          : null;
      if (err instanceof ApiError && err.status === 409) {
        setBlocked(body?.error ?? 'Este formulario ya no acepta respuestas.');
        return undefined;
      }
      setSubmitError(err instanceof Error ? err.message : 'No se pudo enviar');
      return body?.errors ? { errors: body.errors } : undefined;
    } finally {
      setSending(false);
    }
  };

  const editLink = (t: string) =>
    `${window.location.origin}/f/${tenantId}/${slug}?e=${encodeURIComponent(t)}`;

  return {
    data,
    notFound,
    editing,
    sending,
    submitError,
    blocked:
      blocked ??
      (editing
        ? null
        : (data?.closed ?? (data?.invitee?.responded ? 'Ya respondiste. ¡Gracias!' : null))),
    result,
    /** Para enviar otra respuesta: vuelve al formulario vacío. */
    reset: () => setResult(null),
    website,
    setWebsite,
    upload,
    submit,
    editLink,
    assetUrl: (id: string) => `${base}/assets/${id}`,
  };
}
