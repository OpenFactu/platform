//! Reuniones, agnósticas al proveedor: Keirost (vídeo propio), Google Meet,
//! Microsoft Teams… Cada uno es un `MeetingProvider`.
//!
//! Hay `link`, donde quien organiza pega el enlace (de Meet, Teams, Zoom…) y el
//! servicio no habla con nadie, y `keirost`, la videollamada propia. Los que
//! tienen API (Meet y Teams, con OAuth por usuario) entran aquí sin tocar el resto.

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;
use chrono::{DateTime, Utc};

// El enlace solo lee `join_url`; el resto es para los proveedores con API.
#[allow(dead_code)]
pub struct MeetingRequest {
    pub tenant_id: String,
    pub organizer_id: String,
    pub title: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub attendee_ids: Vec<String>,
    /// El enlace que trae quien organiza, para los proveedores que no lo crean.
    pub join_url: Option<String>,
}

/// Cómo se entra: un enlace (Meet, Teams) o una sala propia de Keirost.
pub enum JoinInfo {
    Url(String),
    /// Se entra con la videollamada de su conversación (`/meetings/{id}/call`).
    KeirostRoom,
}

pub struct ProviderMeeting {
    /// Id del evento en el proveedor, para actualizarlo o cancelarlo.
    pub external_id: Option<String>,
    pub join: JoinInfo,
}

#[derive(Debug, thiserror::Error)]
pub enum MeetingError {
    #[allow(dead_code)] // Para los proveedores con OAuth por usuario.
    #[error("El usuario no tiene conectada su cuenta del proveedor")]
    NotConnected,
    #[error("Falta el enlace de la reunión")]
    MissingUrl,
    #[allow(dead_code)]
    #[error("El proveedor respondió con un error: {0}")]
    Provider(String),
}

#[async_trait]
pub trait MeetingProvider: Send + Sync {
    /// "link", "google_meet", "ms_teams", "keirost"…
    fn id(&self) -> &'static str;
    async fn create(&self, req: &MeetingRequest) -> Result<ProviderMeeting, MeetingError>;
    async fn update(
        &self,
        external_id: Option<&str>,
        req: &MeetingRequest,
    ) -> Result<ProviderMeeting, MeetingError>;
    async fn cancel(&self, external_id: Option<&str>) -> Result<(), MeetingError>;
}

/// Un enlace pegado a mano. No hay nada que crear ni cancelar fuera.
pub struct LinkProvider;

#[async_trait]
impl MeetingProvider for LinkProvider {
    fn id(&self) -> &'static str {
        "link"
    }

    async fn create(&self, req: &MeetingRequest) -> Result<ProviderMeeting, MeetingError> {
        let url = req.join_url.clone().ok_or(MeetingError::MissingUrl)?;
        Ok(ProviderMeeting {
            external_id: None,
            join: JoinInfo::Url(url),
        })
    }

    async fn update(
        &self,
        _external_id: Option<&str>,
        req: &MeetingRequest,
    ) -> Result<ProviderMeeting, MeetingError> {
        self.create(req).await
    }

    async fn cancel(&self, _external_id: Option<&str>) -> Result<(), MeetingError> {
        Ok(())
    }
}

/// La videollamada propia. La sala se abre al entrar el primero: al programarla
/// no hay nada que reservar.
pub struct KeirostProvider;

#[async_trait]
impl MeetingProvider for KeirostProvider {
    fn id(&self) -> &'static str {
        "keirost"
    }

    async fn create(&self, _req: &MeetingRequest) -> Result<ProviderMeeting, MeetingError> {
        Ok(ProviderMeeting {
            external_id: None,
            join: JoinInfo::KeirostRoom,
        })
    }

    async fn update(
        &self,
        _external_id: Option<&str>,
        req: &MeetingRequest,
    ) -> Result<ProviderMeeting, MeetingError> {
        self.create(req).await
    }

    async fn cancel(&self, _external_id: Option<&str>) -> Result<(), MeetingError> {
        Ok(())
    }
}

/// Proveedores disponibles, por id.
pub struct MeetingRegistry {
    providers: HashMap<&'static str, Arc<dyn MeetingProvider>>,
}

impl MeetingRegistry {
    pub fn new() -> Self {
        let mut providers: HashMap<&'static str, Arc<dyn MeetingProvider>> = HashMap::new();
        let link: Arc<dyn MeetingProvider> = Arc::new(LinkProvider);
        providers.insert(link.id(), link);
        let keirost: Arc<dyn MeetingProvider> = Arc::new(KeirostProvider);
        providers.insert(keirost.id(), keirost);
        Self { providers }
    }

    pub fn get(&self, id: &str) -> Option<Arc<dyn MeetingProvider>> {
        self.providers.get(id).cloned()
    }

    pub fn ids(&self) -> Vec<&'static str> {
        let mut ids: Vec<_> = self.providers.keys().copied().collect();
        ids.sort_unstable();
        ids
    }
}
