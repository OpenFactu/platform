import React from 'react';
import { AIReasoning } from '@openfactu/ui/ai';

/** Razonamiento del modelo: se abre mientras piensa y se cierra al acabar. */
export const ReasoningText: React.FC<{ text: string; streaming: boolean }> = ({
  text,
  streaming,
}) => {
  if (!text.trim() && !streaming) return null;
  return <AIReasoning text={text} streaming={streaming} />;
};
