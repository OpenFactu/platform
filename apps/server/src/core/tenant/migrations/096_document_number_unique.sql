-- Un número no se repite dentro de su serie. El motor ya lo evita bloqueando la serie: esto es
-- la última garantía para lo que escriba por otro camino. Solo añade. Si una empresa ya tiene
-- números repetidos no se puede crear: se avisa y sigue funcionando como hasta ahora.
DO $$
DECLARE
  doc TEXT;
BEGIN
  FOREACH doc IN ARRAY ARRAY[
    'SalesQuote', 'SalesOrder', 'SalesDeliveryNote', 'SalesInvoice',
    'PurchaseOrder', 'PurchaseDeliveryNote', 'PurchaseInvoice'
  ] LOOP
    IF to_regclass(format('%I', doc)) IS NULL THEN
      CONTINUE;
    END IF;
    BEGIN
      EXECUTE format(
        'CREATE UNIQUE INDEX IF NOT EXISTS %I ON %I ("seriesId", "docNum")',
        doc || '_series_docNum_unique',
        doc
      );
    EXCEPTION WHEN unique_violation THEN
      RAISE WARNING 'Hay números repetidos en %: no se crea el índice único', doc;
    END;
  END LOOP;
END $$;
