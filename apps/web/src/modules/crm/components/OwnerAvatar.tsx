import React from 'react';
import { Avatar, Tooltip } from '@openfactu/ui';
import type { Member } from '../domain/crm';

/** Avatar pequeño del responsable, con su nombre al pasar el ratón. */
export const OwnerAvatar: React.FC<{ member?: Member | null }> = ({ member }) => {
  if (!member) return null;
  return (
    <Tooltip content={member.name}>
      <Avatar size="xs" src={member.avatarUrl ?? undefined} name={member.name} />
    </Tooltip>
  );
};
