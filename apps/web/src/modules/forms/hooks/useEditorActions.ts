import { useState } from 'react';
import { newQuestion, type Item, type QuestionType } from '@forms-engine';
import { useAuth } from '@/context/AuthContext';
import { formsApi } from '../api/formsApi';
import {
  addImageBlock,
  addSection,
  addTextBlock,
  changeType,
  duplicateItem,
  insertItem,
  moveItemToSection,
  moveSection,
  removeItem,
  removeSection,
  reorderItems,
  updateItem,
  updateSection,
} from '../domain/editorOps';
import type { FormEditorState } from './useFormEditor';

/**
 * Acciones del lienzo del editor: lo que hacen la barra de añadir y cada
 * tarjeta, sobre las operaciones puras de editorOps. Se inserta siempre tras
 * el elemento activo, como en Google Forms.
 */
export function useEditorActions(editor: FormEditorState) {
  const { user } = useAuth();
  const { form, apply, create, activeId, setActiveId } = editor;
  const [uploading, setUploading] = useState<string | null>(null);

  const assetUrl = (assetId: string) =>
    form && user?.tenantId ? formsApi.publicAssetUrl(user.tenantId, form.slug, assetId) : '';

  const upload = async (key: string, file: File) => {
    if (!form) return null;
    setUploading(key);
    try {
      const a = await formsApi.uploadAsset(form.id, file);
      return a.id;
    } finally {
      setUploading(null);
    }
  };

  return {
    assetUrl,
    uploading,
    addQuestion: (type: QuestionType = 'radio') => {
      const q = newQuestion(type);
      create((d) => ({ def: insertItem(d, q, activeId), id: q.id }));
    },
    addText: () => create((d) => addTextBlock(d, activeId)),
    addImage: async (file: File) => {
      const assetId = await upload('new-image', file);
      if (assetId) create((d) => addImageBlock(d, assetId, activeId));
    },
    addSection: () => create((d) => addSection(d, activeId)),
    update: (id: string, patch: Partial<Item>) => apply((d) => updateItem(d, id, patch)),
    changeType: (id: string, type: QuestionType) => apply((d) => changeType(d, id, type)),
    duplicate: (id: string) => create((d) => duplicateItem(d, id)),
    remove: (id: string) => {
      apply((d) => removeItem(d, id));
      if (activeId === id) setActiveId(null);
    },
    reorder: (sectionId: string, items: Item[]) => apply((d) => reorderItems(d, sectionId, items)),
    moveToSection: (id: string, dir: -1 | 1) => apply((d) => moveItemToSection(d, id, dir)),
    updateSection: (id: string, patch: Parameters<typeof updateSection>[2]) =>
      apply((d) => updateSection(d, id, patch)),
    moveSection: (id: string, dir: -1 | 1) => apply((d) => moveSection(d, id, dir)),
    removeSection: (id: string) => apply((d) => removeSection(d, id)),
    replaceImage: async (id: string, file: File) => {
      const assetId = await upload(id, file);
      if (assetId) apply((d) => updateItem(d, id, { assetId }));
    },
    setHeaderImage: async (file: File) => {
      const assetId = await upload('header', file);
      if (assetId && editor.form)
        editor.change({ theme: { ...editor.form.theme, headerAssetId: assetId } });
    },
    removeHeaderImage: () => {
      if (!editor.form) return;
      const theme = { ...editor.form.theme };
      delete theme.headerAssetId;
      editor.change({ theme });
    },
  };
}

export type EditorActions = ReturnType<typeof useEditorActions>;
