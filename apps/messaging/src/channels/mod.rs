//! Canales: por dónde viaja una conversación. El núcleo (conversaciones,
//! mensajes, websocket) no sabe de proveedores; cada canal es un adaptador.
//!
//! Hoy solo existe `internal`. Telegram y WhatsApp serán otros `ChannelAdapter`
//! registrados aquí, sin tocar el resto del servicio.

mod internal;

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;

use crate::store::conversations::Membership;
use crate::store::messages::MessageDto;

pub use internal::InternalChannel;

/// Qué sabe hacer un canal. La API rechaza lo que el canal no soporta.
#[derive(Debug, Clone, Copy)]
pub struct ChannelCapabilities {
    pub attachments: bool,
}

// Solo lo construyen los adaptadores que hablan con un proveedor externo; el
// interno nunca falla.
#[allow(dead_code)]
#[derive(Debug, thiserror::Error)]
pub enum ChannelError {
    #[error("El proveedor rechazó el mensaje: {0}")]
    Rejected(String),
}

#[async_trait]
pub trait ChannelAdapter: Send + Sync {
    fn id(&self) -> &'static str;

    fn capabilities(&self) -> ChannelCapabilities;

    /// Entrega un mensaje ya guardado al proveedor. En `internal` no hay nada que
    /// hacer: llega por el websocket como cualquier otro.
    async fn deliver(
        &self,
        conversation: &Membership,
        message: &MessageDto,
    ) -> Result<(), ChannelError>;
}

/// Adaptadores disponibles, por id de canal.
pub struct ChannelRegistry {
    adapters: HashMap<&'static str, Arc<dyn ChannelAdapter>>,
}

impl ChannelRegistry {
    pub fn new() -> Self {
        let mut registry = Self {
            adapters: HashMap::new(),
        };
        registry.register(Arc::new(InternalChannel));
        registry
    }

    pub fn register(&mut self, adapter: Arc<dyn ChannelAdapter>) {
        self.adapters.insert(adapter.id(), adapter);
    }

    pub fn get(&self, channel: &str) -> Option<Arc<dyn ChannelAdapter>> {
        self.adapters.get(channel).cloned()
    }
}
