/** Etiquetas humanas para las tools del backend (core/ai/tools). Claves de i18n. */
export const TOOL_LABELS: Record<string, string> = {
  search_partners: 'ai.tools.search_partners',
  search_items: 'ai.tools.search_items',
  list_documents: 'ai.tools.list_documents',
  get_document: 'ai.tools.get_document',
  list_tables: 'ai.tools.list_tables',
  get_table_columns: 'ai.tools.get_table_columns',
  run_read_query: 'ai.tools.run_read_query',
  create_document: 'ai.tools.create_document',
  propose_dashboard_widget: 'ai.tools.propose_dashboard_widget',
  render_component: 'ai.tools.render_component',
  ask_user_question: 'ai.tools.ask_user_question',
  create_excel: 'ai.tools.create_excel',
  create_word: 'ai.tools.create_word',
  create_pdf: 'ai.tools.create_pdf',
  preview_document_template: 'ai.tools.preview_document_template',
  create_document_template: 'ai.tools.create_document_template',
  list_warehouses: 'ai.tools.list_warehouses',
  list_departments: 'ai.tools.list_departments',
  create_partner: 'ai.tools.create_partner',
  create_partners_bulk: 'ai.tools.create_partners_bulk',
  create_stock_transfer: 'ai.tools.create_stock_transfer',
  create_goods_receipt: 'ai.tools.create_goods_receipt',
  create_employee: 'ai.tools.create_employee',
};

/** Nombres de las tools de ACCIÓN — su tarjeta de confirmación se resalta. */
export const ACTION_LABELS: Record<string, string> = {
  create_document: 'ai.actions.create_document',
  propose_dashboard_widget: 'ai.actions.propose_dashboard_widget',
  create_document_template: 'ai.actions.create_document_template',
  create_partner: 'ai.actions.create_partner',
  create_partners_bulk: 'ai.actions.create_partners_bulk',
  create_stock_transfer: 'ai.actions.create_stock_transfer',
  create_goods_receipt: 'ai.actions.create_goods_receipt',
  create_employee: 'ai.actions.create_employee',
};

/** Mismo nombre que en apps/server/src/core/ai/chat/chatEngine.ts (ASSISTANT_NAME). */
export const ASSISTANT_NAME = 'Keiro';

/** Claves de i18n. */
export const SUGGESTIONS = [
  'ai.suggestions.facturas',
  'ai.suggestions.clientes',
  'ai.suggestions.articulo',
];

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_MB = 5;
