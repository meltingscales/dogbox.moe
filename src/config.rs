use std::env;

#[derive(Debug, Clone)]
pub struct Config {
    pub port: u16,
    pub database_url: String,
    pub upload_dir: String,
    pub default_expiry_hours: i64,
    pub max_expiry_hours: i64,
    pub test_delete_period_hours: Option<i64>,
    pub admin_message: Option<String>,
}

impl Config {
    pub fn from_env() -> anyhow::Result<Self> {
        // Validate admin message if set (allow safe characters only)
        let admin_message = if let Ok(msg) = env::var("ADMIN_MESSAGE") {
            if !msg.chars().all(|c| {
                c.is_ascii_alphanumeric() || c.is_whitespace() || matches!(c, ',' | '.' | '-' | '\'')
            }) {
                anyhow::bail!(
                    "ADMIN_MESSAGE contains invalid characters. Only alphanumeric characters, spaces, commas, periods, hyphens, and apostrophes are allowed to prevent XSS."
                );
            }
            Some(msg)
        } else {
            None
        };

        Ok(Self {
            port: env::var("PORT")
                .unwrap_or_else(|_| "8080".to_string())
                .parse()?,
            database_url: env::var("DATABASE_URL")
                .unwrap_or_else(|_| "sqlite:./dogbox.db".to_string()),
            upload_dir: env::var("UPLOAD_DIR")
                .unwrap_or_else(|_| "./uploads".to_string()),
            default_expiry_hours: env::var("DEFAULT_EXPIRY_HOURS")
                .unwrap_or_else(|_| "24".to_string())
                .parse()?,
            max_expiry_hours: env::var("MAX_EXPIRY_HOURS")
                .unwrap_or_else(|_| "168".to_string())
                .parse()?,
            test_delete_period_hours: env::var("TEST_DELETE_PERIOD_HOURS")
                .ok()
                .and_then(|s| s.parse().ok()),
            admin_message,
        })
    }
}
