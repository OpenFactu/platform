use std::sync::Arc;

use sqlx::PgPool;

use crate::auth::TicketVerifier;
use crate::channels::telegram::TelegramManager;
use crate::channels::ChannelRegistry;
use crate::config::Config;
use crate::crypto::{SecretBox, Vault};
use crate::erp::ErpClient;
use crate::hub::{Broadcaster, Hub};
use crate::meetings::MeetingRegistry;
use crate::rtc::Calls;

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub tickets: TicketVerifier,
    /// Registro de conexiones de esta réplica (presencia, sockets).
    pub hub: Arc<Hub>,
    /// Por dónde se reparten los eventos. Hoy es el mismo `hub`.
    pub broadcaster: Arc<dyn Broadcaster>,
    pub channels: Arc<ChannelRegistry>,
    /// Cifra las credenciales de los canales.
    pub secrets: SecretBox,
    /// Cifra el contenido de los mensajes, con una clave por empresa.
    pub vault: Vault,
    pub erp: ErpClient,
    pub telegram: Arc<TelegramManager>,
    /// Proveedores de reuniones (enlace; luego Meet, Teams, Keirost).
    pub meetings: Arc<MeetingRegistry>,
    /// Videollamadas: el motor de vídeo y quién está en cada una.
    pub calls: Arc<Calls>,
}

impl AppState {
    pub fn new(db: PgPool, cfg: &Config, calls: Arc<Calls>) -> Self {
        let hub = Arc::new(Hub::default());
        Self {
            vault: Vault::new(db.clone(), &cfg.data_key),
            db,
            tickets: TicketVerifier::new(&cfg.ticket_secret),
            broadcaster: hub.clone(),
            hub,
            channels: Arc::new(ChannelRegistry::new()),
            secrets: SecretBox::new(&cfg.ticket_secret),
            erp: ErpClient::new(&cfg.erp_url, &cfg.ticket_secret),
            telegram: Arc::new(TelegramManager::default()),
            meetings: Arc::new(MeetingRegistry::new()),
            calls,
        }
    }
}
