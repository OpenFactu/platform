/**
 * Modelo del layout tipo canvas para plantillas de documento.
 *
 * Se persiste en DocumentTemplate.canvasLayout (JSONB). El compilador
 * canvas→HTML lo lee y genera la columna `html` existente, que sigue
 * alimentando al renderizador PDF.
 *
 * Todas las dimensiones (mm para bandas y márgenes, puntos proporcionales
 * al ancho de la banda para elementos) se normalizan dentro del módulo del
 * compilador. Los tipos aquí son el contrato de datos, no de presentación.
 */

export type LayoutVersion = 1;

/**
 * Tamaños de página soportados. Además de los tradicionales A4/Letter se
 * incluyen formatos pequeños para tiquets de venta (80mm térmico) y
 * etiquetas adhesivas habituales. `Custom` activa los campos
 * `customWidthMm`/`customHeightMm` del layout.
 */
export type PageSize =
  | 'A4'
  | 'Letter'
  | 'Ticket80'
  | 'Ticket58'
  | 'Label100x62'
  | 'Label70x37'
  | 'Label50x25'
  | 'Custom';

/** Dimensiones físicas (mm) por preset. Para `Custom`, se ignoran. */
export const PAGE_SIZE_MM: Record<
  Exclude<PageSize, 'Custom'>,
  { width: number; height: number }
> = {
  A4: { width: 210, height: 297 },
  Letter: { width: 216, height: 279 },
  // Tiquets térmicos: ancho fijo, alto razonablemente corto. El usuario puede
  // ampliar el alto desde el inspector si necesita más espacio (las bandas se
  // suman). Puppeteer respeta el @page emitido por el compileCanvas.
  Ticket80: { width: 80, height: 200 },
  Ticket58: { width: 58, height: 200 },
  // Etiquetas adhesivas habituales (DHL/SEUR pequeñas, Avery 70x37, 50x25).
  Label100x62: { width: 100, height: 62 },
  Label70x37: { width: 70, height: 37 },
  Label50x25: { width: 50, height: 25 },
};

/** Etiqueta visible para cada tamaño en el inspector. */
export const PAGE_SIZE_LABELS: Record<PageSize, string> = {
  A4: 'A4 (210 × 297 mm)',
  Letter: 'Letter (216 × 279 mm)',
  Ticket80: 'Tiquet 80 mm (térmico)',
  Ticket58: 'Tiquet 58 mm (térmico)',
  Label100x62: 'Etiqueta 100 × 62 mm',
  Label70x37: 'Etiqueta 70 × 37 mm',
  Label50x25: 'Etiqueta 50 × 25 mm',
  Custom: 'Personalizado…',
};

export interface Margins {
  /** mm */
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type BandKind = 'pageHeader' | 'docHeader' | 'detail' | 'totals' | 'pageFooter' | 'custom';

export interface Band {
  id: string;
  kind: BandKind;
  /** Alto de la banda en mm. */
  height: number;
  elements: CanvasElement[];
  /** Si `true`, la banda no se emite al compilar y no acumula altura. */
  hidden?: boolean;
  /** Etiqueta visible. Requerida para `kind: 'custom'`; override opcional para el resto. */
  label?: string;
}

/** Estilo común que puede aplicar cualquier elemento. */
export interface ElementStyle {
  fontFamily?: string;
  /** pt */
  fontSize?: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
  color?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  borderWidth?: number;
  borderColor?: string;
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  /** px */
  padding?: number;
  /** Radio de esquina en px (lo usa sobre todo la Caja/Contenedor). */
  borderRadius?: number;
}

/** Base compartida por todos los elementos. Coordenadas en mm respecto al origen de la banda. */
export interface BaseElement {
  id: string;
  x: number;
  y: number;
  /** Ancho en mm. */
  w: number;
  /** Alto en mm. */
  h: number;
  style?: ElementStyle;
  /**
   * Clase(s) CSS extra para el nodo raíz del elemento. Permite apuntar a este
   * elemento desde la hoja de estilos global (`CanvasLayout.customCss`).
   */
  className?: string;
  /**
   * Declaraciones CSS inline extra que se anexan al `style` del nodo raíz
   * (ej. "letter-spacing:2px;text-transform:uppercase"). Son DECLARACIONES, no
   * reglas: para selectores completos usa `className` + la hoja global.
   */
  customCss?: string;
  /** Si `true`, el elemento no se emite al compilar (se puede re-mostrar desde el diseñador). */
  hidden?: boolean;
  /** Si `true`, no se puede arrastrar ni redimensionar en el diseñador. */
  locked?: boolean;
}

/** Texto fijo. */
export interface TextElement extends BaseElement {
  kind: 'text';
  text: string;
  /**
   * Si `true`, `text` se emite SIN escapar HTML, permitiendo usar expresiones
   * Handlebars completas (helpers, condicionales, iteradores) como si fuera
   * una plantilla. Ej.: `{{#if doc.paid}}Pagada{{else}}Pendiente{{/if}}` o
   * `{{formatCurrency doc.total "EUR"}}`. Úsalo con cuidado: el contenido se
   * inyecta tal cual en el HTML resultante.
   */
  raw?: boolean;
  /**
   * Si `true`, `text` contiene HTML producido por el editor de texto rico
   * (negritas, cursivas, colores en partes del texto, etc.) y se emite tal
   * cual al render. Mutuamente excluyente con `raw`: si ambos vienen `true`,
   * gana `raw`. Ignorado cuando ambos son falsy → texto plano escapado.
   */
  rich?: boolean;
}

/** Imagen por URL o data URI. */
export interface ImageElement extends BaseElement {
  kind: 'image';
  src: string;
  fit?: 'contain' | 'cover' | 'fill';
}

/** Separadores decorativos (línea o rectángulo). */
export interface ShapeElement extends BaseElement {
  kind: 'shape';
  shape: 'line' | 'rect';
}

/** Hueco vertical para espaciar. Sin render visible. */
export interface SpacerElement extends BaseElement {
  kind: 'spacer';
}

/**
 * Campo vinculado a datos. `path` es una expresión tipo "document.number",
 * "customer.address.city", "totals.subtotal"… El compilador la traduce a
 * Handlebars (`{{document.number}}`).
 *
 * `format` es opcional: "currency" | "date" | "number" | "percent" — por
 * ahora se mapean a helpers existentes del paquete @openfactu/pdf.
 */
export interface FieldElement extends BaseElement {
  kind: 'field';
  path: string;
  format?: 'currency' | 'date' | 'number' | 'percent' | 'address';
  /** Literal a anteponer ("Nº Factura: "). Si `rich`, puede contener HTML. */
  prefix?: string;
  /** Literal a añadir al final. Si `rich`, puede contener HTML. */
  suffix?: string;
  /**
   * Si `true`, `prefix` y `suffix` se interpretan como HTML producido por
   * el editor de texto rico (negritas, cursivas, colores). Si es falsy, se
   * tratan como texto plano y se escapan al renderizar.
   */
  rich?: boolean;
}

/** Columna de la tabla de líneas. `path` es relativo al contexto de línea. */
export interface LinesTableColumn {
  id: string;
  /** Cabecera visible. */
  label: string;
  /** Expresión relativa a cada línea (p.ej. "item.name", "quantity", "lineTotal"). */
  path: string;
  /** Ancho proporcional (suma de todas las columnas = 100). */
  widthPct: number;
  /** Alineación del contenido. */
  align?: 'left' | 'center' | 'right';
  format?: FieldElement['format'];
  /** Estilo tipográfico aplicado a las celdas de esta columna (y a su cabecera). */
  style?: ElementStyle;
  /** Estilo específico de la cabecera. Si se omite, se hereda de `style`. */
  headerStyle?: ElementStyle;
}

/**
 * Tabla de líneas. Por defecto itera sobre `lines` (banda `detail`). Si
 * `source` empieza por `query:NOMBRE`, itera sobre los resultados de la
 * consulta SQL `queries.NOMBRE` (admin), permitiendo usarla en cualquier
 * banda. Los `path` de las columnas son relativos al contexto iterado.
 */
export interface LinesTableElement extends BaseElement {
  kind: 'linesTable';
  columns: LinesTableColumn[];
  /** Muestra o no la fila de cabecera. */
  showHeader?: boolean;
  /** Fuente de iteración. `'lines'` (default) o `'query:NOMBRE'`. */
  source?: string;
  /** Preset visual de la tabla. Default `'default'`. */
  tableStyle?: 'default' | 'bordered' | 'striped' | 'compact' | 'borderless';
  /** Fondo de la fila de cabecera (override del preset). */
  headerBg?: string;
  /** Padding de celda en px (override del preset). */
  cellPadding?: number;
  /** Color de los bordes (override del preset). */
  borderColor?: string;
  /**
   * Disposición: `'table'` (tabla clásica, default) o `'keyValue'` (lista
   * vertical etiqueta:valor que itera las líneas, una agrupación por línea).
   */
  layout?: 'table' | 'keyValue';
}

/**
 * Bloque de totales. El compilador decide qué totales renderizar (subtotal,
 * desglose de impuestos, total). `fields` permite ocultar partes si se quiere.
 */
export interface TotalsElement extends BaseElement {
  kind: 'totals';
  showSubtotal?: boolean;
  showTaxBreakdown?: boolean;
  showTotal?: boolean;
}

/** Código QR. `value` es una expresión tipo campo (p.ej. "verifactu.qrPayload"). */
export interface QRElement extends BaseElement {
  kind: 'qr';
  value: string;
  /** Pixeles por módulo. Por defecto 4. */
  scale?: number;
}

/**
 * Identificadores de simbología soportados (los que entiende bwip-js, que es
 * la librería que renderiza el SVG en el servidor). Ampliamos el alcance del
 * MVP original para cubrir los formatos habituales de retail (UPC, ITF-14),
 * industria (Code 39/93, GS1-128, ISBN) y 2D (DataMatrix, PDF417, QR).
 *
 * Para el listado completo ver https://github.com/metafloor/bwip-js — aquí
 * limitamos a los que tienen sentido en una etiqueta de producto/documento.
 */
export type BarcodeSymbology =
  /**
   * `auto`: el helper detecta el formato adecuado según el valor:
   *  - 13 dígitos + checksum mod-10 OK → EAN-13
   *  - 12 dígitos + checksum OK → UPC-A
   *  - 8 dígitos + checksum OK → EAN-8
   *  - 14 dígitos → ITF-14
   *  - Resto → Code 128
   * Cualquier valor que no encaje cae a Code 128 sin fallar.
   */
  | 'auto'
  // Lineales 1D
  | 'code128'
  | 'code39'
  | 'code93'
  | 'ean13'
  | 'ean8'
  | 'upca'
  | 'upce'
  | 'itf14'
  | 'interleaved2of5'
  | 'gs1-128'
  | 'isbn'
  | 'codabar'
  // 2D (matriz)
  | 'datamatrix'
  | 'pdf417'
  | 'qrcode'
  | 'azteccode';

/** Código de barras lineal o 2D. */
export interface BarcodeElement extends BaseElement {
  kind: 'barcode';
  value: string;
  symbology: BarcodeSymbology;
  /** Muestra el texto legible bajo el código. */
  includeText?: boolean;
}

/**
 * Elemento condicional: renderiza `thenText` si la condición se cumple,
 * `elseText` en caso contrario. El compilador lo traduce a un `{{#if}}`
 * Handlebars envolviendo el helper adecuado (`eq`, `neq`, `gt`, `lt`) o,
 * si el operador es `truthy`/`falsy`, usa directamente el valor del path.
 * Los textos admiten cualquier expresión Handlebars — se inyectan en crudo.
 */
export interface ConditionalElement extends BaseElement {
  kind: 'conditional';
  path: string;
  operator: 'truthy' | 'falsy' | 'eq' | 'neq' | 'gt' | 'lt';
  /** Valor a comparar (ignorado en truthy/falsy). Se trata como literal. */
  value?: string;
  /** Contenido Handlebars cuando la condición se cumple. */
  thenText: string;
  /** Contenido Handlebars cuando la condición NO se cumple. Opcional. */
  elseText?: string;
}

/** Caja para una firma: línea horizontal con etiqueta debajo. */
export interface SignatureElement extends BaseElement {
  kind: 'signature';
  label?: string;
}

/** Forzar salto de página en el punto donde se coloca. */
export interface PageBreakElement extends BaseElement {
  kind: 'pageBreak';
}

/** Línea separadora (divisor) horizontal o vertical. Color/grosor/estilo vía `style`. */
export interface DividerElement extends BaseElement {
  kind: 'divider';
  orientation?: 'horizontal' | 'vertical';
}

/**
 * Campo de resumen/agregado: aplica una operación sobre una colección. `source`
 * es `'lines'` (default) o `'query:NOMBRE'`. `path` es la columna a agregar
 * (relativa a cada fila); se ignora para `count`. El compilador lo traduce a una
 * subexpresión Handlebars con los helpers `sum/count/avg/min/max` del servidor.
 */
export interface SummaryElement extends BaseElement {
  kind: 'summary';
  op: 'sum' | 'count' | 'avg' | 'min' | 'max';
  source?: string;
  path?: string;
  format?: FieldElement['format'];
  prefix?: string;
  suffix?: string;
}

/** Caja/contenedor visual: fondo, borde y esquinas redondeadas (vía `style`). */
export interface BoxElement extends BaseElement {
  kind: 'box';
}

/**
 * Lista (viñetas o numerada) que itera una colección. `source` es `'lines'` o
 * `'query:NOMBRE'`; `itemPath` es el campo a mostrar por elemento (relativo).
 */
export interface ListElement extends BaseElement {
  kind: 'list';
  source?: string;
  itemPath?: string;
  ordered?: boolean;
  marker?: 'bullet' | 'number' | 'none';
}

/** Fecha/hora de generación del documento. */
export interface CurrentDateElement extends BaseElement {
  kind: 'currentDate';
  mode?: 'date' | 'datetime';
  prefix?: string;
}

export type CanvasElement =
  | TextElement
  | ImageElement
  | ShapeElement
  | SpacerElement
  | FieldElement
  | LinesTableElement
  | TotalsElement
  | QRElement
  | BarcodeElement
  | ConditionalElement
  | SignatureElement
  | PageBreakElement
  | DividerElement
  | SummaryElement
  | BoxElement
  | ListElement
  | CurrentDateElement;

export type ElementKind = CanvasElement['kind'];

/** Marca de agua opcional que se renderiza detrás del contenido de la página. */
export interface Watermark {
  /** Si es `false`, la marca no se emite. */
  enabled: boolean;
  /** Texto a mostrar. Admite expresiones Handlebars (p.ej. `{{doc.status}}`). */
  text: string;
  /** Color del texto. Por defecto `#94a3b8` (slate-400). */
  color?: string;
  /** Opacidad 0..1. Por defecto 0.15. */
  opacity?: number;
  /** Ángulo en grados. Por defecto -30. */
  rotation?: number;
  /** Tamaño de fuente en pt. Por defecto 84. */
  fontSize?: number;
  /** Peso tipográfico. Por defecto `bold`. */
  fontWeight?: 'normal' | 'bold';
}

/** Configuración del pie con números de página — lo renderiza Puppeteer. */
export interface PageNumberConfig {
  enabled: boolean;
  alignment?: 'left' | 'center' | 'right';
  /**
   * Formato del texto. `{page}` y `{pages}` se sustituyen por los valores
   * actuales. Por defecto: `"{page} / {pages}"`.
   */
  format?: string;
}

/** Raíz del layout persistido. */
export interface CanvasLayout {
  version: LayoutVersion;
  pageSize: PageSize;
  margins: Margins;
  bands: Band[];
  /** Marca de agua (opcional). Ausente equivale a desactivada. */
  watermark?: Watermark;
  /** Numeración de páginas (opcional). */
  pageNumbers?: PageNumberConfig;
  /**
   * Añade un QR de verificación al pie de cada página (trazabilidad tipo
   * Veri*Factu). Ausente/`false` equivale a desactivado — el diseñador debe
   * activarlo explícitamente para que aparezca.
   */
  showDocQr?: boolean;
  /** Añade un código de barras Code-128 con el docCode al pie de cada página. */
  showDocBarcode?: boolean;
  /**
   * Consultas SQL asociadas a la plantilla (solo-lectura, admin-only).
   * Se ejecutan al renderizar y su resultado queda disponible en el contexto
   * Handlebars como `queries.<name>`. Un array vacío o ausente = sin SQL.
   */
  queries?: Array<{ name: string; sql: string }>;
  /**
   * Parámetros de prueba para las queries del preview.
   * Ej: `{ itemId: 'xxx', batch: 'yyy' }`. Se pasan al servidor como
   * `params` y sustituyen los placeholders `:xxx` en las queries.
   */
  testParams?: Record<string, unknown>;
  /** Ancho en mm para `pageSize === 'Custom'`. Ignorado en cualquier otro caso. */
  customWidthMm?: number;
  /** Alto en mm para `pageSize === 'Custom'`. Ignorado en cualquier otro caso. */
  customHeightMm?: number;
  /**
   * Si está presente, el layout se construyó con el modo simple del editor
   * de etiquetas. Permite editar la etiqueta volviendo a ese modo en lugar
   * de tocar el canvas a mano. Las modificaciones manuales en el canvas se
   * pierden al re-aplicar el modo simple — el editor avisa antes.
   */
  simpleLabel?: SimpleLabelSettings;
  /**
   * Hoja de estilos global del documento. Se inyecta en el `<style>` al compilar
   * (vía la opción `extraCss` de `compileCanvas`), DESPUÉS del CSS base, por lo
   * que puede sobreescribir cualquier estilo por defecto. Persiste dentro de
   * `canvasLayout`. Útil para apuntar a clases puestas en `BaseElement.className`.
   */
  customCss?: string;
  /**
   * Metadata de los parámetros de entrada (placeholders `:nombre` de las
   * `queries`) para el formulario de generación: etiqueta visible, tipo de
   * campo, obligatoriedad y valor por defecto. Los placeholders sin entrada aquí
   * se tratan como texto. No incluye los estándar (docId/partnerId/...).
   */
  paramsSchema?: ParamDef[];
}

/** Definición de un parámetro de entrada para generar el documento. */
export interface ParamDef {
  /** Nombre del placeholder (sin `:`). */
  name: string;
  /** Etiqueta visible en el formulario. Por defecto, el `name`. */
  label?: string;
  /**
   * Tipo de campo del formulario. Por defecto `'text'`.
   * - `select`: lista desplegable, se elige UN valor.
   * - `multiselect`: lista con selección múltiple; se envía como array y se
   *   expande a `(v1, v2, …)` en SQL (para `WHERE x IN (:param)`).
   */
  type?: 'text' | 'number' | 'date' | 'select' | 'multiselect';
  /** Opciones fijas (para `select`/`multiselect`). Cada opción es `valor` o `valor|etiqueta`. */
  options?: string[];
  /**
   * SQL que provee las opciones de un `select`/`multiselect` (lookup). Debe
   * devolver una columna `value` y, opcionalmente, `label` (si falta, se usa
   * `value`). Solo `SELECT`/`WITH`. Tiene prioridad sobre `options`.
   */
  optionsQuery?: string;
  /** Si es obligatorio para generar. */
  required?: boolean;
  /** Valor inicial del campo. */
  default?: string;
}

/**
 * Devuelve las dimensiones físicas (mm) efectivas del layout, resolviendo
 * `Custom` con sus campos `customWidthMm`/`customHeightMm` y aplicando un
 * default razonable si faltan.
 */
export function resolvePageDimensions(layout: CanvasLayout): { width: number; height: number } {
  if (layout.pageSize === 'Custom') {
    return {
      width: Math.max(10, layout.customWidthMm ?? 100),
      height: Math.max(10, layout.customHeightMm ?? 100),
    };
  }
  return PAGE_SIZE_MM[layout.pageSize];
}

/** Layout inicial vacío para una plantilla recién creada. */
export function createEmptyLayout(): CanvasLayout {
  return {
    version: 1,
    pageSize: 'A4',
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    bands: [
      { id: 'b_pageHeader', kind: 'pageHeader', height: 15, elements: [] },
      { id: 'b_docHeader', kind: 'docHeader', height: 35, elements: [] },
      { id: 'b_detail', kind: 'detail', height: 180, elements: [] },
      { id: 'b_totals', kind: 'totals', height: 30, elements: [] },
      { id: 'b_pageFooter', kind: 'pageFooter', height: 18, elements: [] },
    ],
  };
}

/**
 * Layout preconfigurado para un tiquet 80mm térmico. Márgenes mínimos,
 * banda de detalle alta para acomodar muchas líneas; el alto total se ajusta
 * automáticamente al contenido si el tiquet sobrepasa los 200mm definidos
 * porque Puppeteer reflowea sobre múltiples páginas.
 */
export function createTicketLayout(): CanvasLayout {
  return {
    version: 1,
    pageSize: 'Ticket80',
    margins: { top: 3, right: 3, bottom: 3, left: 3 },
    bands: [
      { id: 'b_docHeader', kind: 'docHeader', height: 28, elements: [] },
      { id: 'b_detail', kind: 'detail', height: 130, elements: [] },
      { id: 'b_totals', kind: 'totals', height: 25, elements: [] },
      { id: 'b_pageFooter', kind: 'pageFooter', height: 15, elements: [] },
    ],
  };
}

/**
 * Layout preconfigurado para una etiqueta adhesiva 100×62mm (tipo envío
 * pequeño). Una sola banda `detail` que ocupa toda la etiqueta — lo típico
 * es maquetar logo + dirección + barcode/QR sin separación lógica.
 *
 * Trae **elementos de muestra** para una etiqueta de artículo: nombre del
 * producto, código de barras EAN/Code128 y precio. Los datos se obtienen
 * de la query `item` (preconfigurada) que lee la tabla `Item` por `:itemId`.
 * El usuario puede borrarlos o ajustarlos desde el inspector.
 */
export function createLabelLayout(): CanvasLayout {
  return {
    version: 1,
    pageSize: 'Label100x62',
    margins: { top: 2, right: 2, bottom: 2, left: 2 },
    bands: [
      {
        id: 'b_detail',
        kind: 'detail',
        height: 58,
        elements: [
          // Nombre del artículo (texto Handlebars sobre queries.item).
          {
            id: 'el_label_name',
            kind: 'text',
            x: 2,
            y: 2,
            w: 96,
            h: 10,
            text: '{{queries.item.0.name}}',
            raw: true,
            style: { fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
          } as TextElement,
          // Código de barras Code128 a partir del code del artículo.
          {
            id: 'el_label_barcode',
            kind: 'barcode',
            x: 6,
            y: 14,
            w: 88,
            h: 26,
            value: 'queries.item.0.barcode',
            symbology: 'auto',
            includeText: true,
          } as BarcodeElement,
          // Precio base con formato moneda (helper formatCurrency).
          {
            id: 'el_label_price',
            kind: 'text',
            x: 2,
            y: 44,
            w: 96,
            h: 12,
            text: '{{formatCurrency queries.item.0.basePrice "EUR"}}',
            raw: true,
            style: { fontSize: 16, fontWeight: 'bold', textAlign: 'center' },
          } as TextElement,
        ],
      },
    ],
    queries: [
      {
        name: 'item',
        // `barcode` puede ser NULL si todavía no se ha registrado para el
        // artículo; en ese caso caemos al `code` interno para que la etiqueta
        // siga generando un código de barras válido.
        sql:
          'SELECT id, code, name, "basePrice", description, ' +
          "COALESCE(NULLIF(TRIM(COALESCE(\"barcode\", '')), ''), code) AS barcode " +
          'FROM "Item" WHERE id = :itemId',
      },
    ],
  };
}

/**
 * Configuración del "modo simple" del editor de etiquetas. Se guarda en
 * `CanvasLayout.simpleLabel` y permite reconstruir el layout completo desde
 * un puñado de toggles, sin necesidad de tocar el diseñador canvas. Si está
 * presente, el editor de plantillas abre el modo simple por defecto.
 */
export interface SimpleLabelSettings {
  /** Origen de los datos: artículo (queries.item) o documento (params). */
  kind: 'article' | 'document';
  pageSize: PageSize;
  /** Solo aplica si pageSize === 'Custom'. */
  customWidthMm?: number;
  customHeightMm?: number;
  showTitle?: boolean;
  titleText?: string;
  showName?: boolean;
  showCode?: boolean;
  showPrice?: boolean;
  showBarcode?: boolean;
  barcodeSymbology?: BarcodeSymbology;
  showQr?: boolean;
  /** Texto fijo extra (debajo). Admite expresiones Handlebars. */
  footerText?: string;
  /** Color principal usado para los textos destacados. */
  accentColor?: string;
}

/**
 * Layout preconfigurado para una etiqueta de DOCUMENTO (albarán, pedido,
 * factura). Usa los `params` que envía el botón "Etiqueta" de
 * DocumentActionBar (`docId`, `docCode`) — no necesita queries SQL.
 *
 * El barcode toma `params.docCode` directamente, así sirve para cualquier
 * tipo de documento sin que el usuario tenga que escribir SQL.
 */
export function createDocumentLabelLayout(): CanvasLayout {
  return {
    version: 1,
    pageSize: 'Label100x62',
    margins: { top: 2, right: 2, bottom: 2, left: 2 },
    bands: [
      {
        id: 'b_detail',
        kind: 'detail',
        height: 58,
        elements: [
          {
            id: 'el_doc_label_title',
            kind: 'text',
            x: 2,
            y: 2,
            w: 96,
            h: 8,
            text: 'DOCUMENTO',
            raw: false,
            style: { fontSize: 9, fontWeight: 'bold', textAlign: 'center', color: '#64748b' },
          } as TextElement,
          {
            id: 'el_doc_label_code',
            kind: 'text',
            x: 2,
            y: 10,
            w: 96,
            h: 8,
            text: '{{params.docCode}}',
            raw: true,
            style: { fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
          } as TextElement,
          {
            id: 'el_doc_label_barcode',
            kind: 'barcode',
            x: 6,
            y: 20,
            w: 88,
            h: 32,
            value: 'params.docCode',
            symbology: 'auto',
            includeText: true,
          } as BarcodeElement,
        ],
      },
    ],
    // Sin queries — el render-free funciona aunque no haya admin ni BD que tocar.
  };
}

/**
 * Layout preconfigurado para un tiquet de venta 80mm térmico con cabecera
 * (nombre empresa), bloque de líneas y total. Usa los campos estándar de un
 * documento (`doc.*`/`lines`/`company.*`/`partner.*`) — pensado para asignarse
 * a un `docType` de venta (SINV/SDN) a tamaño tiquet, no para FREE.
 */
export function createSalesTicketLayout(): CanvasLayout {
  return {
    version: 1,
    pageSize: 'Ticket80',
    margins: { top: 3, right: 3, bottom: 3, left: 3 },
    bands: [
      {
        id: 'b_docHeader',
        kind: 'docHeader',
        height: 28,
        elements: [
          {
            id: 'el_t_company',
            kind: 'text',
            x: 2,
            y: 1,
            w: 74,
            h: 6,
            text: '{{company.name}}',
            raw: true,
            style: { fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
          } as TextElement,
          {
            id: 'el_t_doccode',
            kind: 'text',
            x: 2,
            y: 9,
            w: 74,
            h: 5,
            text: 'Tiquet {{doc.docCode}}',
            raw: true,
            style: { fontSize: 9, textAlign: 'center' },
          } as TextElement,
          {
            id: 'el_t_date',
            kind: 'text',
            x: 2,
            y: 15,
            w: 74,
            h: 5,
            text: '{{formatDate doc.dateIssue}}',
            raw: true,
            style: { fontSize: 8, textAlign: 'center', color: '#64748b' },
          } as TextElement,
        ],
      },
      {
        id: 'b_detail',
        kind: 'detail',
        height: 130,
        elements: [
          {
            id: 'el_t_lines',
            kind: 'linesTable',
            x: 0,
            y: 0,
            w: 76,
            h: 120,
            showHeader: true,
            columns: [
              { id: 'c_name', label: 'Producto', path: 'itemName', widthPct: 55, align: 'left' },
              { id: 'c_qty', label: 'Cant', path: 'quantity', widthPct: 15, align: 'right' },
              {
                id: 'c_total',
                label: 'Total',
                path: 'lineTotal',
                widthPct: 30,
                align: 'right',
                format: 'currency',
              },
            ],
          } as LinesTableElement,
        ],
      },
      {
        id: 'b_totals',
        kind: 'totals',
        height: 25,
        elements: [
          {
            id: 'el_t_totals',
            kind: 'totals',
            x: 0,
            y: 2,
            w: 76,
            h: 20,
            showSubtotal: true,
            showTaxBreakdown: true,
            showTotal: true,
          } as TotalsElement,
        ],
      },
      {
        id: 'b_pageFooter',
        kind: 'pageFooter',
        height: 15,
        elements: [
          {
            id: 'el_t_thanks',
            kind: 'text',
            x: 2,
            y: 2,
            w: 74,
            h: 5,
            text: '¡Gracias por su compra!',
            raw: false,
            style: { fontSize: 9, textAlign: 'center', fontStyle: 'italic' },
          } as TextElement,
        ],
      },
    ],
  };
}
