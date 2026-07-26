import React, { useState } from 'react';
import { Button, Input, Loader, NumberInput, useToast, Modal } from '@openfactu/ui';
import { LayoutGrid, Play, Info } from 'lucide-react';
import { warehousesApi } from '../api';

interface BinGeneratorModalProps {
  warehouseId: string;
  onSuccess: () => void;
  onClose: () => void;
}

interface Range {
  start: number;
  end: number;
  padding: number;
}

/**
 * Un segmento de la nomenclatura (pasillo / columna / nivel): rango "de X al Y".
 * Con NumberInput el valor llega ya numérico — antes un `parseInt('')` dejaba
 * NaN en el estado y el total de la malla se iba a NaN.
 */
const SegmentRange: React.FC<{
  label: string;
  range: Range;
  onChange: (range: Range) => void;
}> = ({ label, range, onChange }) => (
  <div className="space-y-2">
    <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{label}</p>
    <div className="flex items-center gap-2">
      <NumberInput
        value={range.start}
        onChange={(v) => onChange({ ...range, start: v ?? 1 })}
        min={1}
        inputSize="sm"
      />
      <span className="text-slate-300 dark:text-slate-600">al</span>
      <NumberInput
        value={range.end}
        onChange={(v) => onChange({ ...range, end: v ?? 1 })}
        min={1}
        inputSize="sm"
      />
    </div>
  </div>
);

export const BinGeneratorModal: React.FC<BinGeneratorModalProps> = ({
  warehouseId,
  onSuccess,
  onClose,
}) => {
  const [prefix, setPrefix] = useState('B');
  const [separator, setSeparator] = useState('-');
  const [aisleRange, setAisleRange] = useState<Range>({ start: 1, end: 5, padding: 2 });
  const [stackRange, setStackRange] = useState<Range>({ start: 1, end: 10, padding: 2 });
  const [levelRange, setLevelRange] = useState<Range>({ start: 1, end: 3, padding: 2 });
  const [isGenerating, setIsGenerating] = useState(false);
  const toast = useToast();

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const data = await warehousesApi.generateBins(warehouseId, {
        prefix,
        separator,
        aisleRange,
        stackRange,
        levelRange,
      });
      toast.success(data.message);
      onSuccess();
    } catch (err) {
      toast.error((err instanceof Error && err.message) || 'Fallo en la conexión');
    } finally {
      setIsGenerating(false);
    }
  };

  const total =
    (aisleRange.end - aisleRange.start + 1) *
    (stackRange.end - stackRange.start + 1) *
    (levelRange.end - levelRange.start + 1);

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title="Generador Masivo de Ubicaciones (Motor Industrial)"
      subtitle="Crea mallas de almacenamiento complejas al instante mediante parámetros jerárquicos."
      maxWidth="2xl"
    >
      <div className="space-y-6">
        {/* Configuración Nomenclatura */}
        <div className="grid grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
          <Input
            label="Prefijo"
            placeholder="Ej: B, P, R..."
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
          />
          <Input
            label="Separador"
            placeholder="Ej: -, /, ."
            value={separator}
            onChange={(e) => setSeparator(e.target.value)}
          />
        </div>

        {/* Rango de Pasillos */}
        <div className="space-y-4">
          <p className="text-[10px] font-black uppercase text-blue-600 tracking-widest flex items-center gap-2">
            <LayoutGrid size={12} /> Definición de Segmentos
          </p>
          <div className="grid grid-cols-3 gap-4 border-l-4 border-blue-500 pl-4 py-2">
            <SegmentRange label="Pasillo (Aisle)" range={aisleRange} onChange={setAisleRange} />
            <SegmentRange label="Columna (Stack)" range={stackRange} onChange={setStackRange} />
            <SegmentRange label="Nivel (Level)" range={levelRange} onChange={setLevelRange} />
          </div>
        </div>

        <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-xl border border-blue-100 dark:border-blue-500/20 flex items-center justify-between">
          <div className="flex items-center gap-3 text-blue-700">
            <Info size={20} />
            <div>
              <p className="text-xs font-bold">Resumen de Operación</p>
              <p className="text-[11px] font-medium opacity-80">
                Se generarán {total} ubicaciones únicas (ej: {prefix}01{separator}01{separator}01).
              </p>
            </div>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating || total <= 0}
            className="shadow-lg"
          >
            {isGenerating ? (
              <Loader size="sm" variant="white" />
            ) : (
              <div className="flex items-center gap-2">
                <Play size={16} /> Generar Bins
              </div>
            )}
          </Button>
        </div>
      </div>
    </Modal>
  );
};
