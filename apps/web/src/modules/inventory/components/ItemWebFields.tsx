import React, { useState } from 'react';
import { Button, Checkbox } from '@openfactu/ui';
import { Globe, ImagePlus, X } from 'lucide-react';
import { MediaLibraryModal } from '@/modules/website/components/MediaLibraryModal';

interface Props {
  webVisible: boolean;
  setWebVisible: (v: boolean) => void;
  webDescription: string;
  setWebDescription: (v: string) => void;
  webImages: string[];
  setWebImages: (v: string[]) => void;
}

/**
 * Pestaña "Web" de la ficha de artículo (ecommerce del módulo Website):
 * flag "Vender en la web", descripción pública e imágenes elegidas de la
 * biblioteca de medios del site (URLs públicas, mismas que usa el editor web).
 */
export const ItemWebFields: React.FC<Props> = ({
  webVisible,
  setWebVisible,
  webDescription,
  setWebDescription,
  webImages,
  setWebImages,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300">
          <Globe size={16} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer flex-1 pt-1">
          <Checkbox checked={webVisible} onChange={setWebVisible} />
          <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
            Vender en la web
          </span>
        </label>
      </div>
      <p className="text-[11px] text-slate-400 -mt-2">
        El artículo aparecerá en el bloque «Tienda» de tu web pública. El precio mostrado es el
        precio base con su IVA incluido.
      </p>

      <div>
        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 block">
          Descripción para la web
        </label>
        <textarea
          value={webDescription}
          onChange={(e) => setWebDescription(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="Texto que ven los visitantes (independiente de la descripción interna)."
          className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-y"
        />
      </div>

      <div>
        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1 block">
          Imágenes del producto
        </label>
        <div className="flex flex-wrap gap-2">
          {webImages.map((url, i) => (
            <div
              key={`${url}-${i}`}
              className="relative w-20 h-20 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 group"
            >
              <img src={url} alt="" className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] font-bold text-center py-0.5">
                  Portada
                </span>
              )}
              <button
                type="button"
                onClick={() => setWebImages(webImages.filter((_, idx) => idx !== i))}
                className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                title="Quitar"
              >
                <X size={12} />
              </button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPickerOpen(true)}
            className="w-20 h-20 flex flex-col items-center justify-center gap-1"
          >
            <ImagePlus size={16} />
            <span className="text-[9px]">Añadir</span>
          </Button>
        </div>
        <p className="text-[11px] text-slate-400 mt-1">
          De la biblioteca de medios del módulo Website; la primera es la portada.
        </p>
      </div>

      <MediaLibraryModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => {
          if (!webImages.includes(url)) setWebImages([...webImages, url]);
          setPickerOpen(false);
        }}
      />
    </div>
  );
};
