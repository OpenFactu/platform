use async_trait::async_trait;

use super::{ChannelAdapter, ChannelCapabilities, ChannelError};
use crate::store::conversations::Membership;
use crate::store::messages::MessageDto;

/// El chat del equipo: no sale de Keirost.
pub struct InternalChannel;

#[async_trait]
impl ChannelAdapter for InternalChannel {
    fn id(&self) -> &'static str {
        "internal"
    }

    fn capabilities(&self) -> ChannelCapabilities {
        ChannelCapabilities { attachments: true }
    }

    async fn deliver(&self, _: &Membership, _: &MessageDto) -> Result<(), ChannelError> {
        Ok(())
    }
}
