-- Dogpaste table for storing short-code encrypted pastes
-- Uses 5-character alphanumeric IDs for shorter URLs
-- Format: /dogpaste#[10-char-code] where code = encryption_key + paste_id
CREATE TABLE IF NOT EXISTS dogpaste (
    id TEXT PRIMARY KEY NOT NULL,              -- 5-char alphanumeric ID (a-zA-Z0-9)
    encrypted_data BLOB NOT NULL,              -- Encrypted paste content
    created_at INTEGER NOT NULL,               -- Unix timestamp
    expires_at INTEGER NOT NULL,               -- Unix timestamp for auto-deletion
    views INTEGER NOT NULL DEFAULT 0           -- View counter (optional feature)
);

-- Index for cleanup queries
CREATE INDEX IF NOT EXISTS idx_dogpaste_expires_at ON dogpaste(expires_at);
