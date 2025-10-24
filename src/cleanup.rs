use crate::config::Config;
use crate::database::Database;
use crate::services::FileService;
use std::time::Duration;
use tokio::time;

/// Background task to cleanup expired files
pub async fn start_cleanup_task(config: Config) -> anyhow::Result<()> {
    let db = Database::new(&config.database_url).await?;
    let service = FileService::new(config.clone(), db);

    // Run cleanup every hour
    let mut interval = time::interval(Duration::from_secs(3600));

    tracing::info!("🧹 Starting cleanup task (runs every hour)");

    loop {
        interval.tick().await;

        match service.cleanup_expired().await {
            Ok(count) => {
                if count > 0 {
                    tracing::info!("🗑️  Cleaned up {} expired files", count);
                }
            }
            Err(e) => {
                tracing::error!("❌ Cleanup task failed: {}", e);
            }
        }
    }
}
