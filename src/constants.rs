/// Application-wide constants
/// All magic numbers and constant values should be defined here

/// Maximum upload size in bytes (1 GB)
pub const MAX_UPLOAD_SIZE: usize = 1024 * 1024 * 1024;

/// Dogbox emoji sequence used in logs and UI
pub const DOGBOX_EMOJI: &str = "🐕🐾🦴💨";

/// Cleanup task interval in seconds (1 hour)
pub const CLEANUP_INTERVAL_SECS: u64 = 3600;
