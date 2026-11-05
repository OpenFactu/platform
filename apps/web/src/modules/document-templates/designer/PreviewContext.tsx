import { createContext, useContext } from 'react';
import type { ElementRenders } from './useElementRenders';

export interface DesignerPreview {
  renders: ElementRenders;
  /** El servidor no ha contestado: se señala cada elemento en lugar de dejar el papel en blanco. */
  failed: boolean;
  /** CSS que la plantilla aplica a todo el documento, también en el PDF. */
  customCss?: string;
}

export const PreviewContext = createContext<DesignerPreview>({
  renders: new Map(),
  failed: false,
});

export const useDesignerPreview = () => useContext(PreviewContext);
