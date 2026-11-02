//! Keirost Messaging: chat del equipo y canales de mensajería en tiempo real.
//!
//! Servicio aparte del ERP. Comparte su Postgres (esquema propio `messaging`) y
//! confía en los tickets que emite el ERP; ver `auth.rs`.

mod auth;
mod channels;
mod config;
mod crypto;
mod domain;
mod erp;
mod error;
mod http;
mod hub;
mod media;
mod meetings;
mod rtc;
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
    let (calls, notices) = rtc::Calls::start(&cfg.rtc).await;
    let state = state::AppState::new(db, &cfg, calls);
    rtc::Calls::run_background(&state, notices).await;
    state.vault.verify().await?;
    tokio::spawn(store::encryption::backfill(
        state.db.clone(),
        state.vault.clone(),
    ));
    state.telegram.start_all(&state).await;
    let app = http::router(state);

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
