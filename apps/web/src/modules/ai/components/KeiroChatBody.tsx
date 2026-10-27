import React from 'react';
import { Button } from '@openfactu/ui';
import {
  AIComposer,
  AIContextUsage,
  AIConversation,
  type AIPromptSuggestion,
} from '@openfactu/ui/ai';
import { X } from 'lucide-react';
import { MAX_ATTACHMENTS } from '../domain/constants';
import { KEIRO_LABELS } from '../domain/keiroLabels';
import type { KeiroChat } from '../hooks/useKeiroChat';
import { AuroraBackdrop } from '@/components/login/AuroraBackdrop';
import { PendingQuestionBar } from './PendingQuestionBar';
import { SelectionToolbar } from './SelectionToolbar';

/**
 * Conversación + compositor del chat de Keiro con los componentes de
 * @openfactu/ui/ai. Lo comparten la página (dentro de `AIWorkspace`) y el panel
 * flotante. Ocupa todo el alto disponible de su contenedor (`flex-col`).
 */
export const KeiroChatBody: React.FC<{
  chat: KeiroChat;
  suggestions?: AIPromptSuggestion[];
}> = ({ chat, suggestions }) => {
  const { composer, pendingQuestion, selection } = chat;
  const empty = chat.aiMessages.length === 0;

  return (
    // Contenedor posicionado para la aurora del estado vacío; mantiene la
    // columna flexible que esperan la conversación y el compositor.
    <div className="relative flex min-h-0 flex-1 flex-col">
      {empty && (
        <AuroraBackdrop
          variant="subtle"
          className="pointer-events-none z-0 animate-in fade-in duration-700"
        />
      )}
      <AIConversation
        className="relative z-10"
        messages={chat.aiMessages}
        conversationId={chat.conversationId ?? undefined}
        run={chat.run}
        actions={{
          onRetry: chat.retry,
          onApproveTool: chat.approveTool,
          onRejectTool: chat.rejectTool,
        }}
        labels={KEIRO_LABELS}
        suggestions={empty ? suggestions : undefined}
        onSelectPrompt={(text) => composer.send(text)}
      />
      <div className="ai-workspace-composer relative z-10">
        {pendingQuestion && (
          <PendingQuestionBar
            key={pendingQuestion.step?.current ?? pendingQuestion.question}
            question={pendingQuestion}
            disabled={chat.busy}
            onAnswer={composer.send}
          />
        )}
        {composer.quotedText && (
          <div className="mb-2 flex items-start gap-2 rounded-md border-l-2 border-accent bg-bg-muted px-3 py-2 text-xs text-fg-body">
            <span className="line-clamp-3 flex-1 whitespace-pre-wrap">{composer.quotedText}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={composer.clearQuote}
              title="Quitar cita"
            >
              <X size={14} />
            </Button>
          </div>
        )}
        <AIComposer
          draft={chat.draft}
          onDraftChange={chat.onDraftChange}
          onSubmit={(d) => composer.send(d.text)}
          run={chat.run}
          onStop={chat.stop}
          onFiles={(files) => composer.addDropped(files)}
          maxFiles={MAX_ATTACHMENTS + 3}
          maxSizeMb={15}
          labels={KEIRO_LABELS}
        >
          <AIComposer.Attachments />
          <AIComposer.Input />
          <AIComposer.Tools>
            <AIContextUsage
              usedTokens={chat.contextUsed}
              maxTokens={chat.contextMax}
              modelLabel={chat.modelId || undefined}
              placement="top"
              align="start"
              className="[&_.ai-context-trigger]:select-none [&_.ai-context-trigger]:!border-transparent [&_.ai-context-trigger]:!bg-transparent [&_.ai-context-trigger:hover]:!bg-bg-hover"
              details={[{ label: 'Cálculo', value: 'Estimado' }]}
              labels={KEIRO_LABELS}
            />
          </AIComposer.Tools>
        </AIComposer>
      </div>
      {selection && (
        <SelectionToolbar
          x={selection.x}
          y={selection.y}
          onClick={() => {
            composer.quoteText(selection.text);
            chat.clearSelection();
            window.getSelection()?.removeAllRanges();
          }}
        />
      )}
    </div>
  );
};
