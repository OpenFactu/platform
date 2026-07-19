/** Etiquetas humanas para las tools del backend (core/ai/tools). */
export const TOOL_LABELS: Record<string, string> = {
  search_partners: 'Buscando interlocutores',
  search_items: 'Buscando artículos',
  list_documents: 'Listando documentos',
  get_document: 'Consultando documento',
  list_tables: 'Listando tablas de la base de datos',
  get_table_columns: 'Consultando columnas',
  run_read_query: 'Ejecutando consulta de lectura',
  create_document: 'Crear documento (borrador)',
  propose_dashboard_widget: 'Añadir widget al Dashboard',
  render_component: 'Generando vista',
  create_excel: 'Generando Excel',
  create_word: 'Generando Word',
  create_pdf: 'Generando PDF',
  preview_document_template: 'Generando vista previa de plantilla',
  create_document_template: 'Guardar plantilla de documento',
  list_warehouses: 'Consultando almacenes',
  list_departments: 'Consultando departamentos',
  create_partner: 'Crear interlocutor',
  create_stock_transfer: 'Crear traslado de stock',
  create_goods_receipt: 'Crear entrada de mercancía',
  create_employee: 'Dar de alta empleado',
};

/** Nombres de las tools de ACCIÓN — su tarjeta de confirmación se resalta. */
export const ACTION_LABELS: Record<string, string> = {
  create_document: 'Crear documento en borrador',
  propose_dashboard_widget: 'Añadir widget al Dashboard',
  create_document_template: 'Guardar plantilla de documento',
  create_partner: 'Crear interlocutor',
  create_stock_transfer: 'Crear traslado de stock',
  create_goods_receipt: 'Crear entrada de mercancía',
  create_employee: 'Dar de alta empleado',
};

/** Mismo nombre que en apps/server/src/core/ai/chat/chatEngine.ts (ASSISTANT_NAME). */
export const ASSISTANT_NAME = 'Keiro';

export const SUGGESTIONS = [
  '¿Cuáles son las últimas facturas de venta?',
  '¿Qué clientes tenemos dados de alta?',
  'Busca el artículo con más líneas vendidas este año',
];

export const MAX_ATTACHMENTS = 4;
export const MAX_ATTACHMENT_MB = 5;
