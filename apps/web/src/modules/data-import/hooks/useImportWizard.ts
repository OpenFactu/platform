/**
 * Estado del asistente de importación. Todo lo que decide vive aquí; los
 * componentes de `components/Step*.tsx` solo pintan y llaman.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useToast } from '@openfactu/ui';
import { dataImportApi } from '../api/dataImportApi';
import { checkMapping, mappingIsValid } from '../lib/mappingChecks';
import { errorMessage } from '../lib/errorMessage';
import type { ImportMode, ImportObject, SavedMapping, UploadResult, UploadedSheet } from '../types';

export type WizardStep = 'object' | 'file' | 'mapping' | 'mode' | 'run';

export const STEP_ORDER: WizardStep[] = ['object', 'file', 'mapping', 'mode', 'run'];

export const STEP_LABELS: Record<WizardStep, string> = {
  object: 'Qué importar',
  file: 'Fichero',
  mapping: 'Columnas',
  mode: 'Modo',
  run: 'Simular e importar',
};

export function useImportWizard() {
  const toast = useToast();

  const [objects, setObjects] = useState<ImportObject[]>([]);
  const [loadingObjects, setLoadingObjects] = useState(true);

  const [step, setStep] = useState<WizardStep>('object');
  const [object, setObject] = useState<ImportObject | null>(null);

  const [upload, setUpload] = useState<UploadResult | null>(null);
  const [sheetName, setSheetName] = useState<string | null>(null);
  const [linesSheetName, setLinesSheetName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<ImportMode>('insert');
  const [matchBy, setMatchBy] = useState<string | undefined>(undefined);

  const [savedMappings, setSavedMappings] = useState<SavedMapping[]>([]);
  const [launching, setLaunching] = useState(false);

  useEffect(() => {
    dataImportApi
      .objects()
      .then(setObjects)
      .catch((e) => toast.error(errorMessage(e, 'No se pudo cargar el catálogo')))
      .finally(() => setLoadingObjects(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sheet: UploadedSheet | null = useMemo(() => {
    if (!upload) return null;
    return upload.sheets.find((s) => s.name === sheetName) || upload.sheets[0] || null;
  }, [upload, sheetName]);

  /**
   * Hoja de líneas, solo para objetos que las tienen (documentos). Si el
   * usuario no elige, se busca la que se llame como el objeto ("Líneas") y,
   * si no, la siguiente a la de cabeceras: es como sale la plantilla.
   */
  const linesSheet: UploadedSheet | null = useMemo(() => {
    if (!object?.lines || !upload) return null;
    const wanted = upload.sheets.find((s) => s.name === linesSheetName);
    if (wanted) return wanted;
    const byLabel = upload.sheets.find(
      (s) => s.name.toLowerCase() === object.lines!.label.toLowerCase(),
    );
    if (byLabel) return byLabel;
    return upload.sheets.find((s) => s.name !== sheet?.name) || null;
  }, [object, upload, linesSheetName, sheet]);

  /**
   * El mapeo cubre las dos hojas a la vez: los campos de línea se mapean
   * contra las cabeceras de la hoja de líneas, así que las columnas que se
   * comprueban son la unión de ambas.
   */
  const allHeaders = useMemo(
    () => [...(sheet?.headers || []), ...(linesSheet?.headers || [])],
    [sheet, linesSheet],
  );

  const issues = useMemo(
    () => (object && sheet ? checkMapping(object, allHeaders, mapping, mode, matchBy) : []),
    [object, sheet, allHeaders, mapping, mode, matchBy],
  );

  const canContinue = useMemo(() => {
    switch (step) {
      case 'object':
        return !!object;
      case 'file':
        return !!sheet && sheet.totalRows > 0;
      case 'mapping':
        return mappingIsValid(issues);
      case 'mode':
        return mappingIsValid(issues);
      default:
        return false;
    }
  }, [step, object, sheet, issues]);

  // ── Acciones ──────────────────────────────────────────────────────────────

  const chooseObject = useCallback((next: ImportObject) => {
    setObject(next);
    setUpload(null);
    setSheetName(null);
    setLinesSheetName(null);
    setMapping({});
    setMode('insert');
    setMatchBy(next.naturalKeys[0]?.key);
    dataImportApi
      .mappings(next.id)
      .then(setSavedMappings)
      .catch(() => setSavedMappings([]));
    setStep('file');
  }, []);

  const downloadTemplate = useCallback(async () => {
    if (!object) return;
    try {
      await dataImportApi.downloadTemplate(object);
    } catch (e) {
      toast.error(errorMessage(e, 'No se pudo generar la plantilla'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [object]);

  const uploadFile = useCallback(
    async (file: File) => {
      if (!object) return;
      setUploading(true);
      try {
        const result = await dataImportApi.upload(object.id, file);
        setUpload(result);
        const first = result.sheets[0];
        setSheetName(first?.name ?? null);
        setLinesSheetName(null);
        // El automapeo viene por hoja; con documentos hay que juntar el de la
        // cabecera con el de las líneas, que están en pestañas distintas.
        const merged = result.sheets.reduce(
          (acc, s) => ({ ...acc, ...s.mapping }),
          {} as Record<string, string>,
        );
        setMapping(object.lines ? merged : (first?.mapping ?? {}));
      } catch (e) {
        toast.error(errorMessage(e, 'No se pudo leer el fichero'));
      } finally {
        setUploading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [object],
  );

  /**
   * Al cambiar de hoja se hereda su automapeo, que es por columna. En objetos
   * con líneas se conserva lo mapeado de la otra hoja: son dos pestañas de un
   * mismo mapeo, no dos mapeos.
   */
  const chooseSheet = useCallback(
    (name: string) => {
      setSheetName(name);
      const next = upload?.sheets.find((s) => s.name === name);
      if (!next) return;
      setMapping((prev) => (object?.lines ? { ...prev, ...next.mapping } : next.mapping));
    },
    [upload, object],
  );

  const chooseLinesSheet = useCallback(
    (name: string) => {
      setLinesSheetName(name);
      const next = upload?.sheets.find((s) => s.name === name);
      if (next) setMapping((prev) => ({ ...prev, ...next.mapping }));
    },
    [upload],
  );

  const setColumnField = useCallback((column: string, field: string | null) => {
    setMapping((prev) => {
      const next = { ...prev };
      if (!field) delete next[column];
      else next[column] = field;
      return next;
    });
  }, []);

  const resetMapping = useCallback(() => {
    if (sheet) setMapping(sheet.mapping);
  }, [sheet]);

  const clearMapping = useCallback(() => setMapping({}), []);

  const applySavedMapping = useCallback((saved: SavedMapping) => {
    setMapping(saved.mapping);
    if (saved.mode) setMode(saved.mode);
    if (saved.matchBy) setMatchBy(saved.matchBy);
  }, []);

  const saveMapping = useCallback(
    async (name: string) => {
      if (!object) return;
      try {
        const saved = await dataImportApi.saveMapping({
          objectId: object.id,
          name,
          mapping,
          mode,
          matchBy,
        });
        setSavedMappings((prev) => [...prev.filter((m) => m.id !== saved.id), saved]);
        toast.success(`Mapeo "${name}" guardado`);
      } catch (e) {
        toast.error(errorMessage(e, 'No se pudo guardar el mapeo'));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [object, mapping, mode, matchBy],
  );

  const deleteMapping = useCallback(
    async (saved: SavedMapping) => {
      try {
        await dataImportApi.deleteMapping(saved.id);
        setSavedMappings((prev) => prev.filter((m) => m.id !== saved.id));
      } catch (e) {
        toast.error(errorMessage(e, 'No se pudo borrar el mapeo'));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  /** Lanza la simulación o la importación de verdad. Devuelve el id del trabajo. */
  const launch = useCallback(
    async (dryRun: boolean): Promise<string | null> => {
      if (!object || !upload || !sheet) return null;
      setLaunching(true);
      try {
        const { jobId } = await dataImportApi.createJob({
          uploadId: upload.uploadId,
          objectId: object.id,
          fileName: upload.fileName,
          sheetName: sheet.name,
          linesSheetName: linesSheet?.name,
          mapping,
          mode,
          matchBy: mode === 'insert' ? undefined : matchBy,
          dryRun,
        });
        setStep('run');
        return jobId;
      } catch (e) {
        toast.error(errorMessage(e, 'No se pudo lanzar la importación'));
        return null;
      } finally {
        setLaunching(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [object, upload, sheet, linesSheet, mapping, mode, matchBy],
  );

  const goTo = useCallback((next: WizardStep) => setStep(next), []);

  const goNext = useCallback(() => {
    const index = STEP_ORDER.indexOf(step);
    if (index < STEP_ORDER.length - 1) setStep(STEP_ORDER[index + 1]);
  }, [step]);

  const goBack = useCallback(() => {
    const index = STEP_ORDER.indexOf(step);
    if (index > 0) setStep(STEP_ORDER[index - 1]);
  }, [step]);

  const restart = useCallback(() => {
    setStep('object');
    setObject(null);
    setUpload(null);
    setSheetName(null);
    setLinesSheetName(null);
    setMapping({});
    setMode('insert');
    setMatchBy(undefined);
  }, []);

  return {
    // catálogo
    objects,
    loadingObjects,
    // navegación
    step,
    goTo,
    goNext,
    goBack,
    restart,
    canContinue,
    // selección
    object,
    chooseObject,
    // fichero
    upload,
    uploading,
    sheet,
    chooseSheet,
    linesSheet,
    chooseLinesSheet,
    uploadFile,
    downloadTemplate,
    // mapeo
    mapping,
    setColumnField,
    resetMapping,
    clearMapping,
    issues,
    savedMappings,
    applySavedMapping,
    saveMapping,
    deleteMapping,
    // modo
    mode,
    setMode,
    matchBy,
    setMatchBy,
    // ejecución
    launch,
    launching,
  };
}

export type ImportWizard = ReturnType<typeof useImportWizard>;
