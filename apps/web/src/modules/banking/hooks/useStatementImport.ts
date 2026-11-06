import { useEffect, useState } from 'react';
import { bankStatementsApi } from '../api/bankingApi';
import {
  fileToBase64,
  mappingProblem,
  type StatementField,
  type StatementFormat,
  type StatementImportResult,
  type StatementMapping,
  type StatementPreview,
} from '../domain/banking';

const CSV = 'csv';

/** Importar un extracto: elegir el fichero, ver lo que trae y decir qué columna es cada cosa. */
export function useStatementImport(bankAccountId: string, onImported: () => void) {
  const [formats, setFormats] = useState<StatementFormat[]>([]);
  const [format, setFormat] = useState(CSV);
  const [file, setFile] = useState<{ name: string; base64: string } | null>(null);
  const [preview, setPreview] = useState<StatementPreview | null>(null);
  const [mapping, setMapping] = useState<StatementMapping>({});
  const [result, setResult] = useState<StatementImportResult | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    bankStatementsApi
      .formats()
      .then((rows) => {
        if (alive) setFormats(rows);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setMapping({});
    setResult(null);
    setProblem(null);
  };

  const load = async (name: string, base64: string, chosenFormat: string) => {
    setBusy(true);
    setProblem(null);
    setResult(null);
    setFile({ name, base64 });
    try {
      const shown = await bankStatementsApi.preview({
        fileName: name,
        contentBase64: base64,
        format: chosenFormat,
      });
      setPreview(shown);
      setMapping(shown.kind === 'table' ? shown.mapping : {});
    } catch (error) {
      setPreview(null);
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const pick = async (picked: File) => load(picked.name, await fileToBase64(picked), format);

  const changeFormat = (next: string) => {
    setFormat(next);
    if (file) void load(file.name, file.base64, next);
  };

  const setColumn = (field: StatementField, header: string) =>
    setMapping((current) => ({ ...current, [field]: header || undefined }));

  const missing = preview?.kind === 'table' ? mappingProblem(mapping) : null;

  const run = async () => {
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const imported = await bankStatementsApi.import({
        bankAccountId,
        fileName: file.name,
        contentBase64: file.base64,
        format,
        ...(preview?.kind === 'table' ? { mapping } : {}),
      });
      setResult(imported);
      setPreview(null);
      setFile(null);
      onImported();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return {
    formats,
    format,
    changeFormat,
    file,
    pick,
    preview,
    mapping,
    setColumn,
    missing,
    result,
    problem,
    busy,
    run,
    reset,
    canImport: !!file && !!preview && !missing && !busy,
  };
}
