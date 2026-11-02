//! Lo que pide el ERP, no los navegadores: la mensajería de una empresa para sus
//! copias de seguridad. Fuera de `/rt`, así que ni nginx ni Vite lo publican, y
//! con un token de servicio de un minuto para esa empresa.

use axum::extract::{Path, State};
use axum::http::header::AUTHORIZATION;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;

use crate::error::ApiError;
use crate::state::AppState;
use crate::store::transfer::{self, TenantExport, TransferError};

fn authorize(state: &AppState, headers: &HeaderMap, tenant_id: &str) -> Result<(), ApiError> {
    let token = headers
        .get(AUTHORIZATION)
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "))
        .unwrap_or_default();
    match state.tickets.verify_service(token) {
        Ok(tid) if tid == tenant_id => Ok(()),
        _ => Err(ApiError::new(
            StatusCode::UNAUTHORIZED,
            "unauthorized",
            "No autorizado",
        )),
    }
}

impl From<TransferError> for ApiError {
    fn from(e: TransferError) -> Self {
        match e {
            TransferError::Db(e) => e.into(),
            TransferError::NotEmpty => {
                ApiError::new(StatusCode::CONFLICT, "tenant_not_empty", e.to_string())
            }
            TransferError::Version(_) => {
                ApiError::new(StatusCode::BAD_REQUEST, "bad_version", e.to_string())
            }
            TransferError::Unreadable => ApiError::new(
                StatusCode::INTERNAL_SERVER_ERROR,
                "unreadable",
                e.to_string(),
            ),
        }
    }
}

pub async fn export(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(tenant_id): Path<String>,
) -> Result<Json<TenantExport>, ApiError> {
    authorize(&state, &headers, &tenant_id)?;
    Ok(Json(
        transfer::export(&state.db, &state.vault, &tenant_id).await?,
    ))
}

pub async fn import(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path(tenant_id): Path<String>,
    Json(data): Json<TenantExport>,
) -> Result<StatusCode, ApiError> {
    authorize(&state, &headers, &tenant_id)?;
    transfer::import(&state.db, &state.vault, &tenant_id, data).await?;
    Ok(StatusCode::NO_CONTENT)
}
