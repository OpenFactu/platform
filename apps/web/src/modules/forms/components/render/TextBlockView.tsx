import React from 'react';
import { Card, Quote, cn } from '@openfactu/ui';
import type { TextBlock } from '@forms-engine';
import { EffectTitle } from './EffectTitle';
import { RichText } from './RichText';

/** Título y texto del bloque, sin la tarjeta (el editor lo pinta dentro de la suya). */
export const TextBlockContent: React.FC<{ block: TextBlock }> = ({ block }) => {
  const style = block.textStyle ?? 'body';
  const body = block.description ? (
    style === 'quote' ? (
      <Quote>
        <RichText text={block.description} />
      </Quote>
    ) : (
      <RichText
        text={block.description}
        variant={style === 'lead' ? 'lead' : style === 'small' ? 'small' : 'body'}
        dropCap={block.dropCap && (style === 'body' || style === 'lead')}
      />
    )
  ) : null;
  return (
    <div className={cn('space-y-2', block.align === 'center' && 'text-center')}>
      {block.title && (
        <EffectTitle
          text={block.title}
          effect={block.effect}
          className="text-lg font-semibold text-fg-default"
        />
      )}
      {body}
    </div>
  );
};

/** El bloque tal y como lo ve quien responde; «Destacado» va en una tarjeta con filete. */
export const TextBlockView: React.FC<{ block: TextBlock }> = ({ block }) =>
  block.textStyle === 'callout' ? (
    <Card variant="subtle" className="border-l-4 border-l-accent">
      <TextBlockContent block={block} />
    </Card>
  ) : (
    <Card>
      <TextBlockContent block={block} />
    </Card>
  );
