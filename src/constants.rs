/// Application-wide constants
/// All magic numbers and constant values should be defined here

/// Maximum upload size in bytes (1 GB)
pub const MAX_UPLOAD_SIZE: usize = 1024 * 1024 * 1024;

/// Dogbox emoji sequence used in logs and UI
pub const DOGBOX_EMOJI: &str = "🐕🐾🦴💨";

/// Default file expiration time in hours
pub const DEFAULT_EXPIRY_HOURS: i64 = 24;

/// Maximum expiration time in hours (7 days)
pub const MAX_EXPIRY_HOURS: i64 = 168;

/// Cleanup task interval in seconds (1 hour)
pub const CLEANUP_INTERVAL_SECS: u64 = 3600;
