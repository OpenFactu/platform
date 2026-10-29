import React, { useEffect, useState } from 'react';
import {
  Card,
  Checkbox,
  ColorInput,
  DatePicker,
  Input,
  NumberInput,
  Select,
  Switch,
  Textarea,
} from '@openfactu/ui';
import { formsApi, type MemberOption, type StageOption } from '../../api/formsApi';
import type { FormSettings, FormTheme } from '../../domain/types';
import type { FormEditorState } from '../../hooks/useFormEditor';

interface Props {
  editor: FormEditorState;
  crm: boolean;
  disabled?: boolean;
}

/** Fila de ajuste: interruptor con su explicación debajo. */
const Toggle: React.FC<{
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}> = ({ label, hint, checked, onChange, disabled }) => (
  <div className="space-y-1">
    <Switch label={label} checked={checked} onChange={onChange} disabled={disabled} />
    {hint && <p className="text-xs text-fg-muted pl-12">{hint}</p>}
  </div>
);

/** Miembros (para avisos y responsable) y etapas del CRM, cargados una vez. */
function useSettingsOptions(crm: boolean) {
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [stages, setStages] = useState<StageOption[]>([]);
  useEffect(() => {
    formsApi
      .members()
      .then(setMembers)
      .catch(() => setMembers([]));
    if (crm)
      formsApi
        .crmStages()
        .then(setStages)
        .catch(() => setStages([]));
  }, [crm]);
  return { members, stages };
}

/** Pestaña «Ajustes»: respuestas, presentación, cuestionario, avisos y CRM. */
export const SettingsTab: React.FC<Props> = ({ editor, crm, disabled }) => {
  const form = editor.form!;
  const s = form.settings;
  const { members, stages } = useSettingsOptions(crm);
  const set = (patch: Partial<FormSettings>) => editor.change({ settings: { ...s, ...patch } });
  const setTheme = (patch: Partial<FormTheme>) =>
    editor.change({ theme: { ...form.theme, ...patch } });
  const notify = new Set(s.notifyUserIds);

  return (
    <div className="space-y-4">
      <Card title="General" bodyClassName="space-y-4">
        <Input
          label="Nombre interno"
          helperText="Solo lo ves tú; quien responde ve el título del formulario."
          value={form.name}
          onChange={(e) => editor.change({ name: e.target.value })}
          disabled={disabled}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Texto del botón de enviar"
            value={s.submitLabel ?? ''}
            onChange={(e) => set({ submitLabel: e.target.value || undefined })}
            placeholder="Enviar"
            disabled={disabled}
          />
        </div>
        <Textarea
          label="Mensaje de confirmación"
          rows={2}
          value={s.successMessage ?? ''}
          onChange={(e) => set({ successMessage: e.target.value || undefined })}
          placeholder="¡Gracias! Hemos recibido tu respuesta."
          disabled={disabled}
        />
      </Card>

      <Card title="Respuestas" bodyClassName="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker
            label="Cerrar el día"
            value={s.closesAt ?? null}
            onChange={(closesAt) => set({ closesAt })}
            clearable
            disabled={disabled}
          />
          <NumberInput
            label="Máximo de respuestas"
            value={s.maxResponses ?? null}
            onChange={(n) => set({ maxResponses: n && n > 0 ? n : null })}
            min={1}
            precision={0}
            placeholder="Sin límite"
            disabled={disabled}
          />
        </div>
        <Textarea
          label="Mensaje cuando está cerrado"
          rows={2}
          value={s.closedMessage ?? ''}
          onChange={(e) => set({ closedMessage: e.target.value || undefined })}
          placeholder="Este formulario ya no acepta respuestas."
          disabled={disabled}
        />
        <div className="sm:w-72">
          <Select
            label="Pedir el correo"
            options={[
              { value: 'none', label: 'No' },
              { value: 'optional', label: 'Opcional' },
              { value: 'required', label: 'Obligatorio' },
            ]}
            value={s.collectEmail}
            onChange={(v) => set({ collectEmail: v as FormSettings['collectEmail'] })}
            disabled={disabled}
          />
        </div>
        <Toggle
          label="Una respuesta por persona"
          hint={
            s.collectEmail === 'required'
              ? 'Se comprueba por el correo.'
              : 'Sin pedir el correo se comprueba por el navegador: alguien decidido puede saltárselo.'
          }
          checked={s.onePerPerson}
          onChange={(onePerPerson) => set({ onePerPerson })}
          disabled={disabled}
        />
        <Toggle
          label="Permitir editar después de enviar"
          hint="Quien responde recibe un enlace para cambiar su respuesta."
          checked={s.allowEdit}
          onChange={(allowEdit) => set({ allowEdit })}
          disabled={disabled}
        />
      </Card>

      <Card title="Presentación" bodyClassName="space-y-4">
        <Toggle
          label="Barra de progreso"
          hint="Con varias secciones, enseña por cuál va."
          checked={s.showProgress}
          onChange={(showProgress) => set({ showProgress })}
          disabled={disabled}
        />
        <Toggle
          label="Orden aleatorio de las preguntas"
          hint="Dentro de cada sección; los textos e imágenes se quedan en su sitio."
          checked={s.shuffleQuestions}
          onChange={(shuffleQuestions) => set({ shuffleQuestions })}
          disabled={disabled}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorInput
            label="Color de acento"
            helperText="Vacío: el de la empresa."
            value={form.theme.accent ?? ''}
            onChange={(accent) => setTheme({ accent: accent || undefined })}
            clearable
            disabled={disabled}
          />
          <ColorInput
            label="Color de fondo"
            helperText="Vacío: el de la empresa."
            value={form.theme.background ?? ''}
            onChange={(background) => setTheme({ background: background || undefined })}
            clearable
            disabled={disabled}
          />
        </div>
      </Card>

      <Card title="Cuestionario" bodyClassName="space-y-4">
        <Toggle
          label="Convertir en cuestionario"
          hint="Cada pregunta puede tener puntos y respuesta correcta; la nota se calcula sola."
          checked={s.quiz.enabled}
          onChange={(enabled) => set({ quiz: { ...s.quiz, enabled } })}
          disabled={disabled}
        />
        {s.quiz.enabled && (
          <>
            <div className="sm:w-72">
              <Select
                label="Mostrar la nota"
                options={[
                  { value: 'immediate', label: 'Nada más enviar' },
                  { value: 'later', label: 'Más tarde, cuando la publique' },
                  { value: 'never', label: 'Nunca' },
                ]}
                value={s.quiz.release}
                onChange={(v) =>
                  set({ quiz: { ...s.quiz, release: v as FormSettings['quiz']['release'] } })
                }
                disabled={disabled}
              />
            </div>
            <Toggle
              label="Enseñar las respuestas correctas"
              hint="Junto a la nota, con la explicación de cada pregunta."
              checked={s.quiz.showCorrect}
              onChange={(showCorrect) => set({ quiz: { ...s.quiz, showCorrect } })}
              disabled={disabled}
            />
          </>
        )}
      </Card>

      <Card title="Avisos de respuestas nuevas" bodyClassName="space-y-3">
        {members.length === 0 ? (
          <p className="text-sm text-fg-muted">Cargando usuarios…</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {members.map((m) => (
              <Checkbox
                key={m.id}
                label={m.name}
                checked={notify.has(m.id)}
                onChange={(on) => {
                  const next = new Set(notify);
                  if (on) next.add(m.id);
                  else next.delete(m.id);
                  set({ notifyUserIds: [...next] });
                }}
                disabled={disabled}
              />
            ))}
          </div>
        )}
        <Toggle
          label="Avisar también por correo"
          checked={s.notifyEmail}
          onChange={(notifyEmail) => set({ notifyEmail })}
          disabled={disabled || notify.size === 0}
        />
      </Card>

      {crm && (
        <Card title="CRM" bodyClassName="space-y-4">
          <Toggle
            label="Crear un prospecto con cada respuesta"
            hint="Usa las preguntas marcadas con «Guardar en el CRM» (nombre, empresa, correo…)."
            checked={s.crm.createLead}
            onChange={(createLead) => set({ crm: { ...s.crm, createLead } })}
            disabled={disabled}
          />
          {s.crm.createLead && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label="Etapa"
                options={[
                  { value: '', label: 'La primera' },
                  ...stages.map((st) => ({ value: st.id, label: st.name })),
                ]}
                value={s.crm.stageId ?? ''}
                onChange={(v) => set({ crm: { ...s.crm, stageId: v || undefined } })}
                disabled={disabled}
              />
              <Select
                label="Responsable"
                options={[
                  { value: '', label: 'Sin responsable' },
                  ...members.map((m) => ({ value: m.id, label: m.name })),
                ]}
                value={s.crm.ownerUserId ?? ''}
                onChange={(v) => set({ crm: { ...s.crm, ownerUserId: v || undefined } })}
                disabled={disabled}
              />
              <Input
                label="Origen"
                value={s.crm.source ?? ''}
                onChange={(e) => set({ crm: { ...s.crm, source: e.target.value || undefined } })}
                placeholder="Formulario web"
                disabled={disabled}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
