import React, { useMemo } from 'react';
import {
  Card,
  SegmentedControl,
  getThemePreset,
  useThemePresets,
  useToast,
  type ThemePreset,
} from '@openfactu/ui';
import { Palette } from 'lucide-react';
import { useI18n } from '@/i18n/I18nContext';
import { useTheme } from '@/context/ThemeContext';
import { brandingToThemeInput, type UserTheme } from '@/context/brandingTheme';
import { ThemePresetCard } from './ThemePresetCard';

type ModeOption = 'auto' | 'light' | 'dark';

/**
 * Tema personal del usuario: va con él a cualquier empresa y equipo. La primera
 * muestra es el tema de la empresa, y elegirla quita también el modo: es la
 * forma de volver a verlo todo como lo dejó la empresa.
 */
export const PersonalThemeCard: React.FC = () => {
  const { t } = useI18n();
  const toast = useToast();
  const { branding, userTheme, saveUserTheme } = useTheme();
  const presets = useThemePresets();

  const companyPreset = useMemo<ThemePreset>(
    () => ({
      id: 'company',
      label: t('settings.profile.themeCompany'),
      description: t('settings.profile.themeCompanyHelp'),
      theme: brandingToThemeInput(branding),
    }),
    [branding, t],
  );

  const save = (next: UserTheme) =>
    saveUserTheme(next).catch(() => toast.error(t('settings.profile.themeSaveError')));

  const presetKnown = !!userTheme.preset && !!getThemePreset(userTheme.preset);
  const usingCompanyTheme = !userTheme.preset && !userTheme.mode;

  if (branding.enforceTheme) {
    return (
      <Card className="p-6 border-border-subtle">
        <div className="space-y-2">
          <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2">
            <Palette size={14} /> {t('settings.profile.themeSection')}
          </h2>
          <p className="text-[11px] text-fg-muted">{t('settings.profile.themeEnforced')}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 border-border-subtle">
      <div className="space-y-2">
        <h2 className="text-xs font-black uppercase tracking-widest text-fg-subtle flex items-center gap-2">
          <Palette size={14} /> {t('settings.profile.themeSection')}
        </h2>
        <p className="text-[11px] text-fg-muted">
          {usingCompanyTheme
            ? t('settings.profile.themeUsingCompany')
            : t('settings.profile.themeUsingPersonal')}{' '}
          {t('settings.profile.themeScope')}
        </p>
      </div>

      <div className="flex items-center justify-between gap-4 flex-wrap mt-5">
        <div>
          <p className="text-sm font-black text-fg-default">{t('settings.profile.themeMode')}</p>
          <p className="text-[11px] text-fg-subtle font-medium max-w-sm">
            {t('settings.profile.themeModeHelp')}
          </p>
        </div>
        <SegmentedControl<ModeOption>
          size="sm"
          variant="raised"
          aria-label={t('settings.profile.themeMode')}
          value={userTheme.mode ?? 'auto'}
          onChange={(mode) => save({ ...userTheme, mode: mode === 'auto' ? null : mode })}
          options={[
            { value: 'auto', label: t('settings.profile.themeModeAuto') },
            { value: 'light', label: t('settings.profile.themeModeLight') },
            { value: 'dark', label: t('settings.profile.themeModeDark') },
          ]}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-5">
        <ThemePresetCard
          preset={companyPreset}
          selected={!presetKnown}
          onSelect={() => save({ preset: null, mode: null })}
        />
        {presets.map((p) => (
          <ThemePresetCard
            key={p.id}
            preset={p}
            selected={userTheme.preset === p.id}
            onSelect={() => save({ ...userTheme, preset: p.id })}
          />
        ))}
      </div>
    </Card>
  );
};
