//! Conexiones abiertas y difusión de eventos.
//!
//! En memoria y para una sola réplica. Lo que el resto del servicio usa es el
//! trait `Broadcaster`: para repartir entre varias réplicas basta con otra
//! implementación (Postgres `LISTEN/NOTIFY`) sin tocar los handlers.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

use axum::extract::ws::Utf8Bytes;
use tokio::sync::mpsc;

use crate::ws::protocol::ServerEvent;

/// Eventos pendientes por conexión. Si un cliente lento llena la cola, se
/// descartan eventos suyos antes que dejar crecer la memoria: al reconectar
/// vuelve a pedir el estado.
const QUEUE: usize = 512;

pub trait Broadcaster: Send + Sync {
    /// Envía el evento a todas las conexiones de esos usuarios de la empresa.
    fn publish(&self, tenant_id: &str, user_ids: &[String], event: &ServerEvent);
}

type Conns = HashMap<u64, mpsc::Sender<Utf8Bytes>>;

#[derive(Default)]
pub struct Hub {
    next_id: AtomicU64,
    /// empresa → usuario → conexión → cola
    tenants: Mutex<HashMap<String, HashMap<String, Conns>>>,
}

pub struct Registration {
    pub id: u64,
    pub rx: mpsc::Receiver<Utf8Bytes>,
    /// Era su primera conexión: acaba de pasar a "en línea".
    pub came_online: bool,
}

impl Hub {
    pub fn register(&self, tenant_id: &str, user_id: &str) -> Registration {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::channel(QUEUE);
        let mut tenants = self.tenants.lock().expect("hub envenenado");
        let conns = tenants
            .entry(tenant_id.to_string())
            .or_default()
            .entry(user_id.to_string())
            .or_default();
        let came_online = conns.is_empty();
        conns.insert(id, tx);
        Registration {
            id,
            rx,
            came_online,
        }
    }

    /// Quita la conexión. Devuelve `true` si era la última de ese usuario.
    pub fn unregister(&self, tenant_id: &str, user_id: &str, id: u64) -> bool {
        let mut tenants = self.tenants.lock().expect("hub envenenado");
        let Some(users) = tenants.get_mut(tenant_id) else {
            return false;
        };
        let Some(conns) = users.get_mut(user_id) else {
            return false;
        };
        conns.remove(&id);
        if !conns.is_empty() {
            return false;
        }
        users.remove(user_id);
        if users.is_empty() {
            tenants.remove(tenant_id);
        }
        true
    }

    pub fn online_users(&self, tenant_id: &str) -> Vec<String> {
        let tenants = self.tenants.lock().expect("hub envenenado");
        tenants
            .get(tenant_id)
            .map(|users| users.keys().cloned().collect())
            .unwrap_or_default()
    }

    /// A todos los conectados de la empresa (presencia).
    pub fn publish_tenant(&self, tenant_id: &str, event: &ServerEvent) {
        let users = self.online_users(tenant_id);
        self.publish(tenant_id, &users, event);
    }
}

impl Broadcaster for Hub {
    fn publish(&self, tenant_id: &str, user_ids: &[String], event: &ServerEvent) {
        let text: Utf8Bytes = match serde_json::to_string(event) {
            Ok(s) => s.into(),
            Err(e) => {
                tracing::error!(error = %e, "No se pudo serializar un evento");
                return;
            }
        };
        let tenants = self.tenants.lock().expect("hub envenenado");
        let Some(users) = tenants.get(tenant_id) else {
            return;
        };
        for user in user_ids {
            for tx in users.get(user).into_iter().flat_map(|c| c.values()) {
                if tx.try_send(text.clone()).is_err() {
                    tracing::warn!(tenant_id, user, "Cola llena: evento descartado");
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn presencia_por_primera_y_ultima_conexion() {
        let hub = Hub::default();
        let a = hub.register("t1", "u1");
        let b = hub.register("t1", "u1");
        assert!(a.came_online);
        assert!(!b.came_online);
        assert!(!hub.unregister("t1", "u1", a.id));
        assert!(hub.unregister("t1", "u1", b.id));
        assert!(hub.online_users("t1").is_empty());
    }

    #[tokio::test]
    async fn solo_reciben_los_usuarios_de_esa_empresa() {
        let hub = Hub::default();
        let mut mio = hub.register("t1", "u1");
        let mut ajeno = hub.register("t2", "u1");
        hub.publish("t1", &["u1".to_string()], &ServerEvent::Pong);
        assert!(mio.rx.try_recv().is_ok());
        assert!(ajeno.rx.try_recv().is_err());
    }
}
