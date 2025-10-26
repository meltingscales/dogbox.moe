use crate::error::Result;
use crate::models::{FileRecord, PostContent};
use chrono::{DateTime, Utc};
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use subtle::ConstantTimeEq;
use rand::Rng;

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        // Create database if it doesn't exist
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await?;

        Ok(Self { pool })
    }

    pub async fn migrate(&self) -> anyhow::Result<()> {
        // Note: Migrations are now handled by justfile to avoid double-execution
        // This function is kept for backward compatibility
        tracing::info!("Migration check complete (managed externally)");
        Ok(())
    }

    pub async fn create_file(&self, file: &FileRecord) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO files (
                id, filename_encrypted, size_bytes, mime_type,
                uploaded_at, expires_at, deletion_token, storage_path,
                blake3_hash, post_type, post_append_key, is_permanent, view_count, file_extension
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
            file.id,
            file.filename_encrypted,
            file.size_bytes,
            file.mime_type,
            file.uploaded_at,
            file.expires_at,
            file.deletion_token,
            file.storage_path,
            file.blake3_hash,
            file.post_type,
            file.post_append_key,
            file.is_permanent,
            file.view_count,
            file.file_extension,
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_file(&self, id: &str) -> Result<Option<FileRecord>> {
        let file = sqlx::query_as!(
            FileRecord,
            r#"
            SELECT id, filename_encrypted, size_bytes, mime_type,
                   uploaded_at as "uploaded_at: DateTime<Utc>",
                   expires_at as "expires_at: DateTime<Utc>",
                   deletion_token, storage_path, blake3_hash,
                   created_at as "created_at: DateTime<Utc>",
                   post_type, post_append_key,
                   is_permanent as "is_permanent: bool",
                   view_count,
                   file_extension
            FROM files
            WHERE id = ? AND (is_permanent = 1 OR expires_at > datetime('now'))
            "#,
            id
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(file)
    }

    pub async fn delete_file(&self, id: &str, deletion_token: &str) -> Result<bool> {
        // Fetch the file record to get the stored deletion token
        let file = sqlx::query!(
            r#"
            SELECT deletion_token
            FROM files
            WHERE id = ?
            "#,
            id
        )
        .fetch_optional(&self.pool)
        .await?;

        // Use a dummy token if file doesn't exist to prevent timing leak
        let stored_token = file.as_ref()
            .map(|f| f.deletion_token.as_str())
            .unwrap_or("00000000000000000000000000000000");

        // Constant-time comparison to prevent timing attacks
        let tokens_match = deletion_token.as_bytes().ct_eq(stored_token.as_bytes());

        // Add random delay (0-10ms) to prevent timing analysis
        let delay_ms = rand::thread_rng().gen_range(0..10);
        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;

        // Only delete if tokens match AND file exists
        if tokens_match.into() && file.is_some() {
            let result = sqlx::query!(
                r#"
                DELETE FROM files
                WHERE id = ?
                "#,
                id
            )
            .execute(&self.pool)
            .await?;

            Ok(result.rows_affected() > 0)
        } else {
            Ok(false)
        }
    }

    pub async fn cleanup_expired(&self) -> Result<u64> {
        let result = sqlx::query!(
            r#"
            DELETE FROM files
            WHERE is_permanent = 0 AND expires_at <= datetime('now')
            "#
        )
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected())
    }

    pub async fn find_by_hash(&self, blake3_hash: &str) -> Result<Option<FileRecord>> {
        let file = sqlx::query_as!(
            FileRecord,
            r#"
            SELECT id, filename_encrypted, size_bytes, mime_type,
                   uploaded_at as "uploaded_at: DateTime<Utc>",
                   expires_at as "expires_at: DateTime<Utc>",
                   deletion_token, storage_path, blake3_hash,
                   created_at as "created_at: DateTime<Utc>",
                   post_type, post_append_key,
                   is_permanent as "is_permanent: bool",
                   view_count,
                   file_extension
            FROM files
            WHERE blake3_hash = ? AND (is_permanent = 1 OR expires_at > datetime('now'))
            "#,
            blake3_hash
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(file)
    }

    pub async fn increment_view_count(&self, id: &str) -> Result<()> {
        sqlx::query!(
            r#"
            UPDATE files
            SET view_count = view_count + 1
            WHERE id = ?
            "#,
            id
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    // Post-specific methods
    pub async fn add_post_content(
        &self,
        file_id: &str,
        content_encrypted: &str,
        order: i64,
        content_type: &str,
        mime_type: Option<&str>,
        file_extension: Option<&str>,
        file_size: Option<i64>,
    ) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO posts_content (
                file_id, content_encrypted, content_order, content_type,
                mime_type, file_extension, file_size
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
            file_id,
            content_encrypted,
            order,
            content_type,
            mime_type,
            file_extension,
            file_size
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_post_content(&self, file_id: &str) -> Result<Vec<PostContent>> {
        let content = sqlx::query_as!(
            PostContent,
            r#"
            SELECT id as "id!", file_id, content_encrypted,
                   content_order as "content_order!",
                   appended_at as "appended_at: DateTime<Utc>",
                   content_type, mime_type, file_extension,
                   file_size as "file_size?"
            FROM posts_content
            WHERE file_id = ?
            ORDER BY content_order ASC
            "#,
            file_id
        )
        .fetch_all(&self.pool)
        .await?;

        Ok(content)
    }

    pub async fn get_next_content_order(&self, file_id: &str) -> Result<i64> {
        let result = sqlx::query!(
            r#"
            SELECT COALESCE(MAX(content_order), -1) + 1 as "next_order!"
            FROM posts_content
            WHERE file_id = ?
            "#,
            file_id
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(result.next_order as i64)
    }

    pub async fn verify_append_key(&self, file_id: &str, append_key: &str) -> Result<bool> {
        // SECURITY: Use constant-time comparison to prevent timing attacks
        // Fetch the post record to get the stored append key
        let post = sqlx::query!(
            r#"
            SELECT post_append_key
            FROM files
            WHERE id = ? AND post_type = 'post'
            "#,
            file_id
        )
        .fetch_optional(&self.pool)
        .await?;

        // Use a dummy key if post doesn't exist to prevent timing leak
        let stored_key = post.as_ref()
            .and_then(|p| p.post_append_key.as_ref())
            .map(|k| k.as_str())
            .unwrap_or("00000000000000000000000000000000");

        // Constant-time comparison to prevent timing attacks
        let keys_match = append_key.as_bytes().ct_eq(stored_key.as_bytes());

        // Add random delay (0-10ms) to prevent timing analysis
        let delay_ms = rand::thread_rng().gen_range(0..10);
        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;

        // Only return true if keys match AND post exists AND has an append key
        Ok(keys_match.into() && post.is_some() && post.unwrap().post_append_key.is_some())
    }

    pub async fn truncate_all_tables(&self) -> anyhow::Result<()> {
        // Delete all files and posts content (for test mode)
        sqlx::query!("DELETE FROM posts_content")
            .execute(&self.pool)
            .await?;

        sqlx::query!("DELETE FROM files")
            .execute(&self.pool)
            .await?;

        tracing::warn!("🧪 TEST MODE: All tables truncated");
        Ok(())
    }

    pub async fn get_stats(&self) -> Result<(i64, i64, i64, i64, i64, i64, i64)> {
        let total_result = sqlx::query!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM files
            WHERE is_permanent = 1 OR expires_at > datetime('now')
            "#
        )
        .fetch_one(&self.pool)
        .await?;

        let posts_result = sqlx::query!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM files
            WHERE post_type = 'post' AND (is_permanent = 1 OR expires_at > datetime('now'))
            "#
        )
        .fetch_one(&self.pool)
        .await?;

        let files_result = sqlx::query!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM files
            WHERE post_type = 'file' AND (is_permanent = 1 OR expires_at > datetime('now'))
            "#
        )
        .fetch_one(&self.pool)
        .await?;

        let permanent_result = sqlx::query!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM files
            WHERE is_permanent = 1
            "#
        )
        .fetch_one(&self.pool)
        .await?;

        let temporary_result = sqlx::query!(
            r#"
            SELECT COUNT(*) as "count!"
            FROM files
            WHERE is_permanent = 0 AND expires_at > datetime('now')
            "#
        )
        .fetch_one(&self.pool)
        .await?;

        let views_result = sqlx::query!(
            r#"
            SELECT COALESCE(SUM(view_count), 0) as "total_views!"
            FROM files
            WHERE is_permanent = 1 OR expires_at > datetime('now')
            "#
        )
        .fetch_one(&self.pool)
        .await?;

        let size_result = sqlx::query!(
            r#"
            SELECT COALESCE(SUM(size_bytes), 0) as "total_bytes!"
            FROM files
            WHERE is_permanent = 1 OR expires_at > datetime('now')
            "#
        )
        .fetch_one(&self.pool)
        .await?;

        Ok((
            total_result.count as i64,
            posts_result.count as i64,
            files_result.count as i64,
            permanent_result.count as i64,
            temporary_result.count as i64,
            views_result.total_views as i64,
            size_result.total_bytes as i64,
        ))
    }

    /// Get file extension statistics (count by extension)
    pub async fn get_file_extension_stats(&self) -> Result<std::collections::HashMap<String, i64>> {
        #[derive(sqlx::FromRow)]
        struct ExtensionCount {
            file_extension: Option<String>,
            count: i64,
        }

        let results = sqlx::query_as::<_, ExtensionCount>(
            r#"
            SELECT file_extension, COUNT(*) as count
            FROM files
            WHERE (is_permanent = 1 OR expires_at > datetime('now'))
              AND post_type = 'file'
            GROUP BY file_extension
            ORDER BY count DESC
            LIMIT 20
            "#
        )
        .fetch_all(&self.pool)
        .await?;

        let mut map = std::collections::HashMap::new();
        for row in results {
            let ext = row.file_extension.unwrap_or_else(|| "unknown".to_string());
            map.insert(ext, row.count);
        }

        Ok(map)
    }
}
