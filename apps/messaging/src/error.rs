//! Errores de la API: siempre `{ error, code }`. La web traduce por `code`
//! (`messaging.errors.<code>`); `error` es solo el detalle para los logs.

use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::json;

use crate::auth::AuthError;
use crate::domain::DomainError;

#[derive(Debug)]
pub struct ApiError {
    status: StatusCode,
    code: &'static str,
    message: String,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &'static str, message: impl Into<String>) -> Self {
        Self {
            status,
            code,
            message: message.into(),
        }
    }

    pub fn forbidden(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::FORBIDDEN, code, message)
    }

    pub fn not_found(code: &'static str, message: impl Into<String>) -> Self {
        Self::new(StatusCode::NOT_FOUND, code, message)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (
            self.status,
            Json(json!({ "error": self.message, "code": self.code })),
        )
            .into_response()
    }
}

impl From<AuthError> for ApiError {
    fn from(e: AuthError) -> Self {
        Self::new(StatusCode::UNAUTHORIZED, e.code(), e.to_string())
    }
}

impl From<DomainError> for ApiError {
    fn from(e: DomainError) -> Self {
        let status = match e {
            DomainError::OnlyOwnerCanRemove | DomainError::OnlyAuthor => StatusCode::FORBIDDEN,
            _ => StatusCode::BAD_REQUEST,
        };
        Self::new(status, e.code(), e.to_string())
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        tracing::error!(error = %e, "Error de base de datos");
        Self::new(
            StatusCode::INTERNAL_SERVER_ERROR,
            "internal",
            "Error interno del servicio de mensajería",
        )
    }
}
