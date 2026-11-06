/**
 * Lo que un documento no puede traer, sin base de datos. La web frena parte de esto en el
 * formulario, pero a la API también llegan el importador, los tokens y los plugins.
 */

/** Un error de negocio con el código HTTP que debe ver quien llama. */
export function statusError(statusCode: number, message: string): Error {
  const err: any = new Error(message);
  err.statusCode = statusCode;
  return err;
}

const isBlank = (value: unknown) => value === null || value === undefined || value === '';

const isPercent = (value: number) => Number.isFinite(value) && value >= 0 && value <= 100;

/** Céntimo de margen: el descuento fijo puede venir redondeado. */
const ROUNDING_MARGIN = 0.01;

function lineProblem(line: any, n: number, creditNote: boolean): string | null {
  if (!line?.itemId) return `La línea ${n} no tiene artículo.`;

  const quantity = Number(line.quantity);
  const validQuantity =
    !isBlank(line.quantity) &&
    Number.isFinite(quantity) &&
    quantity !== 0 &&
    (creditNote || quantity > 0);
  if (!validQuantity) return `La cantidad de la línea ${n} no es válida.`;

  const price = isBlank(line.price) ? 0 : Number(line.price);
  if (!Number.isFinite(price)) return `El precio de la línea ${n} no es válido.`;

  if (!isBlank(line.discountRate) && !isPercent(Number(line.discountRate))) {
    return `El descuento de la línea ${n} tiene que estar entre 0 y 100.`;
  }
  if (!isBlank(line.discountAmount)) {
    const discount = Number(line.discountAmount);
    if (
      !Number.isFinite(discount) ||
      Math.abs(discount) > Math.abs(quantity * price) + ROUNDING_MARGIN
    ) {
      return `El descuento de la línea ${n} supera su importe.`;
    }
  }
  if (!isBlank(line.withholdingRate) && !isPercent(Number(line.withholdingRate))) {
    return `La retención de la línea ${n} tiene que estar entre 0 y 100.`;
  }
  if (!isBlank(line.uomFactor)) {
    const factor = Number(line.uomFactor);
    if (!Number.isFinite(factor) || factor <= 0) {
      return `La unidad de la línea ${n} no es válida.`;
    }
  }
  return null;
}

/** La base de una línea, con su descuento. Una línea de descuento lleva el precio en negativo. */
function netOf(line: any): number {
  const gross = Number(line.quantity) * (isBlank(line.price) ? 0 : Number(line.price));
  const fixed = Number(line.discountAmount || 0);
  return gross - (fixed !== 0 ? fixed : (gross * Number(line.discountRate || 0)) / 100);
}

/** El primer problema del documento, o `null` si se puede intentar guardar. */
export function documentProblem(request: any): string | null {
  if (!request?.partnerId) return 'Elige el interlocutor del documento.';
  if (!request.seriesId) return 'Elige la serie de numeración.';
  if (!request.periodId) return 'Elige el periodo contable.';
  if (isBlank(request.date) || Number.isNaN(new Date(request.date).getTime())) {
    return 'La fecha del documento no es válida.';
  }
  if (!isBlank(request.withholdingRate) && !isPercent(Number(request.withholdingRate))) {
    return 'La retención del documento tiene que estar entre 0 y 100.';
  }
  if (!Array.isArray(request.lines) || request.lines.length === 0) {
    return 'El documento no tiene líneas.';
  }
  const creditNote = !!request.rectifiesInvoiceId;
  for (let i = 0; i < request.lines.length; i++) {
    const problem = lineProblem(request.lines[i], i + 1, creditNote);
    if (problem) return problem;
  }
  if (!creditNote) {
    const total = request.lines.reduce((sum: number, line: any) => sum + netOf(line), 0);
    if (total < -ROUNDING_MARGIN) {
      return 'El total del documento no puede ser negativo. Para devolver dinero, usa un abono.';
    }
  }
  return null;
}
