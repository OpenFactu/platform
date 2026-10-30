//! Conversaciones: directas (dos personas, inmutables) y grupos.

use serde::{Deserialize, Serialize};

use super::{clean, DomainError};

pub const MAX_PARTICIPANTS: usize = 256;
pub const MAX_TITLE_CHARS: usize = 120;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ConversationKind {
    Direct,
    Group,
}

impl ConversationKind {
    pub fn as_str(self) -> &'static str {
        match self {
            ConversationKind::Direct => "direct",
            ConversationKind::Group => "group",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "direct" => Some(ConversationKind::Direct),
            "group" => Some(ConversationKind::Group),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Role {
    Owner,
    Member,
}

impl Role {
    pub fn parse(s: &str) -> Self {
        if s == "owner" {
            Role::Owner
        } else {
            Role::Member
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NewConversationInput {
    pub kind: ConversationKind,
    pub participant_ids: Vec<String>,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct ValidConversation {
    pub kind: ConversationKind,
    /// Los demás participantes, sin el creador y sin repetidos.
    pub others: Vec<String>,
    pub title: Option<String>,
    pub direct_key: Option<String>,
}

/// Clave de una conversación directa: la misma sea quien sea el que la abre.
pub fn direct_key(a: &str, b: &str) -> String {
    if a <= b {
        format!("{a}:{b}")
    } else {
        format!("{b}:{a}")
    }
}

pub fn validate_new(
    creator: &str,
    input: NewConversationInput,
) -> Result<ValidConversation, DomainError> {
    let others = dedupe(input.participant_ids, Some(creator));
    let title = clean(input.title);
    if title
        .as_ref()
        .is_some_and(|t| t.chars().count() > MAX_TITLE_CHARS)
    {
        return Err(DomainError::TitleTooLong);
    }

    match input.kind {
        ConversationKind::Direct => {
            if others.len() != 1 {
                return Err(DomainError::DirectNeedsOnePeer);
            }
            if title.is_some() {
                return Err(DomainError::DirectHasNoTitle);
            }
            let key = direct_key(creator, &others[0]);
            Ok(ValidConversation {
                kind: ConversationKind::Direct,
                others,
                title: None,
                direct_key: Some(key),
            })
        }
        ConversationKind::Group => {
            if others.is_empty() {
                return Err(DomainError::GroupNeedsPeers);
            }
            if others.len() + 1 > MAX_PARTICIPANTS {
                return Err(DomainError::TooManyParticipants);
            }
            Ok(ValidConversation {
                kind: ConversationKind::Group,
                others,
                title,
                direct_key: None,
            })
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConversationPatch {
    /// `Some("")` quita el título.
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub add_user_ids: Vec<String>,
    #[serde(default)]
    pub remove_user_ids: Vec<String>,
}

#[derive(Debug, Default, Clone, PartialEq)]
pub struct ValidPatch {
    /// `Some(None)` quita el título; `None` no lo toca.
    pub title: Option<Option<String>>,
    pub add: Vec<String>,
    pub remove: Vec<String>,
}

pub fn validate_patch(
    kind: ConversationKind,
    actor: &str,
    actor_role: Role,
    current_count: usize,
    patch: ConversationPatch,
) -> Result<ValidPatch, DomainError> {
    if kind == ConversationKind::Direct {
        return Err(DomainError::DirectIsImmutable);
    }

    let title = match patch.title {
        None => None,
        Some(t) => {
            let t = clean(Some(t));
            if t.as_ref()
                .is_some_and(|t| t.chars().count() > MAX_TITLE_CHARS)
            {
                return Err(DomainError::TitleTooLong);
            }
            Some(t)
        }
    };

    let remove = dedupe(patch.remove_user_ids, None);
    // Salir uno mismo siempre se puede; echar a otros, solo el propietario.
    if remove.iter().any(|u| u != actor) && actor_role != Role::Owner {
        return Err(DomainError::OnlyOwnerCanRemove);
    }

    let add: Vec<String> = dedupe(patch.add_user_ids, None)
        .into_iter()
        .filter(|u| !remove.contains(u))
        .collect();
    if current_count + add.len() > MAX_PARTICIPANTS {
        return Err(DomainError::TooManyParticipants);
    }

    Ok(ValidPatch { title, add, remove })
}

fn dedupe(ids: Vec<String>, exclude: Option<&str>) -> Vec<String> {
    let mut out: Vec<String> = Vec::with_capacity(ids.len());
    for id in ids {
        let id = id.trim().to_string();
        if id.is_empty() || Some(id.as_str()) == exclude || out.contains(&id) {
            continue;
        }
        out.push(id);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn new(kind: ConversationKind, ids: &[&str], title: Option<&str>) -> NewConversationInput {
        NewConversationInput {
            kind,
            participant_ids: ids.iter().map(|s| s.to_string()).collect(),
            title: title.map(str::to_string),
        }
    }

    #[test]
    fn la_clave_directa_no_depende_del_orden() {
        assert_eq!(direct_key("b", "a"), direct_key("a", "b"));
    }

    #[test]
    fn directa_con_una_persona() {
        let c = validate_new(
            "yo",
            new(ConversationKind::Direct, &["tu", "yo", "tu"], None),
        )
        .unwrap();
        assert_eq!(c.others, vec!["tu"]);
        assert_eq!(c.direct_key.as_deref(), Some("tu:yo"));
    }

    #[test]
    fn directa_consigo_mismo_no_vale() {
        let e = validate_new("yo", new(ConversationKind::Direct, &["yo"], None)).unwrap_err();
        assert_eq!(e, DomainError::DirectNeedsOnePeer);
    }

    #[test]
    fn directa_sin_titulo() {
        let e = validate_new("yo", new(ConversationKind::Direct, &["tu"], Some("x"))).unwrap_err();
        assert_eq!(e, DomainError::DirectHasNoTitle);
    }

    #[test]
    fn grupo_necesita_a_alguien() {
        let e = validate_new("yo", new(ConversationKind::Group, &[" "], None)).unwrap_err();
        assert_eq!(e, DomainError::GroupNeedsPeers);
    }

    #[test]
    fn grupo_con_titulo() {
        let c = validate_new(
            "yo",
            new(ConversationKind::Group, &["a", "b"], Some(" Ventas ")),
        )
        .unwrap();
        assert_eq!(c.title.as_deref(), Some("Ventas"));
        assert!(c.direct_key.is_none());
    }

    #[test]
    fn una_directa_no_se_toca() {
        let e = validate_patch(
            ConversationKind::Direct,
            "yo",
            Role::Owner,
            2,
            ConversationPatch::default(),
        )
        .unwrap_err();
        assert_eq!(e, DomainError::DirectIsImmutable);
    }

    #[test]
    fn un_miembro_puede_salir_pero_no_echar() {
        let salir = ConversationPatch {
            remove_user_ids: vec!["yo".into()],
            ..Default::default()
        };
        assert!(validate_patch(ConversationKind::Group, "yo", Role::Member, 3, salir).is_ok());

        let echar = ConversationPatch {
            remove_user_ids: vec!["otro".into()],
            ..Default::default()
        };
        assert_eq!(
            validate_patch(ConversationKind::Group, "yo", Role::Member, 3, echar).unwrap_err(),
            DomainError::OnlyOwnerCanRemove
        );
    }

    #[test]
    fn titulo_vacio_lo_quita() {
        let p = ConversationPatch {
            title: Some("  ".into()),
            ..Default::default()
        };
        let v = validate_patch(ConversationKind::Group, "yo", Role::Owner, 3, p).unwrap();
        assert_eq!(v.title, Some(None));
    }
}
