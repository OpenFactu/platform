use async_trait::async_trait;

use super::{ChannelAdapter, ChannelCapabilities, ChannelError, Delivery};
use crate::state::AppState;

/// El chat del equipo: no sale de Keirost.
pub struct InternalChannel;

#[async_trait]
impl ChannelAdapter for InternalChannel {
    fn id(&self) -> &'static str {
        "internal"
    }

    fn capabilities(&self) -> ChannelCapabilities {
        ChannelCapabilities {
            attachments: true,
            documents: true,
        }
    }

    async fn deliver(&self, _: &AppState, _: Delivery<'_>) -> Result<Option<String>, ChannelError> {
        Ok(None)
    }
}
