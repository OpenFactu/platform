import type { BadgeProps } from '@openfactu/ui';

export function packageTone(status: string): BadgeProps['variant'] {
  switch (status) {
    case 'delivered':
      return 'success';
    case 'returned':
      return 'error';
    case 'shipped':
      return 'info';
    default:
      return 'neutral';
  }
}
