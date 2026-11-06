import React, { useCallback, useEffect, useState } from 'react';
import { Check, Copy, Link2 } from 'lucide-react';
import { Button, Input, Modal } from '@openfactu/ui';
import { formatDateTime } from '@/i18n/format';
import { useI18n } from '@/i18n/I18nContext';
import { messagingApi, type CallInvite } from '../api/messagingApi';
import { messagingErrorText } from '../domain/errors';

/**
 * Enlaces para que entre gente sin cuenta, a una llamada en curso o a una reunión.
 * El enlace solo se ve al crearlo: del token solo se guarda el hash.
 */
export const InviteGuestsModal: React.FC<{
  conversationId: string;
  callId?: string;
  meetingId?: string;
  onClose: () => void;
}> = ({ conversationId, callId, meetingId, onClose }) => {
  const { t } = useI18n();
  const [link, setLink] = useState<string | null>(null);
  const [invites, setInvites] = useState<CallInvite[]>([]);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    messagingApi
      .invites(conversationId)
      .then(setInvites)
      .catch((err) => setError(messagingErrorText(err, t)));
  }, [conversationId, t]);

  useEffect(reload, [reload]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { token } = meetingId
        ? await messagingApi.inviteToMeeting(meetingId)
        : await messagingApi.inviteToCall(callId ?? '');
      setLink(`${window.location.origin}/join/${token}`);
      setCopied(false);
      reload();
    } catch (err) {
      setError(messagingErrorText(err, t));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
  };

  const revoke = async (id: string) => {
    try {
      await messagingApi.revokeInvite(id);
      setLink(null);
      reload();
    } catch (err) {
      setError(messagingErrorText(err, t));
    }
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={t('messaging.guest.inviteTitle')}
      size="md"
      error={error}
      hideCancel
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-fg-body">
          {t(meetingId ? 'messaging.guest.inviteMeetingHint' : 'messaging.guest.inviteCallHint')}
        </p>
        {link ? (
          <div className="flex items-end gap-2">
            <Input
              label={t('messaging.guest.link')}
              value={link}
              readOnly
              containerClassName="min-w-0 flex-1"
              onFocus={(e) => e.target.select()}
            />
            <Button variant="soft" onClick={() => void copy()}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {t(copied ? 'messaging.guest.copied' : 'messaging.guest.copy')}
            </Button>
          </div>
        ) : (
          <Button onClick={() => void create()} isLoading={busy} disabled={busy}>
            <Link2 size={16} />
            {t('messaging.guest.createLink')}
          </Button>
        )}
        {invites.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-fg-default">
              {t('messaging.guest.activeLinks')}
            </h3>
            <ul className="flex flex-col gap-1">
              {invites.map((invite) => (
                <li key={invite.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-fg-body">
                    {t('messaging.guest.expires', { date: formatDateTime(invite.expiresAt) })}
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => void revoke(invite.id)}>
                    {t('messaging.guest.revoke')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
};
