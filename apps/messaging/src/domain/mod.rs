//! Reglas de conversaciones y mensajes, sin base de datos ni red: lo que entra
//! se valida y se normaliza aquí antes de tocar nada.

pub mod conversation;
pub mod meeting;
pub mod message;

#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum DomainError {
    #[error("El mensaje está vacío")]
    EmptyMessage,
    #[error("El mensaje supera el máximo de caracteres")]
    MessageTooLong,
    #[error("Contenido no válido para el tipo de mensaje: {0}")]
    InvalidPayload(&'static str),
    #[error("Los mensajes de sistema no se envían desde el cliente")]
    SystemNotAllowed,
    #[error("clientMsgId no válido")]
    InvalidClientMsgId,
    #[error("Una conversación directa es con una sola persona")]
    DirectNeedsOnePeer,
    #[error("Un grupo necesita al menos otra persona")]
    GroupNeedsPeers,
    #[error("Demasiados participantes")]
    TooManyParticipants,
    #[error("El título es demasiado largo")]
    TitleTooLong,
    #[error("Las conversaciones directas no tienen título")]
    DirectHasNoTitle,
    #[error("Las conversaciones directas no se modifican")]
    DirectIsImmutable,
    #[error("Algún participante no pertenece a la empresa")]
    NotInTenant,
    #[error("Solo el propietario puede quitar a otros")]
    OnlyOwnerCanRemove,
    #[error("Solo el autor puede cambiar su mensaje")]
    OnlyAuthor,
    #[error("Este mensaje no se puede editar")]
    NotEditable,
    #[error("Este canal no admite adjuntos")]
    AttachmentsNotSupported,
    #[error("El mensaje al que respondes no está en esta conversación")]
    ReplyNotFound,
    #[error("Reacción no válida")]
    InvalidReaction,
    #[error("Esta conversación no se puede crear ni modificar así")]
    NotEditableConversation,
    #[error("Este canal no admite ese tipo de mensaje")]
    UnsupportedByChannel,
    #[error("Reunión no válida: {0}")]
    InvalidMeeting(&'static str),
    #[error("Ese proveedor de reuniones no está disponible")]
    UnknownMeetingProvider,
    #[error("Solo quien organiza la reunión puede cambiarla")]
    OnlyOrganizer,
    #[error("La reunión está cancelada")]
    MeetingCancelled,
    #[error("Las conversaciones con clientes no admiten llamada")]
    CallsNotSupported,
}

impl DomainError {
    pub fn code(&self) -> &'static str {
        match self {
            DomainError::EmptyMessage => "message_empty",
            DomainError::MessageTooLong => "message_too_long",
            DomainError::InvalidPayload(_) => "invalid_payload",
            DomainError::SystemNotAllowed => "system_not_allowed",
            DomainError::InvalidClientMsgId => "invalid_client_msg_id",
            DomainError::DirectNeedsOnePeer => "direct_needs_one_peer",
            DomainError::GroupNeedsPeers => "group_needs_peers",
            DomainError::TooManyParticipants => "too_many_participants",
            DomainError::TitleTooLong => "title_too_long",
            DomainError::DirectHasNoTitle => "direct_has_no_title",
            DomainError::DirectIsImmutable => "direct_is_immutable",
            DomainError::NotInTenant => "participants_not_in_tenant",
            DomainError::OnlyOwnerCanRemove => "only_owner_can_remove",
            DomainError::OnlyAuthor => "only_author",
            DomainError::NotEditable => "not_editable",
            DomainError::AttachmentsNotSupported => "attachments_not_supported",
            DomainError::ReplyNotFound => "reply_not_found",
            DomainError::InvalidReaction => "invalid_reaction",
            DomainError::NotEditableConversation => "conversation_not_editable",
            DomainError::UnsupportedByChannel => "unsupported_by_channel",
            DomainError::InvalidMeeting(_) => "invalid_meeting",
            DomainError::UnknownMeetingProvider => "unknown_meeting_provider",
            DomainError::OnlyOrganizer => "only_organizer",
            DomainError::MeetingCancelled => "meeting_cancelled",
            DomainError::CallsNotSupported => "calls_not_supported",
        }
    }
}

/// Recorta y devuelve `None` si queda vacío.
pub(crate) fn clean(s: Option<String>) -> Option<String> {
    s.map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}
