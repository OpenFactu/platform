use std::sync::Arc;

use sqlx::PgPool;

use crate::auth::TicketVerifier;
use crate::channels::ChannelRegistry;
use crate::hub::{Broadcaster, Hub};

#[derive(Clone)]
pub struct AppState {
    pub db: PgPool,
    pub tickets: TicketVerifier,
    /// Registro de conexiones de esta réplica (presencia, sockets).
    pub hub: Arc<Hub>,
    /// Por dónde se reparten los eventos. Hoy es el mismo `hub`.
    pub broadcaster: Arc<dyn Broadcaster>,
    pub channels: Arc<ChannelRegistry>,
}

impl AppState {
    pub fn new(db: PgPool, ticket_secret: &str) -> Self {
        let hub = Arc::new(Hub::default());
        Self {
            db,
            tickets: TicketVerifier::new(ticket_secret),
            broadcaster: hub.clone(),
            hub,
            channels: Arc::new(ChannelRegistry::new()),
        }
    }
}
