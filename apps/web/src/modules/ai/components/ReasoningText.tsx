import React from 'react';
import { Brain } from 'lucide-react';

/** Texto de razonamiento, sin su propio toggle — vive dentro de ProcessSection. */
export const ReasoningText: React.FC<{ text: string; streaming: boolean }> = ({
  text,
  streaming,
}) => {
  if (!text.trim() && !streaming) return null;
  return (
    <div className="flex items-start gap-1.5 text-[11px] text-fg-muted">
      <Brain size={11} className="mt-0.5 shrink-0 text-violet-400" />
      <span className="whitespace-pre-wrap break-words">{text || '…'}</span>
    </div>
  );
};
