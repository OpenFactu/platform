import { useMemo } from 'react';
import type { ChatAttachment, ChatMessageData, ChatProviderProps } from '@openfactu/ui';
import { useI18n } from '@/i18n/I18nContext';
import { erpApi, messagingApi } from '../api/messagingApi';
import { mapMessage, rememberUpload, startHistory } from '../api/messageCache';
import { messagingErrorText } from '../domain/errors';
import { MEETING_BLOCK } from '../domain/meeting';

/** Límite del ERP para `/api/attachments` (multer). */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
const MAX_FILES = 10;

type Transport = Pick<
  ChatProviderProps,
  | 'onSendMessage'
  | 'onLoadOlderMessages'
  | 'onEditMessage'
  | 'onDeleteMessage'
  | 'onReactionChange'
  | 'onConversationChange'
  | 'onUploadAttachment'
  | 'canEditMessage'
  | 'canDeleteMessage'
  | 'attachmentLimits'
>;

/**
 * Lo que el kit de chat le pide al transporte, resuelto contra el servicio de
 * mensajería. El kit hace la parte optimista (pinta "enviando", reintenta,
 * concilia por `clientId`); aquí solo se habla con el servidor.
 */
export function useChatTransport(): Transport {
  const { t } = useI18n();

  return useMemo<Transport>(() => {
    // Envíos ya intentados: si el canal falló, el siguiente intento es un reintento.
    const attempted = new Set<string>();
    // El kit enseña `error.message` tal cual: que llegue traducido.
    const friendly =
      <A extends unknown[], R>(fn: (...args: A) => Promise<R>) =>
      async (...args: A): Promise<R> => {
        try {
          return await fn(...args);
        } catch (err) {
          throw new Error(messagingErrorText(err, t));
        }
      };

    return {
      onSendMessage: friendly(async (message: ChatMessageData) => {
        const clientId = message.clientId ?? message.id;
        const files = (message.attachments ?? []).map((a) => ({
          attachmentId: a.id,
          name: a.name,
          size: a.size,
          mime: a.mediaType,
        }));
        // El envío es idempotente por `clientId`: repetirlo devuelve el que había.
        let dto = files.length
          ? await messagingApi.sendFiles(
              message.conversationId,
              files,
              message.text,
              clientId,
              message.replyToId,
            )
          : await messagingApi.sendText(
              message.conversationId,
              message.text,
              clientId,
              message.replyToId,
            );
        // Si el canal (Telegram…) no lo aceptó y esto es un reintento, se le
        // vuelve a pedir que lo entregue.
        if (dto.deliveryError && attempted.has(clientId)) dto = await messagingApi.retry(dto.id);
        attempted.add(clientId);
        if (dto.deliveryError) throw new Error(t('messaging.channels.notDelivered'));
        return mapMessage(dto, t);
      }),

      onLoadOlderMessages: friendly(async (conversationId, before) => {
        // La primera vez, desde el final (ver `startHistory`). Después, desde el
        // más antiguo en pantalla; uno aún sin confirmar no tiene id de servidor.
        const confirmed = before && before.status !== 'sending' && before.status !== 'error';
        const anchor = !startHistory(conversationId) && confirmed ? before.id : undefined;
        const page = await messagingApi.messages(conversationId, anchor);
        return { messages: page.messages.map((m) => mapMessage(m, t)), hasOlder: page.hasMore };
      }),

      onEditMessage: friendly(async ({ messageId, text }) => {
        await messagingApi.edit(messageId, text);
      }),

      onDeleteMessage: friendly(async ({ messageId }) => {
        await messagingApi.remove(messageId);
      }),

      onReactionChange: friendly(async ({ messageId, emoji, active }) => {
        await messagingApi.react(messageId, emoji, active);
      }),

      onConversationChange: friendly(async (conversationId, patch) => {
        const { pinnedMessageIds, ...prefs } = patch;
        if (Object.keys(prefs).length) await messagingApi.setPrefs(conversationId, prefs);
        if (pinnedMessageIds) {
          const current = (await messagingApi.conversation(conversationId)).pinnedMessageIds;
          const add = pinnedMessageIds.filter((id) => !current.includes(id));
          const remove = current.filter((id) => !pinnedMessageIds.includes(id));
          await Promise.all([
            ...add.map((id) => messagingApi.pin(conversationId, id, true)),
            ...remove.map((id) => messagingApi.pin(conversationId, id, false)),
          ]);
        }
      }),

      onUploadAttachment: friendly(
        async ({ file, conversationId, signal, onProgress }): Promise<ChatAttachment> => {
          onProgress(10);
          const row = await erpApi.upload(conversationId, file, signal);
          onProgress(100);
          return {
            id: row.id,
            name: row.fileName,
            mediaType: row.mime || file.type || 'application/octet-stream',
            size: row.size,
            status: 'ready',
            url: rememberUpload(row.id, file),
          };
        },
      ),

      // Solo se edita el texto: un documento compartido o unos ficheros, no.
      canEditMessage: (message) => !message.attachments?.length && !message.blocks?.length,
      // Una reunión no se borra: se cancela desde su tarjeta.
      canDeleteMessage: (message) => !message.blocks?.some((b) => b.kind === MEETING_BLOCK),

      attachmentLimits: { maxFiles: MAX_FILES, maxBytes: MAX_UPLOAD_BYTES },
    };
  }, [t]);
}
