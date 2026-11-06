//! Tickets de acceso.
//!
//! Este servicio no conoce contraseñas, permisos ni flags: eso lo decide el ERP,
//! que emite un JWT corto (`POST /api/messaging/ticket`) firmado con
//! `MESSAGING_TICKET_SECRET`. Aquí solo se verifica. El `JWT_SECRET` de las
//! sesiones del ERP nunca llega a este proceso.

use axum::extract::FromRequestParts;
use axum::http::header::AUTHORIZATION;
use axum::http::request::Parts;
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use serde::Deserialize;

use crate::error::ApiError;
use crate::state::AppState;

pub const AUDIENCE: &str = "keirost-messaging";
pub const ISSUER: &str = "keirost-erp";
/// Tokens de servicio del ERP para `/internal` (no valen como ticket de usuario).
pub const SERVICE_AUDIENCE: &str = "keirost-messaging-internal";

/// Lo que este servicio usa del ticket. `aud` e `iss` también vienen, pero los
/// comprueba `jsonwebtoken` sobre el JSON crudo y no hace falta leerlos aquí.
#[derive(Debug, Deserialize)]
pub struct TicketClaims {
    pub sub: String,
    pub tid: String,
    /// Cómo se llama: lo que ven los demás en una llamada.
    #[serde(default)]
    pub name: String,
    pub exp: u64,
    pub perms: TicketPerms,
}

#[derive(Debug, Deserialize)]
struct ServiceClaims {
    tid: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
pub struct TicketPerms {
    pub read: bool,
    pub write: bool,
    /// Puede ver y atender las conversaciones con clientes.
    #[serde(default)]
    pub customers: bool,
    /// Puede conectar y desconectar los canales de la empresa (administrador).
    #[serde(default)]
    pub manage: bool,
    /// Puede hacer y recibir videollamadas.
    #[serde(default)]
    pub calls: bool,
}

/// Quién está al otro lado de una petición o de un socket.
#[derive(Debug, Clone)]
pub struct Session {
    pub user_id: String,
    pub tenant_id: String,
    pub name: String,
    pub can_write: bool,
    pub customers: bool,
    pub manage: bool,
    pub calls: bool,
    /// Segundos Unix en los que caduca el ticket.
    pub expires_at: u64,
}

#[derive(Debug, PartialEq, Eq, thiserror::Error)]
pub enum AuthError {
    #[error("Falta el ticket")]
    Missing,
    #[error("El ticket ha caducado")]
    Expired,
    #[error("Ticket no válido")]
    Invalid,
}

impl AuthError {
    pub fn code(&self) -> &'static str {
        match self {
            AuthError::Missing => "ticket_missing",
            AuthError::Expired => "ticket_expired",
            AuthError::Invalid => "ticket_invalid",
        }
    }
}

#[derive(Clone)]
pub struct TicketVerifier {
    key: DecodingKey,
    validation: Validation,
    service_validation: Validation,
}

impl TicketVerifier {
    pub fn new(secret: &str) -> Self {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.set_audience(&[AUDIENCE]);
        validation.set_issuer(&[ISSUER]);
        validation.set_required_spec_claims(&["exp", "aud", "iss", "sub"]);
        validation.leeway = 30;
        let mut service_validation = Validation::new(Algorithm::HS256);
        service_validation.set_audience(&[SERVICE_AUDIENCE]);
        service_validation.set_issuer(&[ISSUER]);
        service_validation.set_required_spec_claims(&["exp", "aud", "iss"]);
        service_validation.leeway = 30;
        Self {
            key: DecodingKey::from_secret(secret.as_bytes()),
            validation,
            service_validation,
        }
    }

    /// Un token de servicio del ERP: devuelve la empresa para la que vale.
    pub fn verify_service(&self, token: &str) -> Result<String, AuthError> {
        let data = decode::<ServiceClaims>(token, &self.key, &self.service_validation)
            .map_err(|_| AuthError::Invalid)?;
        if data.claims.tid.is_empty() {
            return Err(AuthError::Invalid);
        }
        Ok(data.claims.tid)
    }

    pub fn verify(&self, token: &str) -> Result<Session, AuthError> {
        use jsonwebtoken::errors::ErrorKind;

        let data =
            decode::<TicketClaims>(token, &self.key, &self.validation).map_err(|e| {
                match e.kind() {
                    ErrorKind::ExpiredSignature => AuthError::Expired,
                    _ => AuthError::Invalid,
                }
            })?;
        let c = data.claims;
        // Un ticket sin lectura no debería existir: el ERP no lo emite.
        if c.sub.is_empty() || c.tid.is_empty() || !c.perms.read {
            return Err(AuthError::Invalid);
        }
        Ok(Session {
            user_id: c.sub,
            tenant_id: c.tid,
            name: c.name,
            can_write: c.perms.write,
            customers: c.perms.customers,
            manage: c.perms.manage,
            calls: c.perms.calls,
            expires_at: c.exp,
        })
    }
}

impl Session {
    pub fn require_manage(&self) -> Result<(), ApiError> {
        if self.manage {
            Ok(())
        } else {
            Err(ApiError::forbidden(
                "manage_required",
                "Solo un administrador puede conectar canales",
            ))
        }
    }

    pub fn require_calls(&self) -> Result<(), ApiError> {
        if self.calls {
            Ok(())
        } else {
            Err(ApiError::forbidden(
                "calls_required",
                "No tienes permiso para videollamadas",
            ))
        }
    }

    pub fn require_customers(&self) -> Result<(), ApiError> {
        if self.customers {
            Ok(())
        } else {
            Err(ApiError::forbidden(
                "customers_required",
                "No tienes permiso para atender a clientes",
            ))
        }
    }

    pub fn require_write(&self) -> Result<(), ApiError> {
        if self.can_write {
            Ok(())
        } else {
            Err(ApiError::forbidden(
                "read_only",
                "Tu usuario solo tiene permiso de lectura en Mensajes",
            ))
        }
    }
}

impl FromRequestParts<AppState> for Session {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, ApiError> {
        let token = parts
            .headers
            .get(AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(AuthError::Missing)?;
        Ok(state.tickets.verify(token.trim())?)
    }
}

#[cfg(test)]
pub mod tests {
    use super::*;
    use jsonwebtoken::{encode, EncodingKey, Header};

    const SECRET: &str = "secreto-de-prueba";

    pub fn now() -> u64 {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
    }

    pub fn ticket(secret: &str, aud: &str, exp: u64, write: bool) -> String {
        let claims = serde_json::json!({
            "sub": "u1",
            "tid": "t1",
            "name": "Ana",
            "aud": aud,
            "iss": ISSUER,
            "iat": now(),
            "exp": exp,
            "perms": { "read": true, "write": write },
        });
        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(secret.as_bytes()),
        )
        .unwrap()
    }

    #[test]
    fn acepta_un_ticket_valido() {
        let v = TicketVerifier::new(SECRET);
        let s = v
            .verify(&ticket(SECRET, AUDIENCE, now() + 600, true))
            .unwrap();
        assert_eq!(s.user_id, "u1");
        assert_eq!(s.tenant_id, "t1");
        assert!(s.can_write);
    }

    #[test]
    fn rechaza_un_ticket_caducado() {
        let v = TicketVerifier::new(SECRET);
        let r = v.verify(&ticket(SECRET, AUDIENCE, now() - 3600, true));
        assert_eq!(r.unwrap_err(), AuthError::Expired);
    }

    #[test]
    fn rechaza_otra_audiencia() {
        let v = TicketVerifier::new(SECRET);
        let r = v.verify(&ticket(SECRET, "otro-servicio", now() + 600, true));
        assert_eq!(r.unwrap_err(), AuthError::Invalid);
    }

    #[test]
    fn rechaza_una_firma_ajena() {
        let v = TicketVerifier::new(SECRET);
        let r = v.verify(&ticket("otro-secreto", AUDIENCE, now() + 600, true));
        assert_eq!(r.unwrap_err(), AuthError::Invalid);
    }

    #[test]
    fn un_ticket_de_lectura_no_escribe() {
        let v = TicketVerifier::new(SECRET);
        let s = v
            .verify(&ticket(SECRET, AUDIENCE, now() + 600, false))
            .unwrap();
        assert!(s.require_write().is_err());
    }
}
