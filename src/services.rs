use crate::config::Config;
use crate::constants::MAX_UPLOAD_SIZE;
use crate::database::Database;
use crate::error::{AppError, Result};
use crate::models::{FileRecord, PostType, PostContentView, PostViewResponse};
use blake3;
use chrono::{Duration, Utc};
use std::path::PathBuf;
use tokio::fs;
use tokio::io::AsyncWriteExt;

pub struct FileService {
    config: Config,
    db: Database,
}

impl FileService {
    pub fn new(config: Config, db: Database) -> Self {
        Self { config, db }
    }

    /// Store encrypted file blob and return metadata
    /// Important: This function has no knowledge of the encryption key
    pub async fn store_file(
        &self,
        data: Vec<u8>,
        filename_encrypted: Option<String>,
        mime_type: Option<String>,
        expiry_hours: Option<i64>,
        post_type: PostType,
        is_permanent: bool,
    ) -> Result<FileRecord> {
        // Validate size against constant (1 GB)
        if data.len() > MAX_UPLOAD_SIZE {
            return Err(AppError::FileTooLarge {
                max_mb: (MAX_UPLOAD_SIZE / (1024 * 1024)) as u64,
            });
        }

        // Calculate BLAKE3 hash for deduplication
        let hash = blake3::hash(&data);
        let blake3_hash = hash.to_hex().to_string();

        // Check for existing file with same hash (deduplication)
        if let Some(existing) = self.db.find_by_hash(&blake3_hash).await? {
            tracing::info!("Deduplicated upload: using existing file {}", existing.id);
            return Ok(existing);
        }

        // Calculate expiration (or set far future if permanent)
        let expires_at = if is_permanent {
            Utc::now() + Duration::days(36500) // ~100 years
        } else {
            let expiry_hours = expiry_hours
                .unwrap_or(self.config.default_expiry_hours)
                .min(self.config.max_expiry_hours);
            Utc::now() + Duration::hours(expiry_hours)
        };

        // Generate storage path (UUID-based to avoid collisions)
        let file_id = uuid::Uuid::new_v4().to_string();
        let storage_path = if post_type == PostType::Post {
            // Posts store content in database, not on disk
            format!("post:{}", file_id)
        } else {
            PathBuf::from(&self.config.upload_dir).join(&file_id).to_string_lossy().to_string()
        };

        // Write encrypted blob to disk (for files only)
        if post_type == PostType::File {
            let mut file = fs::File::create(&storage_path).await?;
            file.write_all(&data).await?;
            file.sync_all().await?;
        }

        // Create database record
        let file_record = FileRecord::new(
            filename_encrypted,
            data.len() as i64,
            mime_type,
            expires_at,
            storage_path,
            blake3_hash,
            post_type,
            is_permanent,
        );

        self.db.create_file(&file_record).await?;

        // For posts, store initial content if provided
        if post_type == PostType::Post && !data.is_empty() {
            let content_encrypted = String::from_utf8_lossy(&data).to_string();
            self.db.add_post_content(&file_record.id, &content_encrypted, 0).await?;
        }

        tracing::info!(
            "Stored encrypted {} {} ({} bytes, {})",
            if is_permanent { "permanent" } else { "temporary" },
            post_type,
            file_record.size_bytes,
            if is_permanent { "never expires".to_string() } else { format!("expires {}", file_record.expires_at) }
        );

        Ok(file_record)
    }

    /// Retrieve encrypted file blob
    /// Important: Returns encrypted data; server cannot decrypt
    pub async fn retrieve_file(&self, file_id: &str) -> Result<(FileRecord, Vec<u8>)> {
        let file = self
            .db
            .get_file(file_id)
            .await?
            .ok_or(AppError::NotFound)?;

        let data = fs::read(&file.storage_path).await?;

        Ok((file, data))
    }

    /// Delete file with token verification
    pub async fn delete_file(&self, file_id: &str, deletion_token: &str) -> Result<bool> {
        // Get file metadata first
        let file = self
            .db
            .get_file(file_id)
            .await?
            .ok_or(AppError::NotFound)?;

        // Verify deletion token
        let deleted = self.db.delete_file(file_id, deletion_token).await?;

        if !deleted {
            return Err(AppError::InvalidDeletionToken);
        }

        // Securely delete file from disk
        if let Err(e) = fs::remove_file(&file.storage_path).await {
            tracing::error!("Failed to delete file from disk: {}", e);
        }

        tracing::info!("Deleted file {}", file_id);
        Ok(true)
    }

    /// Cleanup expired files (run periodically)
    pub async fn cleanup_expired(&self) -> Result<u64> {
        // Get expired file records
        let count = self.db.cleanup_expired().await?;

        if count > 0 {
            tracing::info!("Cleaned up {} expired files", count);
        }

        Ok(count)
    }

    /// View a post (with all appended content)
    pub async fn view_post(&self, post_id: &str) -> Result<PostViewResponse> {
        let file = self
            .db
            .get_file(post_id)
            .await?
            .ok_or(AppError::NotFound)?;

        // Increment view count
        self.db.increment_view_count(post_id).await?;

        let post_type = file.get_post_type();

        let content = if post_type == PostType::Post {
            let content_records = self.db.get_post_content(post_id).await?;
            content_records
                .into_iter()
                .map(|c| PostContentView {
                    content_encrypted: c.content_encrypted,
                    appended_at: c.appended_at,
                    order: c.content_order,
                })
                .collect()
        } else {
            vec![]
        };

        Ok(PostViewResponse {
            post_id: file.id,
            post_type,
            is_permanent: file.is_permanent,
            expires_at: if file.is_permanent { None } else { Some(file.expires_at) },
            uploaded_at: file.uploaded_at,
            view_count: file.view_count + 1, // +1 because we just incremented
            content,
        })
    }

    /// Append content to a post (requires append key)
    pub async fn append_to_post(
        &self,
        post_id: &str,
        append_key: &str,
        content_encrypted: String,
    ) -> Result<i64> {
        // Verify the post exists and append key is valid
        if !self.db.verify_append_key(post_id, append_key).await? {
            return Err(AppError::InvalidDeletionToken); // Reuse this error type
        }

        // Get next content order
        let order = self.db.get_next_content_order(post_id).await?;

        // Add content
        self.db.add_post_content(post_id, &content_encrypted, order).await?;

        tracing::info!("Appended content to post {} (order: {})", post_id, order);

        Ok(order)
    }
}
