//! Keirost Messaging: chat del equipo y canales de mensajería en tiempo real.
//!
//! Servicio aparte del ERP. Comparte su Postgres (esquema propio `messaging`) y
//! confía en los tickets que emite el ERP; ver `auth.rs`.

mod auth;
mod channels;
mod config;
mod domain;
mod error;
mod http;
mod hub;
mod meetings;
mod state;
mod store;
mod ws;

use std::net::SocketAddr;

use tokio::net::TcpListener;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_env("MESSAGING_LOG")
                .unwrap_or_else(|_| EnvFilter::new("keirost_messaging=info,tower_http=warn")),
        )
        .init();

    let cfg = config::Config::from_env()?;
    let db = store::connect(&cfg.database_url).await?;
    let app = http::router(state::AppState::new(db, &cfg.ticket_secret));

    let addr = SocketAddr::new(cfg.host, cfg.port);
    let listener = TcpListener::bind(addr).await?;
    tracing::info!(%addr, "Mensajería escuchando");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut s) = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = terminate => {},
    }
    tracing::info!("Parando la mensajería");
}
