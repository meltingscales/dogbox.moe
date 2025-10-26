use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("File not found")]
    NotFound,

    #[error("Invalid deletion token")]
    InvalidDeletionToken,

    #[error("File too large (max {max_mb}MB)")]
    FileTooLarge { max_mb: u64 },

    #[error("Payload too large: {0}")]
    PayloadTooLarge(String),

    #[error("Invalid request: {0}")]
    BadRequest(String),

    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, error_message) = match self {
            AppError::Database(e) => {
                tracing::error!("Database error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Database error".to_string())
            }
            AppError::Io(e) => {
                tracing::error!("IO error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Storage error".to_string())
            }
            AppError::NotFound => (StatusCode::NOT_FOUND, "File not found".to_string()),
            AppError::InvalidDeletionToken => {
                (StatusCode::FORBIDDEN, "Invalid deletion token".to_string())
            }
            AppError::FileTooLarge { max_mb } => {
                (StatusCode::PAYLOAD_TOO_LARGE, format!("File too large (max {}MB)", max_mb))
            }
            AppError::PayloadTooLarge(msg) => (StatusCode::PAYLOAD_TOO_LARGE, msg),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::Internal(e) => {
                tracing::error!("Internal error: {}", e);
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let body = Json(json!({
            "error": error_message,
        }));

        (status, body).into_response()
    }
}

pub type Result<T> = std::result::Result<T, AppError>;
