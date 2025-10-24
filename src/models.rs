use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, ToSchema)]
#[serde(rename_all = "lowercase")]
pub enum PostType {
    #[serde(rename = "file")]
    File,  // Classic one-off file upload
    #[serde(rename = "post")]
    Post,  // Appendable post with markdown content
}

impl Default for PostType {
    fn default() -> Self {
        PostType::File
    }
}

impl std::fmt::Display for PostType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PostType::File => write!(f, "file"),
            PostType::Post => write!(f, "post"),
        }
    }
}

impl std::str::FromStr for PostType {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "file" => Ok(PostType::File),
            "post" => Ok(PostType::Post),
            _ => Err(format!("Invalid post type: {}", s)),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct FileRecord {
    pub id: String,
    pub filename_encrypted: Option<String>,
    pub size_bytes: i64,
    pub mime_type: Option<String>,
    pub uploaded_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
    pub deletion_token: String,
    pub storage_path: String,
    pub blake3_hash: String,
    pub created_at: DateTime<Utc>,
    pub post_type: String,  // Will convert to/from PostType
    pub post_append_key: Option<String>,
    pub is_permanent: bool,
    pub view_count: i64,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UploadRequest {
    /// Optional encrypted filename (client decides whether to encrypt this)
    #[schema(example = "encrypted_filename_blob")]
    pub filename: Option<String>,

    /// MIME type hint (of encrypted blob, typically application/octet-stream)
    #[schema(example = "application/octet-stream")]
    pub mime_type: Option<String>,

    /// Hours until automatic deletion (max configured on server)
    #[schema(example = 24)]
    pub expiry_hours: Option<i64>,

    /// Type of upload: 'file' or 'post'
    #[schema(example = "file")]
    pub post_type: Option<PostType>,

    /// Make upload permanent (never expires)
    #[schema(example = false)]
    pub is_permanent: Option<bool>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UploadResponse {
    /// Unique file identifier
    #[schema(example = "550e8400-e29b-41d4-a716-446655440000")]
    pub file_id: String,

    /// Token required for manual deletion
    #[schema(example = "a1b2c3d4-e5f6-7890-abcd-ef1234567890")]
    pub deletion_token: String,

    /// When the file will be automatically deleted (null if permanent)
    pub expires_at: Option<DateTime<Utc>>,

    /// Direct download URL (append #key in client)
    #[schema(example = "https://dogbox.moe/api/files/550e8400-e29b-41d4-a716-446655440000")]
    pub url: String,

    /// Post type
    pub post_type: PostType,

    /// Key for appending to posts (only for post_type='post')
    pub post_append_key: Option<String>,

    /// Whether this upload is permanent
    pub is_permanent: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct HealthResponse {
    pub status: String,
    pub version: String,
    pub test_mode: bool,
    /// Timestamp when all data will be deleted (only in test mode)
    pub next_test_delete: Option<DateTime<Utc>>,
    /// Optional admin message to display
    pub admin_message: Option<String>,
    /// Maximum upload size in bytes
    pub max_upload_size: usize,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct DeleteResponse {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct StatsResponse {
    pub total_uploads: i64,
    pub total_posts: i64,
    pub total_files: i64,
    pub permanent_count: i64,
    pub temporary_count: i64,
    pub total_views: i64,
    pub storage_mb: f64,
}


// Post content entry
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct PostContent {
    pub id: i64,
    pub file_id: String,
    pub content_encrypted: String,
    pub content_order: i64,
    pub appended_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct AppendRequest {
    /// Key that allows appending to this post
    pub append_key: String,

    /// Encrypted markdown content to append
    pub content: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct AppendResponse {
    pub success: bool,
    pub message: String,
    pub content_order: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PostViewResponse {
    pub post_id: String,
    pub post_type: PostType,
    pub is_permanent: bool,
    pub expires_at: Option<DateTime<Utc>>,
    pub uploaded_at: DateTime<Utc>,
    pub view_count: i64,
    /// Encrypted content chunks in order (for posts)
    pub content: Vec<PostContentView>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct PostContentView {
    pub content_encrypted: String,
    pub appended_at: DateTime<Utc>,
    pub order: i64,
}

impl FileRecord {
    pub fn new(
        filename_encrypted: Option<String>,
        size_bytes: i64,
        mime_type: Option<String>,
        expires_at: DateTime<Utc>,
        storage_path: String,
        blake3_hash: String,
        post_type: PostType,
        is_permanent: bool,
    ) -> Self {
        let post_append_key = if post_type == PostType::Post {
            Some(format!("DOGBOX_KEY_APPEND_{}", Uuid::new_v4()))
        } else {
            None
        };

        Self {
            id: Uuid::new_v4().to_string(),
            filename_encrypted,
            size_bytes,
            mime_type,
            uploaded_at: Utc::now(),
            expires_at,
            deletion_token: Uuid::new_v4().to_string(),
            storage_path,
            blake3_hash,
            created_at: Utc::now(),
            post_type: post_type.to_string(),
            post_append_key,
            is_permanent,
            view_count: 0,
        }
    }

    pub fn get_post_type(&self) -> PostType {
        self.post_type.parse().unwrap_or(PostType::File)
    }
}
