use crate::config::Config;
use crate::constants::CLEANUP_INTERVAL_SECS;
use crate::database::Database;
use crate::services::FileService;
use std::time::Duration;
use tokio::time;

/// Background task to cleanup expired files
pub async fn start_cleanup_task(config: Config) -> anyhow::Result<()> {
    let db = Database::new(&config.database_url).await?;
    let service = FileService::new(config.clone(), db.clone());

    // Run cleanup every hour
    let mut interval = time::interval(Duration::from_secs(CLEANUP_INTERVAL_SECS));

    // For test mode: track 24hr cycles
    let mut test_mode_interval = if config.test_delete_24hr {
        Some(time::interval(Duration::from_secs(86400))) // 24 hours
    } else {
        None
    };

    if config.test_delete_24hr {
        tracing::warn!("🧪 TEST MODE: All data will be deleted every 24 hours");
    }

    tracing::info!("🧹 Starting cleanup task (runs every hour)");

    loop {
        tokio::select! {
            _ = interval.tick() => {
                // Regular hourly cleanup of expired files
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
            _ = async {
                if let Some(ref mut interval) = test_mode_interval {
                    interval.tick().await;
                } else {
                    std::future::pending().await
                }
            } => {
                // Test mode: truncate all tables every 24hr
                tracing::warn!("🧪 TEST MODE: Performing 24-hour data wipe");
                match db.truncate_all_tables().await {
                    Ok(_) => {
                        // Also delete uploaded files
                        if let Err(e) = tokio::fs::remove_dir_all(&config.upload_dir).await {
                            tracing::error!("❌ Failed to delete upload directory: {}", e);
                        }
                        if let Err(e) = tokio::fs::create_dir_all(&config.upload_dir).await {
                            tracing::error!("❌ Failed to recreate upload directory: {}", e);
                        }
                        tracing::warn!("🧪 TEST MODE: All data wiped successfully");
                    }
                    Err(e) => {
                        tracing::error!("❌ Test mode truncation failed: {}", e);
                    }
                }
            }
        }
    }
}
