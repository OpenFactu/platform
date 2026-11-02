//! Canales: por dónde viaja una conversación. El núcleo (conversaciones,
//! mensajes, websocket) no sabe de proveedores; cada canal es un adaptador.
//!
//! - `internal`: el chat del equipo, no sale de Keirost.
//! - `telegram`: el bot de la empresa (ver `telegram/`).
//!
//! WhatsApp y los que vengan serán otro `ChannelAdapter` registrado aquí. Lo
//! que llega de cualquier proveedor entra por `inbound::ingest`, igual para
//! todos.

pub mod inbound;
mod internal;
pub mod telegram;

use std::collections::HashMap;
use std::sync::Arc;

use async_trait::async_trait;

use crate::state::AppState;
use crate::store::messages::MessageDto;

pub use internal::InternalChannel;

/// Qué sabe hacer un canal. La API rechaza lo que el canal no soporta.
#[derive(Debug, Clone, Copy)]
pub struct ChannelCapabilities {
    pub attachments: bool,
    /// Documentos del ERP compartidos como referencia (solo tienen sentido dentro).
    pub documents: bool,
}

#[derive(Debug, thiserror::Error)]
pub enum ChannelError {
    #[error("El canal no está conectado en esta empresa")]
    NotConnected,
    #[error("Este canal no admite ese tipo de mensaje")]
    Unsupported,
    #[error("El proveedor rechazó el mensaje: {0}")]
    Rejected(String),
}

/// Lo que hace falta para entregar un mensaje ya guardado.
pub struct Delivery<'a> {
    pub tenant_id: &'a str,
    /// La conversación en el proveedor (chat de Telegram…).
    pub external_ref: Option<&'a str>,
    pub message: &'a MessageDto,
}

#[async_trait]
pub trait ChannelAdapter: Send + Sync {
    fn id(&self) -> &'static str;

    fn capabilities(&self) -> ChannelCapabilities;

    /// Entrega al proveedor un mensaje ya guardado. Devuelve el id que le dio el
    /// proveedor, si lo hay. En `internal` no hay nada que hacer: llega por el
    /// websocket como cualquier otro.
    async fn deliver(
        &self,
        state: &AppState,
        delivery: Delivery<'_>,
    ) -> Result<Option<String>, ChannelError>;

    /// Deja en el proveedor la reacción del equipo a un mensaje (`None` la
    /// quita). Por defecto no hay nada que hacer.
    async fn react(
        &self,
        _state: &AppState,
        _target: ReactionTarget<'_>,
        _emoji: Option<&str>,
    ) -> Result<(), ChannelError> {
        Ok(())
    }
}

/// Un mensaje en el proveedor: su conversación y su id allí.
pub struct ReactionTarget<'a> {
    pub tenant_id: &'a str,
    pub external_ref: &'a str,
    pub external_message_id: &'a str,
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
        registry.register(Arc::new(telegram::TelegramChannel));
        registry
    }

    pub fn register(&mut self, adapter: Arc<dyn ChannelAdapter>) {
        self.adapters.insert(adapter.id(), adapter);
    }

    pub fn get(&self, channel: &str) -> Option<Arc<dyn ChannelAdapter>> {
        self.adapters.get(channel).cloned()
    }
}
