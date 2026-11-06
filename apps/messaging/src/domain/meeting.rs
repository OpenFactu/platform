//! Reuniones: lo que se pide al programarlas o reprogramarlas, validado y
//! normalizado antes de llamar al proveedor o tocar la base de datos.

use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::{clean, DomainError};

const MAX_TITLE: usize = 200;
const MAX_URL: usize = 2048;
const MAX_SUMMARY: usize = 1000;
/// Una reunión no dura más de un día.
const MAX_LENGTH_HOURS: i64 = 24;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingInput {
    pub title: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    /// 'link' de momento; el resto de proveedores, cuando existan.
    pub provider: String,
    #[serde(default)]
    pub join_url: Option<String>,
    /// Texto que verá quien solo recibe texto (un cliente por Telegram). Lo
    /// redacta la web en el idioma de quien la programa.
    #[serde(default)]
    pub summary: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidMeeting {
    pub title: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub provider: String,
    pub join_url: Option<String>,
    pub summary: Option<String>,
}

/// Foto de la reunión que va en el payload de su mensaje: con ella la web pinta
/// la tarjeta sin pedir nada más.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingSnapshot {
    pub meeting_id: Uuid,
    pub title: String,
    pub starts_at: DateTime<Utc>,
    pub ends_at: DateTime<Utc>,
    pub provider: String,
    pub join_url: Option<String>,
    pub organizer_id: String,
    pub cancelled: bool,
}

pub fn validate(input: MeetingInput, now: DateTime<Utc>) -> Result<ValidMeeting, DomainError> {
    let title = input.title.trim().to_string();
    if title.is_empty() || title.chars().count() > MAX_TITLE {
        return Err(DomainError::InvalidMeeting("title"));
    }
    if input.ends_at <= input.starts_at
        || input.ends_at - input.starts_at > Duration::hours(MAX_LENGTH_HOURS)
    {
        return Err(DomainError::InvalidMeeting("time"));
    }
    // Un margen para el reloj del navegador: lo que ya ha terminado no se programa.
    if input.ends_at < now - Duration::minutes(5) {
        return Err(DomainError::InvalidMeeting("past"));
    }
    let join_url = clean(input.join_url);
    if let Some(url) = &join_url {
        let web = url.starts_with("https://") || url.starts_with("http://");
        if !web || url.len() > MAX_URL || url.chars().any(char::is_whitespace) {
            return Err(DomainError::InvalidMeeting("url"));
        }
    }
    let summary = clean(input.summary);
    if summary
        .as_ref()
        .is_some_and(|s| s.chars().count() > MAX_SUMMARY)
    {
        return Err(DomainError::InvalidMeeting("summary"));
    }
    Ok(ValidMeeting {
        title,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        provider: input.provider.trim().to_string(),
        join_url,
        summary,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn now() -> DateTime<Utc> {
        "2026-11-02T09:00:00Z".parse().unwrap()
    }

    fn input(title: &str, starts: &str, ends: &str, url: Option<&str>) -> MeetingInput {
        MeetingInput {
            title: title.into(),
            starts_at: starts.parse().unwrap(),
            ends_at: ends.parse().unwrap(),
            provider: " link ".into(),
            join_url: url.map(str::to_string),
            summary: None,
        }
    }

    #[test]
    fn reunion_valida_y_normalizada() {
        let m = validate(
            input(
                "  Repaso  ",
                "2026-11-02T10:00:00Z",
                "2026-11-02T10:30:00Z",
                Some(" https://meet.google.com/abc-defg-hij "),
            ),
            now(),
        )
        .unwrap();
        assert_eq!(m.title, "Repaso");
        assert_eq!(m.provider, "link");
        assert_eq!(
            m.join_url.as_deref(),
            Some("https://meet.google.com/abc-defg-hij")
        );
    }

    #[test]
    fn sin_titulo_no_vale() {
        let e = validate(
            input(" ", "2026-11-02T10:00:00Z", "2026-11-02T11:00:00Z", None),
            now(),
        );
        assert_eq!(e.unwrap_err(), DomainError::InvalidMeeting("title"));
    }

    #[test]
    fn el_fin_va_despues_del_inicio_y_no_mas_de_un_dia() {
        let al_reves = validate(
            input("x", "2026-11-02T11:00:00Z", "2026-11-02T10:00:00Z", None),
            now(),
        );
        assert_eq!(al_reves.unwrap_err(), DomainError::InvalidMeeting("time"));
        let larga = validate(
            input("x", "2026-11-02T10:00:00Z", "2026-11-03T10:01:00Z", None),
            now(),
        );
        assert_eq!(larga.unwrap_err(), DomainError::InvalidMeeting("time"));
    }

    #[test]
    fn lo_que_ya_paso_no_se_programa() {
        let e = validate(
            input("x", "2026-11-01T10:00:00Z", "2026-11-01T11:00:00Z", None),
            now(),
        );
        assert_eq!(e.unwrap_err(), DomainError::InvalidMeeting("past"));
    }

    #[test]
    fn solo_enlaces_web() {
        for url in [
            "javascript:alert(1)",
            "meet.google.com/abc",
            "https://a b.com",
        ] {
            let e = validate(
                input(
                    "x",
                    "2026-11-02T10:00:00Z",
                    "2026-11-02T11:00:00Z",
                    Some(url),
                ),
                now(),
            );
            assert_eq!(e.unwrap_err(), DomainError::InvalidMeeting("url"), "{url}");
        }
    }
}
