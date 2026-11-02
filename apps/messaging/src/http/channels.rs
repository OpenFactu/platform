//! Canales de la empresa (conectar el bot de Telegram) y contactos de fuera
//! (vincularlos a un interlocutor del ERP).

use axum::extract::{Path, State};
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;
use serde_json::json;
use uuid::Uuid;

use crate::auth::Session;
use crate::channels::telegram::api::{BotApi, TgError};
use crate::channels::telegram::CHANNEL as TELEGRAM;
use crate::error::ApiError;
use crate::state::AppState;
use crate::store;
use crate::store::channels::ChannelAccountView;
use crate::ws::protocol::ServerEvent;

/// Canales conectados en la empresa. Lo ven quienes atienden clientes y los
/// administradores; nunca incluye la credencial.
pub async fn list(
    State(state): State<AppState>,
    session: Session,
) -> Result<Json<Vec<ChannelAccountView>>, ApiError> {
    if !session.customers && !session.manage {
        session.require_customers()?;
    }
    let accounts = store::channels::accounts_for_tenant(&state.db, &session.tenant_id).await?;
    Ok(Json(accounts.iter().map(Into::into).collect()))
}

#[derive(Deserialize)]
pub struct ConnectInput {
    token: String,
}

/// Conecta el bot de la empresa: comprueba el token con Telegram, lo guarda
/// cifrado y empieza a leer sus mensajes.
pub async fn connect_telegram(
    State(state): State<AppState>,
    session: Session,
    Json(input): Json<ConnectInput>,
) -> Result<Json<ChannelAccountView>, ApiError> {
    session.require_manage()?;
    let token = input.token.trim();
    if token.is_empty() || token.len() > 200 {
        return Err(invalid_token());
    }
    let me = match BotApi::new(token).get_me().await {
        Ok(me) => me,
        Err(TgError::Unauthorized) => return Err(invalid_token()),
        Err(e) => {
            return Err(ApiError::new(
                StatusCode::BAD_GATEWAY,
                "provider_unreachable",
                e.to_string(),
            ))
        }
    };

    if let Some(previous) =
        store::channels::account(&state.db, &session.tenant_id, TELEGRAM).await?
    {
        state.telegram.stop(previous.id);
    }
    let account = store::channels::upsert_account(
        &state.db,
        &session.tenant_id,
        TELEGRAM,
        &me.first_name,
        &json!({ "username": me.username, "botId": me.id }),
        &state.secrets.seal(token),
        &session.user_id,
    )
    .await?;
    state.telegram.start(state.clone(), account.clone());
    Ok(Json((&account).into()))
}

pub async fn disconnect_telegram(
    State(state): State<AppState>,
    session: Session,
) -> Result<StatusCode, ApiError> {
    session.require_manage()?;
    if let Some(account) = store::channels::account(&state.db, &session.tenant_id, TELEGRAM).await?
    {
        state.telegram.stop(account.id);
        store::channels::delete_account(&state.db, &session.tenant_id, TELEGRAM).await?;
    }
    Ok(StatusCode::NO_CONTENT)
}

fn invalid_token() -> ApiError {
    ApiError::new(
        StatusCode::BAD_REQUEST,
        "invalid_token",
        "Telegram no reconoce ese token",
    )
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkInput {
    /// `None` desvincula.
    partner_id: Option<String>,
    partner_name: Option<String>,
}

/// Vincula el contacto a un interlocutor del ERP. El id lo elige la web con el
/// buscador del ERP (que ya filtra por permisos); aquí se guarda id + nombre.
pub async fn link_contact(
    State(state): State<AppState>,
    session: Session,
    Path(id): Path<Uuid>,
    Json(input): Json<LinkInput>,
) -> Result<StatusCode, ApiError> {
    session.require_customers()?;
    session.require_write()?;
    let partner = match (&input.partner_id, &input.partner_name) {
        (Some(id), Some(name)) if !id.trim().is_empty() && !name.trim().is_empty() => {
            Some((id.trim(), name.trim()))
        }
        (None, _) => None,
        _ => {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "invalid_partner",
                "Falta el interlocutor",
            ))
        }
    };
    let conversations = store::channels::link_partner(&state.db, &session.tenant_id, id, partner)
        .await?
        .ok_or_else(|| ApiError::not_found("contact_not_found", "Contacto no encontrado"))?;
    for conversation_id in conversations {
        state.broadcaster.publish_customers(
            &session.tenant_id,
            &ServerEvent::ConversationUpdated { conversation_id },
        );
    }
    Ok(StatusCode::NO_CONTENT)
}
