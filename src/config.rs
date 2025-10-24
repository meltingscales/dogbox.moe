use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub database_url: String,
    pub upload_dir: String,
    pub max_file_size_mb: u64,
    pub default_expiry_hours: i64,
    pub max_expiry_hours: i64,
    pub enable_analytics: bool,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            host: env::var("HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
            port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()?,
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "sqlite:./dogbox.db".to_string()),
            upload_dir: env::var("UPLOAD_DIR")
                .unwrap_or_else(|_| "./uploads".to_string()),
            max_file_size_mb: env::var("MAX_FILE_SIZE_MB")
                .unwrap_or_else(|_| "100".to_string())
                .parse()?,
            default_expiry_hours: env::var("DEFAULT_EXPIRY_HOURS")
                .unwrap_or_else(|_| "24".to_string())
                .parse()?,
            max_expiry_hours: env::var("MAX_EXPIRY_HOURS")
                .unwrap_or_else(|_| "168".to_string())
                .parse()?,
            enable_analytics: env::var("ENABLE_ANALYTICS")
                .unwrap_or_else(|_| "false".to_string())
                .parse()
                .unwrap_or(false),
        })
    }

    pub fn max_file_size_bytes(&self) -> usize {
        (self.max_file_size_mb * 1024 * 1024) as usize
    }
}
