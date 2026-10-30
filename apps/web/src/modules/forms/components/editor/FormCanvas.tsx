import { useI18n } from '@/i18n/I18nContext';
import React from 'react';
import { SortableList, type SortableHandleProps } from '@openfactu/ui';
import { isQuestion, type Item, type Question } from '@forms-engine';
import { questionsBefore } from '../../domain/editorOps';
import type { FormEditorState } from '../../hooks/useFormEditor';
import { useEditorActions } from '../../hooks/useEditorActions';
import { QuestionCard } from './QuestionCard';
import { ImageBlockCard, SectionHeader, SectionNext, TextBlockCard } from './BlockCards';
import { FormHeaderCard } from './FormHeaderCard';
import { EditorToolbar } from './EditorToolbar';

interface Props {
  editor: FormEditorState;
  /** Con el CRM activo se ofrece «Guardar en el CRM» en cada pregunta. */
  crm: boolean;
  disabled?: boolean;
}

/** Pestaña «Preguntas»: el lienzo de tarjetas y la barra para añadir. */
export const FormCanvas: React.FC<Props> = ({ editor, crm, disabled }) => {
  const actions = useEditorActions(editor);
  const form = editor.form!;
  const def = form.definition;
  const sections = def.sections;
  const quiz = form.settings.quiz.enabled;
  const headerId = form.theme.headerAssetId;

  const { t } = useI18n();
  const renderItem = (item: Item, sectionIndex: number, handleProps: SortableHandleProps) => {
    const common = {
      active: editor.activeId === item.id,
      onActivate: () => editor.setActiveId(item.id),
      onDuplicate: () => actions.duplicate(item.id),
      onRemove: () => actions.remove(item.id),
      handleProps: disabled ? undefined : handleProps,
      disabled,
    };
    if (isQuestion(item))
      return (
        <QuestionCard
          {...common}
          question={item}
          onChange={(patch: Partial<Question>) => actions.update(item.id, patch)}
          onChangeType={(t) => actions.changeType(item.id, t)}
          onMoveSection={
            sections.length > 1 ? (dir) => actions.moveToSection(item.id, dir) : undefined
          }
          sectionIndex={sectionIndex}
          sectionCount={sections.length}
          sections={sections}
          candidates={questionsBefore(def, item.id)}
          quiz={quiz}
          crm={crm}
        />
      );
    if (item.kind === 'text')
      return (
        <TextBlockCard
          {...common}
          block={item}
          onChange={(patch) => actions.update(item.id, patch)}
        />
      );
    return (
      <ImageBlockCard
        {...common}
        block={item}
        onChange={(patch) => actions.update(item.id, patch)}
        imageUrl={item.assetId ? actions.assetUrl(item.assetId) : null}
        onUpload={(file) => actions.replaceImage(item.id, file)}
        uploading={actions.uploading === item.id}
      />
    );
  };

  return (
    <div className="flex gap-4 max-md:pb-24">
      <div className="flex-1 min-w-0 space-y-4">
        <FormHeaderCard
          title={form.title ?? ''}
          intro={form.intro ?? ''}
          headerImageUrl={headerId ? actions.assetUrl(headerId) : null}
          onTitle={(title) => editor.change({ title })}
          onIntro={(intro) => editor.change({ intro })}
          titleEffect={form.theme.titleEffect}
          onTitleEffect={(titleEffect) => editor.change({ theme: { ...form.theme, titleEffect } })}
          onUploadHeader={actions.setHeaderImage}
          onRemoveHeader={actions.removeHeaderImage}
          uploading={actions.uploading === 'header'}
          disabled={disabled}
        />
        {sections.map((section, si) => (
          <div key={section.id} className="space-y-4">
            {sections.length > 1 && (
              <SectionHeader
                section={section}
                index={si}
                count={sections.length}
                onChange={(patch) => actions.updateSection(section.id, patch)}
                onMove={(dir) => actions.moveSection(section.id, dir)}
                onRemove={() => actions.removeSection(section.id)}
                disabled={disabled}
              />
            )}
            {section.items.length === 0 ? (
              <p className="rounded-xs border border-dashed border-border-default p-6 text-center text-sm text-fg-muted">
                {t('forms.canvas.emptySection')}
              </p>
            ) : (
              <SortableList
                items={section.items}
                getKey={(i) => i.id}
                onReorder={(items) => actions.reorder(section.id, items)}
                disabled={disabled}
                handleLabel={t('forms.canvas.dragToMove')}
                className="space-y-4"
                renderItem={(item, { handleProps }) => renderItem(item, si, handleProps)}
              />
            )}
            {sections.length > 1 && (
              <SectionNext
                section={section}
                index={si}
                sections={sections}
                onChange={(next) => actions.updateSection(section.id, { next })}
                disabled={disabled}
              />
            )}
          </div>
        ))}
      </div>
      {!disabled && (
        <div className="md:w-14 md:shrink-0">
          <EditorToolbar
            onQuestion={() => actions.addQuestion()}
            onText={actions.addText}
            onImage={actions.addImage}
            onSection={actions.addSection}
            uploadingImage={actions.uploading === 'new-image'}
          />
        </div>
      )}
    </div>
  );
};
