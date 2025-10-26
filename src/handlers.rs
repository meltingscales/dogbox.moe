use crate::config::Config;
use crate::database::Database;
use crate::error::{AppError, Result};
use crate::models::*;
use crate::services::FileService;
use axum::{
    body::Bytes,
    extract::{Multipart, Path, Query, State},
    http::{header, HeaderMap},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;
use std::sync::Arc;
use std::str::FromStr;
use utoipa::OpenApi;

#[derive(OpenApi)]
#[openapi(
    paths(health, admin_motd, upload, download, delete_file, view_post, append_to_post, stats),
    components(schemas(
        HealthResponse,
        UploadRequest,
        UploadResponse,
        DeleteResponse,
        PostType,
        PostViewResponse,
        PostContentView,
        AppendRequest,
        AppendResponse,
        StatsResponse
    )),
    tags(
        (name = "dogbox.moe", description = "Privacy-focused file hosting with E2EE")
    ),
    info(
        title = "dogbox.moe API",
        version = "0.1.0",
        description = "Zero-knowledge file hosting with post-quantum encryption.\n\n\
                      ## Privacy Model\n\
                      - Files are encrypted CLIENT-SIDE before upload\n\
                      - Server stores only encrypted blobs\n\
                      - Decryption keys never leave the client\n\
                      - Keys are stored in URL fragments (not sent to server)\n\
                      - No user tracking or analytics\n\n\
                      ## Security\n\
                      - Hybrid encryption: ML-KEM-768 + ChaCha20-Poly1305\n\
                      - Post-quantum resistant\n\
                      - Automatic file expiration\n\
                      - Secure deletion",
        license(name = "MIT"),
    )
)]
pub struct ApiDoc;

/// Health check endpoint
#[utoipa::path(
    get,
    path = "/api/health",
    tag = "dogbox.moe",
    responses(
        (status = 200, description = "Service is healthy", body = HealthResponse)
    )
)]
pub async fn health(State(config): State<Arc<Config>>) -> Json<HealthResponse> {
    let next_test_delete = if config.test_delete_24hr {
        *crate::cleanup::NEXT_TEST_DELETE.read().await
    } else {
        None
    };

    Json(HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        test_mode: config.test_delete_24hr,
        next_test_delete,
        admin_message: config.admin_message.clone(),
        max_upload_size: crate::constants::MAX_UPLOAD_SIZE,
    })
}

/// Get admin message of the day (MOTD)
#[utoipa::path(
    get,
    path = "/api/admin-motd",
    tag = "dogbox.moe",
    responses(
        (status = 200, description = "Admin message", body = String),
        (status = 204, description = "No admin message set")
    )
)]
pub async fn admin_motd(State(config): State<Arc<Config>>) -> impl IntoResponse {
    match &config.admin_message {
        Some(msg) => (axum::http::StatusCode::OK, msg.clone()).into_response(),
        None => axum::http::StatusCode::NO_CONTENT.into_response(),
    }
}

/// Upload encrypted file blob
///
/// Client should:
/// 1. Generate encryption key
/// 2. Encrypt file with key
/// 3. Upload encrypted blob
/// 4. Receive file_id and construct URL with key in fragment: /f/{file_id}#{key}
#[utoipa::path(
    post,
    path = "/api/upload",
    tag = "dogbox.moe",
    request_body(content = inline(Vec<u8>), description = "Encrypted file blob", content_type = "application/octet-stream"),
    responses(
        (status = 200, description = "File uploaded successfully", body = UploadResponse),
        (status = 413, description = "File too large"),
        (status = 500, description = "Upload failed")
    )
)]
pub async fn upload(
    State(config): State<Arc<Config>>,
    mut multipart: Multipart,
) -> Result<Json<UploadResponse>> {
    let db = Database::new(&config.database_url).await?;
    let service = FileService::new((*config).clone(), db);

    let mut file_data: Option<Vec<u8>> = None;
    let mut filename_encrypted: Option<String> = None;
    let mut mime_type: Option<String> = None;
    let mut expiry_hours: Option<i64> = None;
    let mut post_type: Option<PostType> = None;
    let mut is_permanent: Option<bool> = None;
    let mut file_extension: Option<String> = None;

    // Parse multipart form data
    while let Some(field) = multipart.next_field().await.map_err(|e| {
        AppError::BadRequest(format!("Failed to parse multipart: {}", e))
    })? {
        let name = field.name().unwrap_or("").to_string();

        match name.as_str() {
            "file" => {
                let data = field.bytes().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read file data: {}", e))
                })?;
                file_data = Some(data.to_vec());
            }
            "filename" => {
                filename_encrypted = Some(field.text().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read filename: {}", e))
                })?);
            }
            "mime_type" => {
                mime_type = Some(field.text().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read mime_type: {}", e))
                })?);
            }
            "expiry_hours" => {
                let text = field.text().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read expiry_hours: {}", e))
                })?;
                expiry_hours = Some(text.parse().map_err(|_| {
                    AppError::BadRequest("Invalid expiry_hours value".to_string())
                })?);
            }
            "post_type" => {
                let text = field.text().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read post_type: {}", e))
                })?;
                post_type = Some(PostType::from_str(&text).map_err(|e| {
                    AppError::BadRequest(e)
                })?);
            }
            "is_permanent" => {
                let text = field.text().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read is_permanent: {}", e))
                })?;
                is_permanent = Some(text.parse().map_err(|_| {
                    AppError::BadRequest("Invalid is_permanent value".to_string())
                })?);
            }
            "file_extension" => {
                file_extension = Some(field.text().await.map_err(|e| {
                    AppError::BadRequest(format!("Failed to read file_extension: {}", e))
                })?);
            }
            _ => {}
        }
    }

    let data = file_data.ok_or_else(|| AppError::BadRequest("No file data provided".to_string()))?;
    let final_post_type = post_type.unwrap_or(PostType::File);
    let final_is_permanent = is_permanent.unwrap_or(false);

    // Store encrypted file
    let file = service
        .store_file(data, filename_encrypted, mime_type, expiry_hours, final_post_type, final_is_permanent, file_extension)
        .await?;

    let post_type = file.get_post_type();
    let url = match post_type {
        PostType::Post => format!("/p/{}", file.id),
        PostType::File => format!("/f/{}", file.id),
    };

    Ok(Json(UploadResponse {
        file_id: file.id.clone(),
        deletion_token: file.deletion_token.clone(),
        expires_at: if file.is_permanent { None } else { Some(file.expires_at) },
        url,
        post_type,
        post_append_key: file.post_append_key.clone(),
        is_permanent: file.is_permanent,
    }))
}

/// Download encrypted file blob
///
/// Returns the encrypted blob. Client must decrypt using key from URL fragment.
#[utoipa::path(
    get,
    path = "/api/files/{id}",
    tag = "dogbox.moe",
    params(
        ("id" = String, Path, description = "File ID")
    ),
    responses(
        (status = 200, description = "Encrypted file blob", body = Vec<u8>, content_type = "application/octet-stream"),
        (status = 404, description = "File not found or expired")
    )
)]
pub async fn download(
    State(config): State<Arc<Config>>,
    Path(id): Path<String>,
) -> Result<impl IntoResponse> {
    let db = Database::new(&config.database_url).await?;
    let service = FileService::new((*config).clone(), db);

    let (file, data) = service.retrieve_file(&id).await?;

    // Create headers with MIME type and filename
    let mut headers = HeaderMap::new();
    if let Some(mime_type) = &file.mime_type {
        if let Ok(header_value) = mime_type.parse() {
            headers.insert(header::CONTENT_TYPE, header_value);
        }
    }

    // Set Content-Disposition with file extension for better download experience
    let filename = if let Some(ext) = &file.file_extension {
        format!("file{}", if ext.starts_with('.') { ext.clone() } else { format!(".{}", ext) })
    } else {
        "file".to_string()
    };

    if let Ok(header_value) = format!("attachment; filename=\"{}\"", filename).parse() {
        headers.insert(header::CONTENT_DISPOSITION, header_value);
    }

    Ok((headers, Bytes::from(data)))
}

#[derive(Deserialize)]
pub struct DeleteQuery {
    token: String,
}

/// Delete file with deletion token
///
/// Requires the deletion token returned during upload.
#[utoipa::path(
    delete,
    path = "/api/files/{id}",
    tag = "dogbox.moe",
    params(
        ("id" = String, Path, description = "File ID"),
        ("token" = String, Query, description = "Deletion token")
    ),
    responses(
        (status = 200, description = "File deleted successfully", body = DeleteResponse),
        (status = 403, description = "Invalid deletion token"),
        (status = 404, description = "File not found")
    )
)]
pub async fn delete_file(
    State(config): State<Arc<Config>>,
    Path(id): Path<String>,
    Query(query): Query<DeleteQuery>,
) -> Result<Json<DeleteResponse>> {
    let db = Database::new(&config.database_url).await?;
    let service = FileService::new((*config).clone(), db);

    service.delete_file(&id, &query.token).await?;

    Ok(Json(DeleteResponse {
        success: true,
        message: "File deleted successfully".to_string(),
    }))
}

/// View a post with all appended content
#[utoipa::path(
    get,
    path = "/api/posts/{id}",
    tag = "dogbox.moe",
    params(
        ("id" = String, Path, description = "Post ID")
    ),
    responses(
        (status = 200, description = "Post content", body = PostViewResponse),
        (status = 404, description = "Post not found")
    )
)]
pub async fn view_post(
    State(config): State<Arc<Config>>,
    Path(id): Path<String>,
) -> Result<Json<PostViewResponse>> {
    let db = Database::new(&config.database_url).await?;
    let service = FileService::new((*config).clone(), db);

    let post = service.view_post(&id).await?;

    Ok(Json(post))
}

/// Append content to a post
#[utoipa::path(
    post,
    path = "/api/posts/{id}/append",
    tag = "dogbox.moe",
    params(
        ("id" = String, Path, description = "Post ID")
    ),
    request_body = AppendRequest,
    responses(
        (status = 200, description = "Content appended successfully", body = AppendResponse),
        (status = 403, description = "Invalid append key"),
        (status = 404, description = "Post not found")
    )
)]
pub async fn append_to_post(
    State(config): State<Arc<Config>>,
    Path(id): Path<String>,
    Json(req): Json<AppendRequest>,
) -> Result<Json<AppendResponse>> {
    let db = Database::new(&config.database_url).await?;
    let service = FileService::new((*config).clone(), db);

    let order = service.append_to_post(
        &id,
        &req.append_key,
        req.content,
        req.content_type,
        req.mime_type,
        req.file_extension,
        req.file_size,
    ).await?;

    Ok(Json(AppendResponse {
        success: true,
        message: "Content appended successfully".to_string(),
        content_order: order,
    }))
}

/// Get public statistics
#[utoipa::path(
    get,
    path = "/api/stats",
    tag = "dogbox.moe",
    responses(
        (status = 200, description = "System statistics", body = StatsResponse)
    )
)]
pub async fn stats(
    State(config): State<Arc<Config>>,
) -> Result<Json<StatsResponse>> {
    let db = Database::new(&config.database_url).await?;

    let (total, posts, files, permanent, temporary, views, bytes) = db.get_stats().await?;
    let file_extensions = db.get_file_extension_stats().await?;

    // Get disk space information for root filesystem
    let (disk_total_gb, disk_used_gb, disk_free_gb) = match nix::sys::statvfs::statvfs("/") {
        Ok(stats) => {
            let block_size = stats.block_size() as f64;
            let total_blocks = stats.blocks() as f64;
            let free_blocks = stats.blocks_free() as f64;

            let total_bytes = total_blocks * block_size;
            let free_bytes = free_blocks * block_size;
            let used_bytes = total_bytes - free_bytes;

            let gb = 1024.0 * 1024.0 * 1024.0;
            (total_bytes / gb, used_bytes / gb, free_bytes / gb)
        },
        Err(_) => (0.0, 0.0, 0.0),
    };

    Ok(Json(StatsResponse {
        total_uploads: total,
        total_posts: posts,
        total_files: files,
        permanent_count: permanent,
        temporary_count: temporary,
        total_views: views,
        storage_mb: (bytes as f64) / (1024.0 * 1024.0),
        disk_total_gb,
        disk_used_gb,
        disk_free_gb,
        file_extensions,
    }))
}
