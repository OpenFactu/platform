import React, { useEffect, useRef, useState } from 'react';
import { Button, ColorInput } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import type { ElementStyle } from '../../components/canvas/types';

/**
 * Editor inline contenteditable con barra de formato. Permite negritas,
 * cursivas, subrayado, tachado, color de texto, color de fondo y limpiar
 * formato sobre la selección actual. Persiste como HTML en `value`.
 *
 * Implementado con `document.execCommand` por simplicidad: deprecated en
 * spec pero aún soportado por todos los navegadores actuales y suficiente
 * para los formatos que necesita una plantilla de documento. No requiere
 * dependencias externas (TipTap/Lexical/Quill no están instalados).
 */
export const RichTextEditor: React.FC<{
  value: string;
  onChange: (html: string) => void;
  defaultColor?: string;
  style?: ElementStyle;
}> = ({ value, onChange, defaultColor, style }) => {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement | null>(null);
  const [color, setColor] = useState(defaultColor || '#1e40af');
  const [bgColor, setBgColor] = useState('#fef08a');

  // Vuelca el HTML al montar y cuando `value` cambia desde fuera (cambio de
  // elemento). Comparamos contra el contenido REAL del DOM para: (a) inicializar
  // el contenido al montar, y (b) no pisar el cursor mientras se teclea (al
  // teclear, value === innerHTML actual → no re-escribimos).
  useEffect(() => {
    if (ref.current && value !== ref.current.innerHTML) {
      ref.current.innerHTML = value || '';
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const emit = () => {
    if (!ref.current) return;
    onChange(ref.current.innerHTML);
  };

  const clearFormat = () => {
    ref.current?.focus();
    document.execCommand('removeFormat');
    document.execCommand('unlink');
    // Quita también color de fondo, que removeFormat no toca en algunos navegadores.
    document.execCommand('hiliteColor', false, 'transparent');
    emit();
  };

  const setBlockAlign = (align: 'left' | 'center' | 'right' | 'justify') => {
    ref.current?.focus();
    const map = {
      left: 'justifyLeft',
      center: 'justifyCenter',
      right: 'justifyRight',
      justify: 'justifyFull',
    } as const;
    document.execCommand(map[align]);
    emit();
  };

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="font-bold"
          onClick={() => exec('bold')}
          title={t('templates.designer.rt.bold')}
        >
          B
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="italic"
          onClick={() => exec('italic')}
          title={t('templates.designer.rt.italic')}
        >
          I
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="underline"
          onClick={() => exec('underline')}
          title={t('templates.designer.rt.underline')}
        >
          U
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="line-through"
          onClick={() => exec('strikeThrough')}
          title={t('templates.designer.rt.strike')}
        >
          S
        </Button>
        <span className="w-px h-5 bg-border-subtle mx-0.5" />
        <label className="flex items-center gap-1" title={t('templates.designer.rt.textColor')}>
          <ColorInput
            size="sm"
            showHex={false}
            value={color}
            onChange={(next) => {
              setColor(next);
              exec('foreColor', next);
            }}
          />
          <Button type="button" variant="ghost" size="sm" onClick={() => exec('foreColor', color)}>
            A
          </Button>
        </label>
        <label className="flex items-center gap-1" title={t('templates.designer.rt.bgColor')}>
          <ColorInput
            size="sm"
            showHex={false}
            value={bgColor}
            onChange={(next) => {
              setBgColor(next);
              exec('hiliteColor', next);
            }}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => exec('hiliteColor', bgColor)}
          >
            ▓
          </Button>
        </label>
        <span className="w-px h-5 bg-border-subtle mx-0.5" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setBlockAlign('left')}
          title={t('templates.designer.rt.alignLeft')}
        >
          ⯇
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setBlockAlign('center')}
          title={t('templates.designer.rt.center')}
        >
          ≡
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setBlockAlign('right')}
          title={t('templates.designer.rt.alignRight')}
        >
          ⯈
        </Button>
        <span className="w-px h-5 bg-border-subtle mx-0.5" />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={clearFormat}
          title={t('templates.designer.rt.clear')}
        >
          ⨯
        </Button>
      </div>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Pegamos como texto plano para no traer estilos externos que el
          // PDF no podrá interpretar (ej: clases de Word/Google Docs).
          e.preventDefault();
          const text = e.clipboardData.getData('text/plain');
          document.execCommand('insertText', false, text);
        }}
        className="min-h-[80px] p-2 rounded border border-border-subtle bg-bg-card text-sm focus:outline-none focus:border-blue-400 whitespace-pre-wrap break-words"
        style={{
          lineHeight: 1.4,
          // Reflejamos el estilo del elemento para que el editor sea WYSIWYG.
          textAlign: style?.textAlign,
          fontSize: style?.fontSize ? `${style.fontSize}pt` : undefined,
          fontFamily: style?.fontFamily,
          fontWeight: style?.fontWeight,
          fontStyle: style?.fontStyle,
          color: style?.color,
        }}
      />
      <div className="text-[10px] text-fg-subtle leading-snug">
        {t('templates.designer.rt.hint')}
      </div>
    </div>
  );
};
