import React from 'react';
import { Alert } from '@openfactu/ui';

interface Props {
  rows: Array<{ uncosted?: number | boolean }>;
  message: string;
}

/** Sin coste, un margen sale más alto de lo real y un inventario vale menos: se avisa. */
export const UncostedNotice: React.FC<Props> = ({ rows, message }) => {
  if (!rows.some((row) => Number(row.uncosted || 0) > 0)) return null;
  return <Alert tone="warning">{message}</Alert>;
};
