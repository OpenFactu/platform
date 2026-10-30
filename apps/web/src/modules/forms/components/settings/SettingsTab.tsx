import { useI18n } from '@/i18n/I18nContext';
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
  const { t } = useI18n();
  const form = editor.form!;
  const s = form.settings;
  const { members, stages } = useSettingsOptions(crm);
  const set = (patch: Partial<FormSettings>) => editor.change({ settings: { ...s, ...patch } });
  const setTheme = (patch: Partial<FormTheme>) =>
    editor.change({ theme: { ...form.theme, ...patch } });
  const notify = new Set(s.notifyUserIds);

  return (
    <div className="space-y-4">
      <Card title={t('forms.settings.general')} bodyClassName="space-y-4">
        <Input
          label={t('forms.settings.internalName')}
          helperText={t('forms.settings.internalNameHint')}
          value={form.name}
          onChange={(e) => editor.change({ name: e.target.value })}
          disabled={disabled}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label={t('forms.settings.submitLabel')}
            value={s.submitLabel ?? ''}
            onChange={(e) => set({ submitLabel: e.target.value || undefined })}
            placeholder={t('forms.runner.submit')}
            disabled={disabled}
          />
        </div>
        <Textarea
          label={t('forms.settings.successMessage')}
          rows={2}
          value={s.successMessage ?? ''}
          onChange={(e) => set({ successMessage: e.target.value || undefined })}
          placeholder={t('forms.thanks.default')}
          disabled={disabled}
        />
      </Card>

      <Card title={t('forms.settings.responses')} bodyClassName="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <DatePicker
            label={t('forms.settings.closesAt')}
            value={s.closesAt ?? null}
            onChange={(closesAt) => set({ closesAt })}
            clearable
            disabled={disabled}
          />
          <NumberInput
            label={t('forms.settings.maxResponses')}
            value={s.maxResponses ?? null}
            onChange={(n) => set({ maxResponses: n && n > 0 ? n : null })}
            min={1}
            precision={0}
            placeholder={t('forms.settings.noLimit')}
            disabled={disabled}
          />
        </div>
        <Textarea
          label={t('forms.settings.closedMessage')}
          rows={2}
          value={s.closedMessage ?? ''}
          onChange={(e) => set({ closedMessage: e.target.value || undefined })}
          placeholder={t('forms.public.closed')}
          disabled={disabled}
        />
        <div className="sm:w-72">
          <Select
            label={t('forms.settings.askEmail')}
            options={[
              { value: 'none', label: t('forms.settings.collectEmail.none') },
              { value: 'optional', label: t('forms.settings.collectEmail.optional') },
              { value: 'required', label: t('forms.settings.collectEmail.required') },
            ]}
            value={s.collectEmail}
            onChange={(v) => set({ collectEmail: v as FormSettings['collectEmail'] })}
            disabled={disabled}
          />
        </div>
        <Toggle
          label={t('forms.settings.onePerPerson')}
          hint={
            s.collectEmail === 'required'
              ? t('forms.settings.onePerPersonEmail')
              : t('forms.settings.onePerPersonBrowser')
          }
          checked={s.onePerPerson}
          onChange={(onePerPerson) => set({ onePerPerson })}
          disabled={disabled}
        />
        <Toggle
          label={t('forms.settings.allowEdit')}
          hint={t('forms.settings.allowEditHint')}
          checked={s.allowEdit}
          onChange={(allowEdit) => set({ allowEdit })}
          disabled={disabled}
        />
      </Card>

      <Card title={t('forms.settings.presentation')} bodyClassName="space-y-4">
        <Toggle
          label={t('forms.settings.progressBar')}
          hint={t('forms.settings.progressBarHint')}
          checked={s.showProgress}
          onChange={(showProgress) => set({ showProgress })}
          disabled={disabled}
        />
        <Toggle
          label={t('forms.settings.shuffle')}
          hint={t('forms.settings.shuffleHint')}
          checked={s.shuffleQuestions}
          onChange={(shuffleQuestions) => set({ shuffleQuestions })}
          disabled={disabled}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <ColorInput
            label={t('forms.settings.accentColor')}
            helperText={t('forms.settings.companyDefault')}
            value={form.theme.accent ?? ''}
            onChange={(accent) => setTheme({ accent: accent || undefined })}
            clearable
            disabled={disabled}
          />
          <ColorInput
            label={t('forms.settings.backgroundColor')}
            helperText={t('forms.settings.companyDefault')}
            value={form.theme.background ?? ''}
            onChange={(background) => setTheme({ background: background || undefined })}
            clearable
            disabled={disabled}
          />
        </div>
      </Card>

      <Card title={t('forms.logic.quiz')} bodyClassName="space-y-4">
        <Toggle
          label={t('forms.settings.makeQuiz')}
          hint={t('forms.settings.makeQuizHint')}
          checked={s.quiz.enabled}
          onChange={(enabled) => set({ quiz: { ...s.quiz, enabled } })}
          disabled={disabled}
        />
        {s.quiz.enabled && (
          <>
            <div className="sm:w-72">
              <Select
                label={t('forms.settings.showScore')}
                options={[
                  { value: 'immediate', label: t('forms.settings.release.immediate') },
                  { value: 'later', label: t('forms.settings.release.later') },
                  { value: 'never', label: t('forms.settings.release.never') },
                ]}
                value={s.quiz.release}
                onChange={(v) =>
                  set({ quiz: { ...s.quiz, release: v as FormSettings['quiz']['release'] } })
                }
                disabled={disabled}
              />
            </div>
            <Toggle
              label={t('forms.settings.showCorrect')}
              hint={t('forms.settings.showCorrectHint')}
              checked={s.quiz.showCorrect}
              onChange={(showCorrect) => set({ quiz: { ...s.quiz, showCorrect } })}
              disabled={disabled}
            />
          </>
        )}
      </Card>

      <Card title={t('forms.settings.notifications')} bodyClassName="space-y-3">
        {members.length === 0 ? (
          <p className="text-sm text-fg-muted">{t('forms.settings.loadingUsers')}</p>
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
          label={t('forms.settings.notifyEmail')}
          checked={s.notifyEmail}
          onChange={(notifyEmail) => set({ notifyEmail })}
          disabled={disabled || notify.size === 0}
        />
      </Card>

      {crm && (
        <Card title="CRM" bodyClassName="space-y-4">
          <Toggle
            label={t('forms.settings.createLead')}
            hint={t('forms.settings.createLeadHint')}
            checked={s.crm.createLead}
            onChange={(createLead) => set({ crm: { ...s.crm, createLead } })}
            disabled={disabled}
          />
          {s.crm.createLead && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Select
                label={t('forms.settings.stage')}
                options={[
                  { value: '', label: t('forms.settings.firstStage') },
                  ...stages.map((st) => ({ value: st.id, label: st.name })),
                ]}
                value={s.crm.stageId ?? ''}
                onChange={(v) => set({ crm: { ...s.crm, stageId: v || undefined } })}
                disabled={disabled}
              />
              <Select
                label={t('forms.settings.owner')}
                options={[
                  { value: '', label: t('forms.settings.noOwner') },
                  ...members.map((m) => ({ value: m.id, label: m.name })),
                ]}
                value={s.crm.ownerUserId ?? ''}
                onChange={(v) => set({ crm: { ...s.crm, ownerUserId: v || undefined } })}
                disabled={disabled}
              />
              <Input
                label={t('forms.settings.source')}
                value={s.crm.source ?? ''}
                onChange={(e) => set({ crm: { ...s.crm, source: e.target.value || undefined } })}
                placeholder={t('forms.settings.sourcePlaceholder')}
                disabled={disabled}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
