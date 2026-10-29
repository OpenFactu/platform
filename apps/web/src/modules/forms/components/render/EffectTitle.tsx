import React from 'react';
import { GradientText, ShimmerText, TextReveal, TextScramble, Typewriter, cn } from '@openfactu/ui';
import type { TitleEffect } from '@forms-engine';

interface Props {
  text: string;
  effect?: TitleEffect;
  as?: 'h1' | 'h2' | 'h3';
  className?: string;
}

/** Título con uno de los efectos de texto de @openfactu/ui (o sin efecto). */
export const EffectTitle: React.FC<Props> = ({ text, effect = 'none', as = 'h3', className }) => {
  const Tag = as;
  switch (effect) {
    case 'gradient':
    case 'gradientAnimated':
      return (
        <GradientText as={as} animated={effect === 'gradientAnimated'} className={className}>
          {text}
        </GradientText>
      );
    case 'typewriter':
      // key: si cambia el texto (editor), vuelve a escribirse desde el principio.
      return <Typewriter key={text} as={as} text={text} loop={false} className={className} />;
    case 'reveal':
      return <TextReveal key={text} as={as} text={text} className={className} />;
    case 'scramble':
      return (
        <Tag className={className}>
          <TextScramble text={text} />
        </Tag>
      );
    case 'shimmer':
      return (
        <ShimmerText as={as} className={className}>
          {text}
        </ShimmerText>
      );
    default:
      return <Tag className={cn(className)}>{text}</Tag>;
  }
};
