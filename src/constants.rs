/// Application-wide constants
/// All magic numbers and constant values should be defined here

/// Maximum upload size in bytes (5 GB)
pub const MAX_UPLOAD_SIZE: usize = 5 * 1024 * 1024 * 1024;

/// Dogbox emoji sequence used in logs and UI
pub const DOGBOX_EMOJI: &str = "🐕🐾🦴💨";

/// Cleanup task interval in seconds (1 hour)
pub const CLEANUP_INTERVAL_SECS: u64 = 3600;

/// Maximum number of content entries per post (prevents memory exhaustion)
pub const MAX_POST_CONTENT_ENTRIES: i64 = 1000;

/// Dogpaste character set for IDs and encryption keys
/// Human-friendly: excludes ambiguous characters (0, O, 1, l, I)
/// This ensures codes are easy to type and read
pub const DOGPASTE_CHARSET: &str = "23456789abcdefghjkmnpqrstuvwxyz";
