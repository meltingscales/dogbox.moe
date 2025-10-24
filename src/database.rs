use crate::error::Result;
use crate::models::{FileRecord, PostContent};
use chrono::{DateTime, Utc};
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};

#[derive(Clone)]
pub struct Database {
    pool: SqlitePool,
}

impl Database {
    pub async fn new(database_url: &str) -> anyhow::Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(database_url)
            .await?;

        Ok(Self { pool })
    }

    pub async fn migrate(&self) -> anyhow::Result<()> {
        // Read and execute migration files
        let migration1 = include_str!("../migrations/001_init.sql");
        sqlx::raw_sql(migration1).execute(&self.pool).await?;

        let migration2 = include_str!("../migrations/002_post_types.sql");
        sqlx::raw_sql(migration2).execute(&self.pool).await?;

        tracing::info!("Database migrations completed");
        Ok(())
    }

    pub async fn create_file(&self, file: &FileRecord) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO files (
                id, filename_encrypted, size_bytes, mime_type,
                uploaded_at, expires_at, deletion_token, storage_path,
                blake3_hash, post_type, post_append_key, is_permanent, view_count
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                   view_count
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
        let result = sqlx::query!(
            r#"
            DELETE FROM files
            WHERE id = ? AND deletion_token = ?
            "#,
            id,
            deletion_token
        )
        .execute(&self.pool)
        .await?;

        Ok(result.rows_affected() > 0)
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
                   view_count
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
    pub async fn add_post_content(&self, file_id: &str, content_encrypted: &str, order: i64) -> Result<()> {
        sqlx::query!(
            r#"
            INSERT INTO posts_content (file_id, content_encrypted, content_order)
            VALUES (?, ?, ?)
            "#,
            file_id,
            content_encrypted,
            order
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn get_post_content(&self, file_id: &str) -> Result<Vec<PostContent>> {
        let content = sqlx::query_as!(
            PostContent,
            r#"
            SELECT id, file_id, content_encrypted, content_order,
                   appended_at as "appended_at: DateTime<Utc>"
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
            SELECT COALESCE(MAX(content_order), -1) + 1 as next_order
            FROM posts_content
            WHERE file_id = ?
            "#,
            file_id
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(result.next_order.unwrap_or(0))
    }

    pub async fn verify_append_key(&self, file_id: &str, append_key: &str) -> Result<bool> {
        let result = sqlx::query!(
            r#"
            SELECT COUNT(*) as count
            FROM files
            WHERE id = ? AND post_append_key = ? AND post_type = 'post'
            "#,
            file_id,
            append_key
        )
        .fetch_one(&self.pool)
        .await?;

        Ok(result.count > 0)
    }
}
