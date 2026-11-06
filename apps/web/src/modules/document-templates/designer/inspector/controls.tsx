import React from 'react';
import { Accordion, NumberInput, Switch } from '@openfactu/ui';

/** Apartado plegable del inspector. */
export const Section: React.FC<{
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}> = ({ title, children, defaultOpen = true }) => (
  <Accordion
    type="multiple"
    defaultOpenKeys={defaultOpen ? ['section'] : []}
    items={[
      {
        key: 'section',
        title: <span className="text-xs font-semibold">{title}</span>,
        content: <div className="space-y-2">{children}</div>,
      },
    ]}
  />
);

export const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="text-[11px] font-medium text-fg-muted">{children}</div>
);

export const NumberGrid: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="grid grid-cols-2 gap-2">{children}</div>
);

export const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
}> = ({ label, value, onChange }) => (
  <NumberInput
    label={label}
    inputSize="sm"
    precision={1}
    thousandSeparator={false}
    value={value}
    onChange={(v) => onChange(v ?? 0)}
  />
);

/** Va con Switch: en el inspector cada cambio se aplica al momento. */
export const Toggle: React.FC<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <Switch size="sm" label={label} checked={checked} onChange={onChange} />
);
