import React from 'react';
import { Field, Input, SearchableSelect } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';

/**
 * Serie de numeración (con el número a mano si la serie es manual) y periodo
 * contable, sobre el `state`/`setState` de `useDocument`. Estaba copiado en
 * cada formulario de alta con títulos y estilos distintos.
 */
export const SeriesPeriodFields: React.FC<{
  state: any;
  setState: any;
  masters: any;
  /** Al editar un documento ya numerado, serie y periodo no cambian. */
  locked?: boolean;
}> = ({ state, setState, masters, locked }) => {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <Field label={t('doc.form.series')} required error={state.seriesError || undefined}>
        <SearchableSelect
          value={state.seriesId}
          onChange={setState.setSeriesId}
          options={masters.series.map((s: any) => ({ label: s.name, value: s.id }))}
          required
          disabled={locked}
        />
      </Field>
      {state.isManualSeries && !locked && (
        <Input
          label={t('doc.form.docNumber')}
          required
          type="number"
          min={1}
          step={1}
          value={state.manualNumber}
          onChange={(e) => setState.setManualNumber(e.target.value)}
          placeholder={t('doc.form.docNumberPlaceholder')}
          helperText={t('doc.form.manualSeriesHelp')}
        />
      )}
      <Field label={t('doc.form.period')} required>
        <SearchableSelect
          value={state.periodId}
          onChange={setState.setPeriodId}
          options={masters.periods.map((p: any) => ({ label: p.name, value: p.id }))}
          required
          disabled={locked}
        />
      </Field>
    </div>
  );
};
