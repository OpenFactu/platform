/** Mensajes de bancos: cuentas, extractos, conciliación y remesas. Ver `../../index.ts`. */
export default {
  // ── Cuentas ──
  'Ponle un nombre a la cuenta.': 'Give the account a name.',
  'Ese IBAN no es válido.': 'That IBAN is not valid.',
  'Esa cuenta contable no existe.': 'That ledger account does not exist.',
  'Esa moneda no existe.': 'That currency does not exist.',
  'Esta cuenta tiene movimientos: desactívala en lugar de borrarla.':
    'This account has movements: deactivate it instead of deleting it.',
  'Esa cuenta del banco no existe.': 'That bank account does not exist.',
  'Esa cuenta del banco está desactivada.': 'That bank account is deactivated.',

  // ── Extractos ──
  'Falta el fichero del extracto.': 'The statement file is missing.',
  'El fichero está vacío.': 'The file is empty.',
  'Ese formato de extracto no está disponible.': 'That statement format is not available.',
  'Ese fichero no se puede leer.': 'That file cannot be read.',
  'El fichero no tiene filas.': 'The file has no rows.',
  'Di qué columna es la fecha.': 'Say which column is the date.',
  'Di qué columna es el importe.': 'Say which column is the amount.',
  'Elige una cuenta del banco.': 'Choose a bank account.',
  'La fecha no se entiende.': 'The date cannot be understood.',
  'El importe no se entiende.': 'The amount cannot be understood.',
  'El importe es cero.': 'The amount is zero.',

  // ── Conciliación ──
  'Movimiento no encontrado': 'Movement not found',
  'Este movimiento ya está conciliado.': 'This movement is already reconciled.',
  'Este movimiento está ignorado.': 'This movement is ignored.',
  'Este movimiento no está conciliado.': 'This movement is not reconciled.',
  'Esta cuenta del banco no tiene cuenta contable: ponle una antes.':
    'This bank account has no ledger account: add one first.',
  'Elige una cuenta distinta de la del propio banco.':
    "Choose an account other than the bank's own.",
  'No hay un periodo contable abierto para el {0}.': 'There is no open accounting period for {0}.',
  'El movimiento es de {0} y lo elegido suma {1}.':
    'The movement is {0} and what you chose adds up to {1}.',
  'Elige al menos un cobro o pago.': 'Choose at least one collection or payment.',
  'Ese cobro no existe.': 'That payment does not exist.',
  'Ese cobro ya está conciliado con otro movimiento.':
    'That payment is already reconciled with another movement.',
  'La aplicación de un abono no pasa por el banco.':
    'Applying a credit note does not go through the bank.',
  'Ese cobro es de otra cuenta del banco.': 'That payment belongs to another bank account.',
  'Elige al menos una factura.': 'Choose at least one invoice.',
  'El importe tiene que ser mayor que cero.': 'The amount must be greater than zero.',
  'Esa factura no existe.': 'That invoice does not exist.',
  'Este movimiento es una entrada: no paga esa factura.':
    'This movement is money in: it does not pay that invoice.',
  'Este movimiento es una salida: no cobra esa factura.':
    'This movement is money out: it does not collect that invoice.',
  'Este cobro está conciliado con el banco: deshaz antes la conciliación.':
    'This payment is reconciled with the bank: undo the reconciliation first.',
  'Este cobro viene de una remesa: devuélvelo desde la remesa.':
    'This payment comes from a batch: return it from the batch.',

  // ── Remesas ──
  'Di si la remesa es de cobro o de pago.': 'Say whether the batch collects or pays.',
  'Indica la fecha de cargo.': 'Enter the charge date.',
  'Elige al menos un vencimiento.': 'Choose at least one due amount.',
  'Esa factura no es de este tipo de remesa.':
    'That invoice does not belong in this type of batch.',
  'Solo entran facturas emitidas.': 'Only issued invoices can go in.',
  'Falta el vencimiento de una línea.': 'A line is missing its due date.',
  'De la factura {0} solo quedan {1} sin reservar.': 'Only {1} of invoice {0} is left unreserved.',
  'Remesa no encontrada': 'Batch not found',
  'Una remesa cerrada no se borra: anota sus devoluciones.':
    'A closed batch is not deleted: record its returns.',
  'Esta remesa ya está cerrada.': 'This batch is already closed.',
  'Ese formato de remesa no está disponible.': 'That batch format is not available.',
  'Esta remesa todavía no tiene fichero.': 'This batch has no file yet.',
  'Genera antes el fichero.': 'Generate the file first.',
  'Factura {0}: {1}': 'Invoice {0}: {1}',
  'Solo se devuelve lo de una remesa cerrada.': 'Only lines of a closed batch can be returned.',
  'Esa línea no es de esta remesa.': 'That line is not in this batch.',
  'Esta línea ya está devuelta.': 'This line has already been returned.',
};
