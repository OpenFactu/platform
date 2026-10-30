//! Reuniones, agnósticas al proveedor: Keirost (vídeo propio), Google Meet,
//! Microsoft Teams… Cada uno será un `MeetingProvider`.
//!
//! Es el contrato de la fase de reuniones; todavía no hay implementaciones ni
//! tabla `meeting`, de ahí el `allow`.
#![allow(dead_code)]

use async_trait::async_trait;
use chrono::{DateTime, Utc};

pub struct MeetingRequest {
    pub tenant_id: String,
    pub organizer_id: String,
    pub title: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub attendee_ids: Vec<String>,
}

/// Cómo se entra: un enlace (Meet, Teams) o una sala propia de Keirost.
pub enum JoinInfo {
    Url(String),
    KeirostRoom { room_id: String },
}

pub struct ProviderMeeting {
    /// Id del evento en el proveedor, para actualizarlo o cancelarlo.
    pub external_id: String,
    pub join: JoinInfo,
}

#[derive(Debug, thiserror::Error)]
pub enum MeetingError {
    #[error("El usuario no tiene conectada su cuenta del proveedor")]
    NotConnected,
    #[error("El proveedor respondió con un error: {0}")]
    Provider(String),
}

#[async_trait]
pub trait MeetingProvider: Send + Sync {
    /// "keirost", "google_meet", "ms_teams"…
    fn id(&self) -> &'static str;
    async fn create(&self, req: &MeetingRequest) -> Result<ProviderMeeting, MeetingError>;
    async fn update(&self, external_id: &str, req: &MeetingRequest) -> Result<(), MeetingError>;
    async fn cancel(&self, external_id: &str) -> Result<(), MeetingError>;
}
