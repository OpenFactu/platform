/**
 * La carta de reclamación. Sin colores ni adornos, como los formatos neutros: es un aviso
 * de dinero y tiene que leerse igual en cualquier correo.
 *
 * El texto de fábrica se escribe en español y sale por `tr`; el inglés está en
 * `i18n/messages/en/dunning.ts`. El de la empresa se envía tal cual, escapado: en sus
 * líneas solo cuentan los saltos de párrafo y los datos entre llaves dobles.
 */
import { intlLocale, tr, type Locale } from '../../i18n';
import type { DunningLevel } from './settings';

export interface LetterInvoice {
  code: string;
  dueDate: string;
  days: number;
  amount: number;
}

export interface LetterInput {
  locale: Locale;
  /** Empieza en 1. Por encima del último texto de fábrica se repite el último. */
  level: number;
  template?: DunningLevel;
  company: string;
  partner: string;
  currency: string;
  total: number;
  invoices: LetterInvoice[];
}

export interface RenderedLetter {
  subject: string;
  html: string;
  text: string;
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      (
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }) as Record<
          string,
          string
        >
      )[c] as string,
  );
}

const FACTORY: Array<{ subject: string; body: string[] }> = [
  {
    subject: 'Facturas pendientes de {company}',
    body: [
      'Hola, {partner}:',
      'Según nuestras cuentas, las facturas de abajo están vencidas y sin pagar, por un total de {total}. Te las adjuntamos.',
      'Si ya las has pagado, no hagas caso de este mensaje y disculpa la molestia. Si hay algún problema con ellas, cuéntanoslo.',
    ],
  },
  {
    subject: 'Segundo aviso: facturas vencidas de {company}',
    body: [
      'Hola, {partner}:',
      'Ya te avisamos de estas facturas y siguen sin pagar. El total pendiente es de {total}.',
      'Te pedimos que las pagues cuanto antes o que nos digas cuándo podrás hacerlo.',
    ],
  },
  {
    subject: 'Último aviso: facturas vencidas de {company}',
    body: [
      'Hola, {partner}:',
      'A pesar de los avisos anteriores, estas facturas siguen sin pagar, por un total de {total}.',
      'Necesitamos que las pagues o que te pongas en contacto con nosotros ya. Si no, tendremos que tomar otras medidas.',
    ],
  },
];

function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => (key in vars ? vars[key] : match));
}

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function renderDunningLetter(input: LetterInput): RenderedLetter {
  const { locale, level, template, company, partner, currency, total, invoices } = input;
  const number = new Intl.NumberFormat(intlLocale(locale), {
    style: 'currency',
    currency,
  });
  const dateFormat = new Intl.DateTimeFormat(intlLocale(locale), { timeZone: 'UTC' });
  const money = (value: number) => number.format(value);
  const date = (iso: string) => dateFormat.format(new Date(`${iso}T00:00:00Z`));

  const vars = {
    company,
    partner,
    total: money(total),
    days: String(Math.max(0, ...invoices.map((invoice) => invoice.days))),
  };
  const factory = FACTORY[Math.min(level, FACTORY.length) - 1];
  const subject = template?.subject?.trim()
    ? fillTemplate(template.subject, vars)
    : tr(locale, factory.subject, vars);
  const paragraphs = template?.body?.trim()
    ? paragraphsOf(fillTemplate(template.body, vars))
    : factory.body.map((paragraph) => tr(locale, paragraph, vars));

  const cell = 'padding:8px 12px 8px 0;border-bottom:1px solid #d4d4d4;text-align:left';
  const right = `${cell};text-align:right`;
  const headers = [
    tr(locale, 'Factura'),
    tr(locale, 'Vencimiento'),
    tr(locale, 'Días'),
    tr(locale, 'Pendiente'),
  ];
  const rows = invoices
    .map(
      (invoice) =>
        `<tr><td style="${cell};white-space:nowrap">${escapeHtml(invoice.code)}</td><td style="${cell}">${date(invoice.dueDate)}</td><td style="${right}">${invoice.days}</td><td style="${right}">${money(invoice.amount)}</td></tr>`,
    )
    .join('');
  const html = `<!doctype html>
<html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#000000;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;line-height:1.5">
<div style="max-width:600px">
${paragraphs.map((paragraph) => `<p style="margin:0 0 12px">${escapeHtml(paragraph).replace(/\n/g, '<br/>')}</p>`).join('\n')}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;margin:16px 0">
<thead><tr><th style="${cell}">${escapeHtml(headers[0])}</th><th style="${cell}">${escapeHtml(headers[1])}</th><th style="${right}">${escapeHtml(headers[2])}</th><th style="${right}">${escapeHtml(headers[3])}</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot><tr><td colspan="3" style="padding:8px 12px 8px 0;font-weight:bold">${escapeHtml(tr(locale, 'Total'))}</td><td style="padding:8px 12px 8px 0;text-align:right;font-weight:bold">${money(total)}</td></tr></tfoot>
</table>
<p style="margin:16px 0 0">${escapeHtml(company)}</p>
</div>
</body></html>`;

  const text = [
    ...paragraphs,
    ...invoices.map(
      (invoice) =>
        `${invoice.code} · ${date(invoice.dueDate)} · ${invoice.days} · ${money(invoice.amount)}`,
    ),
    `${tr(locale, 'Total')}: ${money(total)}`,
    company,
  ].join('\n\n');

  return { subject, html, text };
}
