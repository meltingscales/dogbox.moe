-- dogbox.moe initial schema
-- Stores only metadata, never decrypted file content

CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY NOT NULL,              -- UUID v4
    filename_encrypted TEXT,                   -- Optional encrypted original filename
    size_bytes INTEGER NOT NULL,               -- Size of encrypted blob
    mime_type TEXT,                            -- Detected MIME type (of encrypted blob)

    -- Privacy & expiration
    uploaded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,             -- Automatic deletion time
    deletion_token TEXT NOT NULL UNIQUE,       -- Token for manual deletion

    -- Storage
    storage_path TEXT NOT NULL,                -- Path to encrypted blob on disk

    -- Checksums (of encrypted data)
    blake3_hash TEXT NOT NULL UNIQUE,          -- BLAKE3 hash for deduplication

    -- Metadata (never contains decryption keys)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Index for cleanup job
CREATE INDEX IF NOT EXISTS idx_files_expires_at ON files(expires_at);

-- Index for hash-based deduplication
CREATE INDEX IF NOT EXISTS idx_files_blake3_hash ON files(blake3_hash);
