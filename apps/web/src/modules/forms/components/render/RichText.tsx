import React from 'react';
import { Highlight, Paragraph, cn, type ParagraphProps } from '@openfactu/ui';
import { parseRichText, type RichPiece } from '../../domain/richText';

const Piece: React.FC<{ p: RichPiece }> = ({ p }) => {
  if (p.kind === 'bold') return <strong className="font-semibold text-fg-default">{p.text}</strong>;
  if (p.kind === 'italic') return <em>{p.text}</em>;
  if (p.kind === 'mark') return <Highlight>{p.text}</Highlight>;
  return <>{p.text}</>;
};

interface Props {
  text: string;
  variant?: ParagraphProps['variant'];
  /** Letra capital en el primer párrafo. */
  dropCap?: boolean;
  className?: string;
}

/** Texto con **negrita**, *cursiva* y ==resaltado==, en párrafos de @openfactu/ui. */
export const RichText: React.FC<Props> = ({ text, variant = 'body', dropCap, className }) => (
  <div className={cn('space-y-2', className)}>
    {parseRichText(text).map((lines, i) => (
      <Paragraph key={i} variant={variant} dropCap={dropCap && i === 0}>
        {lines.map((pieces, j) => (
          <React.Fragment key={j}>
            {j > 0 && <br />}
            {pieces.map((p, k) => (
              <Piece key={k} p={p} />
            ))}
          </React.Fragment>
        ))}
      </Paragraph>
    ))}
  </div>
);
