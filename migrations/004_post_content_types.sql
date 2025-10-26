-- Add content types to posts_content for markdown vs file attachments

ALTER TABLE posts_content ADD COLUMN content_type TEXT NOT NULL DEFAULT 'markdown';
-- content_type values: 'markdown' (text content), 'file' (encrypted file attachment)

ALTER TABLE posts_content ADD COLUMN mime_type TEXT;
-- Only set for content_type='file', stores the MIME type of the file

ALTER TABLE posts_content ADD COLUMN file_extension TEXT;
-- Only set for content_type='file', stores the file extension

ALTER TABLE posts_content ADD COLUMN file_size INTEGER;
-- Only set for content_type='file', stores the size in bytes

-- For backward compatibility, existing rows will default to 'markdown'
