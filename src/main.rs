use axum::{
    routing::{get, post, delete},
    Router,
    response::{Html, IntoResponse},
    http::StatusCode,
    extract::DefaultBodyLimit,
};
use std::net::SocketAddr;
use tower_http::trace::TraceLayer;
use tower_http::services::ServeDir;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;
use tower_governor::{
    governor::GovernorConfigBuilder,
    GovernorLayer,
};

mod cleanup;
mod config;
mod constants;
mod database;
mod error;
mod handlers;
mod models;
mod services;

use config::Config;
use constants::{MAX_UPLOAD_SIZE, DOGBOX_EMOJI};
use database::Database;

async fn serve_index() -> impl IntoResponse {
    match tokio::fs::read_to_string("static/index.html").await {
        Ok(content) => Html(content).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load page").into_response(),
    }
}

async fn serve_download() -> impl IntoResponse {
    match tokio::fs::read_to_string("static/download.html").await {
        Ok(content) => Html(content).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load page").into_response(),
    }
}

async fn serve_faq() -> impl IntoResponse {
    match tokio::fs::read_to_string("static/faq.html").await {
        Ok(content) => Html(content).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load page").into_response(),
    }
}

async fn serve_post_types() -> impl IntoResponse {
    match tokio::fs::read_to_string("static/post-types.html").await {
        Ok(content) => Html(content).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load page").into_response(),
    }
}

async fn serve_stats() -> impl IntoResponse {
    match tokio::fs::read_to_string("static/stats.html").await {
        Ok(content) => Html(content).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load page").into_response(),
    }
}

async fn serve_prohibited_uploads() -> impl IntoResponse {
    match tokio::fs::read_to_string("static/prohibited-uploads.html").await {
        Ok(content) => Html(content).into_response(),
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "Failed to load page").into_response(),
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "dogbox=debug,tower_http=debug,axum=trace".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    dotenvy::dotenv().ok();
    let config = Config::from_env()?;

    // Initialize database
    let db = Database::new(&config.database_url).await?;
    db.migrate().await?;

    // Create upload directory
    tokio::fs::create_dir_all(&config.upload_dir).await?;

    // Store port before moving config
    let port = config.port;

    // Clone config for cleanup task
    let cleanup_config = config.clone();

    // Build application state
    let app_state = std::sync::Arc::new(config);

    // Start background cleanup task
    tokio::spawn(async move {
        if let Err(e) = cleanup::start_cleanup_task(cleanup_config).await {
            tracing::error!("Cleanup task failed: {}", e);
        }
    });

    // SECURITY: Rate limiting - 100 requests per minute per IP
    let rate_limit_config = GovernorConfigBuilder::default()
        .per_second(2) // 2 requests per second
        .burst_size(10) // Allow burst of 10
        .finish()
        .ok_or_else(|| anyhow::anyhow!("Failed to build rate limit config"))?;

    let rate_limit_layer = GovernorLayer {
        config: std::sync::Arc::new(rate_limit_config),
    };

    // Build router
    let app = Router::new()
        // Frontend routes
        .route("/", get(serve_index))
        .route("/f/:id", get(serve_download))
        .route("/faq", get(serve_faq))
        .route("/post-types", get(serve_post_types))
        .route("/prohibited-uploads", get(serve_prohibited_uploads))
        .route("/stats", get(serve_stats))
        // API routes
        .route("/api/health", get(handlers::health))
        .route("/api/admin-motd", get(handlers::admin_motd))
        .route("/api/stats", get(handlers::stats))
        .route("/api/upload", post(handlers::upload))
        .route("/api/files/:id", get(handlers::download))
        .route("/api/files/:id", delete(handlers::delete_file))
        .route("/api/posts/:id", get(handlers::view_post))
        .route("/api/posts/:id/append", post(handlers::append_to_post))
        // Static files
        .nest_service("/static", ServeDir::new("static"))
        // API docs
        .merge(SwaggerUi::new("/docs").url("/api-docs/openapi.json", handlers::ApiDoc::openapi()))
        .layer(DefaultBodyLimit::max(MAX_UPLOAD_SIZE))
        .layer(TraceLayer::new_for_http())
        .layer(rate_limit_layer)
        .with_state(app_state);

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("{} dogbox.moe listening on {}", DOGBOX_EMOJI, addr);
    tracing::info!("📖 API docs available at http://{}/docs", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
