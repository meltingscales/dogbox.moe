-- Add post types and append functionality

-- Add new columns to files table
ALTER TABLE files ADD COLUMN post_type TEXT NOT NULL DEFAULT 'file';
-- post_type values: 'file' (classic one-off), 'post' (appendable)

ALTER TABLE files ADD COLUMN post_append_key TEXT;
-- Only set for post_type='post', allows appending content

ALTER TABLE files ADD COLUMN is_permanent BOOLEAN NOT NULL DEFAULT 0;
-- If true, file never expires (expires_at is ignored)

ALTER TABLE files ADD COLUMN view_count INTEGER NOT NULL DEFAULT 0;
-- Track views (optional, for posts)

-- Create posts_content table for appendable posts
CREATE TABLE IF NOT EXISTS posts_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_id TEXT NOT NULL,
    content_encrypted TEXT NOT NULL,     -- Encrypted markdown content
    content_order INTEGER NOT NULL,       -- Order of appended content
    appended_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
);

-- Index for retrieving post content in order
CREATE INDEX IF NOT EXISTS idx_posts_content_file_id ON posts_content(file_id, content_order);

-- Update files table to mark posts differently
-- Posts don't use storage_path the same way - they use posts_content table
