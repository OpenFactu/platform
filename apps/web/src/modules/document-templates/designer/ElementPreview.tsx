import React from 'react';
import { useI18n } from '@/i18n/I18nContext';
import type { CanvasElement } from '../components/canvas/types';
import { fieldName } from './fieldNames';
import { PaperHtml } from './PaperHtml';
import { rendersNothing } from './paperRender';
import { useDesignerPreview } from './PreviewContext';

/**
 * Lo que con estos datos sale en blanco: en el papel, igual que en el PDF. Para poder
 * encontrarlo, su contorno aparece al pasar por la banda y su nombre al pasar por encima o al
 * seleccionarlo. Si va en flujo no ocupa sitio, como en el PDF: queda sobre lo que venga detrás.
 */
const Blank: React.FC<{ children: React.ReactNode; element: CanvasElement }> = ({
  children,
  element,
}) => (
  <div className={element.flow ? 'relative h-0' : 'w-full h-full'}>
    <div
      className="absolute inset-x-0 top-0 flex items-center px-0.5 overflow-hidden whitespace-nowrap italic border border-dotted border-transparent group-hover/band:border-slate-200 text-[8pt] text-slate-400"
      style={{
        height: element.flow ? `${element.h}mm` : '100%',
        justifyContent:
          element.style?.textAlign === 'center'
            ? 'center'
            : element.style?.textAlign === 'right'
              ? 'flex-end'
              : 'flex-start',
      }}
    >
      <span className="opacity-0 group-hover:opacity-100 group-focus:opacity-100">{children}</span>
    </div>
  </div>
);

/** Una marca para quien diseña, que no sale en el PDF. */
const Hint: React.FC<{ children: React.ReactNode; align?: string; className?: string }> = ({
  children,
  align,
  className = 'border-slate-200 text-slate-400',
}) => (
  <div
    className={`w-full h-full flex items-center px-1 overflow-hidden whitespace-nowrap italic border border-dashed text-[8pt] ${className}`}
    style={{
      justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
    }}
  >
    {children}
  </div>
);

/**
 * Cómo se ve cada elemento en el papel: lo mismo que en el PDF. Solo se señala aquello que
 * en el PDF no se vería, para poder encontrarlo y seleccionarlo.
 */
export const ElementPreview: React.FC<{ element: CanvasElement }> = ({ element }) => {
  const { t } = useI18n();
  const { renders, failed } = useDesignerPreview();

  if (element.kind === 'pageBreak') {
    return (
      <Hint align="center" className="border-rose-400 bg-rose-50/50 text-rose-600 not-italic">
        ✂ {t('templates.designer.palette.pageBreak')}
      </Hint>
    );
  }
  if (element.kind === 'spacer') {
    return <Hint align="center">{t('templates.designer.palette.spacer')}</Hint>;
  }
  if (element.kind === 'image' && !element.src) {
    return <Hint>🖼 {t('templates.designer.preview.pickImage')}</Hint>;
  }

  const html = renders.get(element.id);
  const align = element.style?.textAlign;
  const name =
    element.kind === 'field'
      ? `[${fieldName(element.path)}]`
      : t('templates.designer.preview.empty');

  if (html === null) {
    return (
      <Hint align={align} className="border-rose-300 text-rose-500">
        {t('templates.designer.preview.invalid')}
      </Hint>
    );
  }
  if (html === undefined) {
    // Sin respuesta del servidor: mejor saber qué hay en cada sitio que ver el papel en blanco.
    if (!failed) return null;
    return (
      <Hint align={align}>
        {element.kind === 'field' ? name : t(`templates.designer.palette.${element.kind}`)}
      </Hint>
    );
  }
  if (rendersNothing(element, html)) return <Blank element={element}>{name}</Blank>;
  return <PaperHtml html={html} />;
};
