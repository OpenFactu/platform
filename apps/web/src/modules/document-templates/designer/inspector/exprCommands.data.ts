export interface ExprCommand {
  group: string;
  label: string;
  snippet: string;
  hint?: string;
}

/** `group`/`label`/`hint` son claves i18n; `snippet` va tal cual a la plantilla. */
export const EXPR_COMMANDS: ExprCommand[] = [
  {
    group: 'templates.designer.expr.groups.fields',
    label: 'templates.designer.expr.labels.simpleField',
    snippet: '{{doc.docCode}}',
    hint: 'templates.designer.expr.hints.asIs',
  },
  {
    group: 'templates.designer.expr.groups.fields',
    label: 'templates.designer.expr.labels.rawField',
    snippet: '{{{company.logoUrl}}}',
    hint: 'templates.designer.expr.hints.noEscape',
  },
  {
    group: 'templates.designer.expr.groups.format',
    label: 'templates.designer.expr.labels.currency',
    snippet: '{{formatCurrency doc.total}}',
  },
  {
    group: 'templates.designer.expr.groups.format',
    label: 'templates.designer.expr.labels.number',
    snippet: '{{formatNumber valor 2}}',
    hint: 'templates.designer.expr.hints.decimals',
  },
  {
    group: 'templates.designer.expr.groups.format',
    label: 'templates.designer.expr.labels.date',
    snippet: '{{formatDate doc.issueDate}}',
  },
  {
    group: 'templates.designer.expr.groups.format',
    label: 'templates.designer.expr.labels.address',
    snippet: '{{{formatAddress partner.billingAddress}}}',
  },
  {
    group: 'templates.designer.expr.groups.format',
    label: 'templates.designer.expr.labels.padLeft',
    snippet: '{{padLeft valor 6 "0"}}',
  },
  {
    group: 'templates.designer.expr.groups.math',
    label: 'templates.designer.expr.labels.multiply',
    snippet: '{{multiply precio cantidad}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.ifElse',
    snippet: '{{#if doc.paid}}Pagada{{else}}Pendiente{{/if}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.unless',
    snippet: '{{#unless doc.notes}}—{{/unless}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.equal',
    snippet: '{{#if (eq doc.status "paid")}}OK{{/if}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.notEqual',
    snippet: '{{#if (neq doc.status "paid")}}!{{/if}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.greater',
    snippet: '{{#if (gt doc.total 100)}}grande{{/if}}',
  },
  {
    group: 'templates.designer.expr.groups.conditional',
    label: 'templates.designer.expr.labels.less',
    snippet: '{{#if (lt doc.total 100)}}pequeño{{/if}}',
  },
  {
    group: 'templates.designer.expr.groups.iteration',
    label: 'templates.designer.expr.labels.docLines',
    snippet: '{{#each lines}}{{itemName}} x{{quantity}}\n{{/each}}',
  },
  {
    group: 'templates.designer.expr.groups.iteration',
    label: 'templates.designer.expr.labels.vatBreakdown',
    snippet:
      '{{#each doc.taxBreakdown}}{{label "vat"}} {{rate}}%: {{formatCurrency amount}}\n{{/each}}',
  },
  {
    group: 'templates.designer.expr.groups.codes',
    label: 'templates.designer.expr.labels.qr',
    snippet: '<img src="{{{qrCode doc.docCode}}}" style="width:25mm;height:25mm" />',
  },
  {
    group: 'templates.designer.expr.groups.codes',
    label: 'templates.designer.expr.labels.barcode',
    snippet:
      '<img src="{{{barcode doc.docCode symbology="code128" includeText=true}}}" style="width:60mm;height:15mm" />',
  },
];
