import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, Button, Card, DescriptionList, PageHeader, Stepper } from '@openfactu/ui';
import { ArrowLeft, ArrowRight, Plus, UserPlus } from 'lucide-react';
import { PluginFieldsPanel } from '@/components/PluginFieldsPanel';
import type { PartnerForm } from '../hooks/usePartnerForm';
import {
  PARTNER_WIZARD_STEPS,
  usePartnerWizard,
  type PartnerWizard,
} from '../hooks/usePartnerWizard';
import {
  PartnerAddressesFields,
  PartnerContactFields,
  PartnerFiscalFields,
  PartnerGeneralFields,
} from './PartnerSections';
import { PartnerDuplicatesAlert } from './PartnerDuplicatesAlert';

interface Props {
  form: PartnerForm;
  /** Crea el interlocutor (el padre guarda y navega a su ficha). */
  onCreate: () => Promise<void>;
  onCancel: () => void;
}

/** Resumen del alta antes de crear. */
const Review: React.FC<{ form: PartnerForm; wizard: PartnerWizard }> = ({ form, wizard }) => {
  const { t } = useI18n();
  const { data, addresses, lookups } = form;
  const nameOf = (rows: Array<{ id: string; name: string }>, id: string) =>
    rows.find((r) => r.id === id)?.name ?? null;
  const billing = addresses.filter((a) => a.type === 'B').length;
  const shipping = addresses.length - billing;
  return (
    <DescriptionList
      variant="surface"
      columns={2}
      emptyValue={<span className="text-fg-subtle">—</span>}
      items={[
        {
          key: 'name',
          label: t('partners.fields.legalName'),
          value: data.name.trim(),
          fullWidth: true,
        },
        { key: 'foreign', label: t('partners.fields.tradeName'), value: data.foreignName || null },
        {
          key: 'group',
          label: t('partners.fields.group'),
          value: nameOf(lookups.groups, data.groupId),
        },
        {
          key: 'country',
          label: t('partners.fields.country'),
          value: wizard.country?.name ?? data.countryCode,
        },
        {
          key: 'nif',
          label: wizard.country?.taxIdLabel || t('partners.checks.nif'),
          value: data.nif || null,
          mono: true,
        },
        { key: 'phone', label: t('partners.fields.phone'), value: data.phone || null },
        { key: 'email', label: t('partners.fields.email'), value: data.email || null },
        { key: 'web', label: t('partners.fields.website'), value: data.website || null },
        {
          key: 'price',
          label: t('partners.fields.priceList'),
          value: nameOf(lookups.priceLists, data.priceListId),
        },
        {
          key: 'addresses',
          label: t('partners.wizard.steps.addresses'),
          value: addresses.length
            ? [
                billing && t('partners.wizard.billingCount', { count: billing }),
                shipping && t('partners.wizard.shippingCount', { count: shipping }),
              ]
                .filter(Boolean)
                .join(' · ')
            : null,
        },
        {
          key: 'pay',
          label: t('partners.fields.paymentMethod'),
          value: nameOf(lookups.paymentMethods, data.defaultPaymentMethodId),
        },
        {
          key: 'term',
          label: t('partners.fields.paymentTerm'),
          value: nameOf(lookups.paymentTerms, data.defaultPaymentTermId),
        },
        { key: 'iban', label: 'IBAN', value: data.iban || null, mono: true },
      ]}
    />
  );
};

/**
 * Alta de un interlocutor paso a paso: datos generales, contacto,
 * direcciones, fiscal y banco, y revisión. Usa las mismas secciones que la
 * ficha; cada paso se valida antes de seguir y se avisa si ya existe un
 * interlocutor con el mismo NIF, correo o nombre.
 */
export const PartnerCreateWizard: React.FC<Props> = ({ form, onCreate, onCancel }) => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const wizard = usePartnerWizard(form);
  const { step, isLast } = wizard;
  const current = PARTNER_WIZARD_STEPS[step];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLast) {
      wizard.next();
      return;
    }
    if (wizard.firstInvalid() >= 0) return;
    await onCreate();
  };

  return (
    <form
      className="p-4 pb-28 space-y-6 animate-in fade-in duration-500"
      onSubmit={submit}
      // Los avisos son los del asistente (todos a la vez), no el globo del navegador.
      noValidate
    >
      <PageHeader
        size="md"
        breadcrumbs={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            // En móvil ya está la flecha de volver de la barra superior.
            className="w-fit gap-1 max-md:hidden"
          >
            <ArrowLeft size={12} /> {t('partners.nav.label')}
          </Button>
        }
        title={form.data.name.trim() || t('partners.wizard.newTitle')}
        subtitle={`${t('partners.wizard.stepOf', {
          n: step + 1,
          total: PARTNER_WIZARD_STEPS.length,
        })} · ${t(current.label)}`}
      />

      <Card noPadding className="mx-auto w-full max-w-4xl">
        <div className="overflow-x-auto border-b border-border-default px-4 py-3">
          <Stepper
            aria-label={t('partners.wizard.stepsLabel')}
            size="sm"
            current={step}
            steps={PARTNER_WIZARD_STEPS.map((s) => ({ id: s.id, label: t(s.label) }))}
            onStepClick={(_, i) => wizard.goTo(i)}
          />
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          <div>
            <h2 className="text-lg font-semibold text-fg-default">{t(current.label)}</h2>
            <p className="text-sm text-fg-muted">{t(current.hint)}</p>
          </div>

          <PartnerDuplicatesAlert
            duplicates={wizard.duplicates}
            useLabel={t('partners.wizard.openRecord')}
            onUse={(p) => navigate(`/partners/${p.id}`)}
          />
          {wizard.problems.length > 0 && (
            <Alert tone="danger" title={t('partners.wizard.reviewBeforeContinuing')} role="alert">
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
                {wizard.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </Alert>
          )}

          {current.id === 'general' && <PartnerGeneralFields form={form} />}
          {current.id === 'contact' && <PartnerContactFields form={form} />}
          {current.id === 'addresses' && (
            <div className="space-y-3">
              {form.addresses.length > 0 && (
                <div className="flex justify-end">
                  <Button type="button" variant="secondary" size="sm" onClick={form.addAddress}>
                    <Plus size={14} /> {t('partners.addresses.new')}
                  </Button>
                </div>
              )}
              <PartnerAddressesFields form={form} />
            </div>
          )}
          {current.id === 'fiscal' && (
            <div className="space-y-6">
              <PartnerFiscalFields form={form} />
              <PluginFieldsPanel
                tableName="BusinessPartner"
                values={form.pluginValues}
                onChange={form.setPluginValue}
                layout="inline"
                title={t('partners.common.customFields')}
              />
            </div>
          )}
          {current.id === 'review' && <Review form={form} wizard={wizard} />}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border-default px-4 py-3 sm:px-6">
          {step > 0 ? (
            <Button type="button" variant="secondary" onClick={wizard.back}>
              <ArrowLeft size={14} /> {t('partners.common.back')}
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={onCancel}>
              {t('partners.common.cancel')}
            </Button>
          )}
          {isLast ? (
            <Button type="submit" isLoading={form.saving}>
              {!form.saving && <UserPlus size={14} />} {t('partners.wizard.create')}
            </Button>
          ) : (
            <Button type="submit">
              {t('partners.common.next')} <ArrowRight size={14} />
            </Button>
          )}
        </div>
      </Card>
    </form>
  );
};
