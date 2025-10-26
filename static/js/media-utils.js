/**
 * dogbox.moe Media Utilities
 *
 * Shared utilities for media handling, file operations, and display
 */

class MediaUtils {
    /**
     * Get file icon based on MIME type
     */
    static getFileIcon(mimeType) {
        if (!mimeType) return '📄';
        if (mimeType.startsWith('image/')) return '🖼️';
        if (mimeType.startsWith('video/')) return '🎥';
        if (mimeType.startsWith('audio/')) return '🎵';
        if (mimeType.includes('pdf')) return '📕';
        if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('gzip')) return '📦';
        if (mimeType.includes('text')) return '📝';
        return '📄';
    }

    /**
     * Check if MIME type is playable media
     */
    static isPlayableMedia(mimeType) {
        if (!mimeType) return false;
        return mimeType.startsWith('image/') ||
               mimeType.startsWith('video/') ||
               mimeType.startsWith('audio/');
    }

    /**
     * Get file extension from MIME type
     */
    static getExtensionFromMimeType(mimeType) {
        if (!mimeType) return '';

        const mimeToExt = {
            'image/png': '.png',
            'image/jpeg': '.jpg',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'video/webm': '.webm',
            'video/mp4': '.mp4',
            'audio/webm': '.webm',
            'audio/mpeg': '.mp3',
            'audio/wav': '.wav',
            'application/pdf': '.pdf',
            'text/plain': '.txt',
            'application/zip': '.zip',
            'application/gzip': '.tar.gz',
            'application/x-gzip': '.tar.gz',
            'application/x-tar': '.tar',
        };

        return mimeToExt[mimeType] || '';
    }

    /**
     * Format file size for display
     */
    static formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return (bytes / Math.pow(k, i)).toFixed(1) + ' ' + sizes[i];
    }

    /**
     * Create a download link and trigger download
     */
    static triggerDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    /**
     * Create media player element for a blob
     * Returns { element, cleanup } where cleanup revokes the blob URL
     */
    static createMediaPlayer(blob, mimeType) {
        const blobUrl = URL.createObjectURL(blob);
        let element;

        if (mimeType.startsWith('image/')) {
            element = document.createElement('img');
            element.src = blobUrl;
            element.style.cssText = 'max-width: 100%; border-radius: 8px;';
        } else if (mimeType.startsWith('video/')) {
            element = document.createElement('video');
            element.src = blobUrl;
            element.controls = true;
            element.style.cssText = 'max-width: 100%; border-radius: 8px;';
        } else if (mimeType.startsWith('audio/')) {
            element = document.createElement('audio');
            element.src = blobUrl;
            element.controls = true;
            element.style.cssText = 'width: 100%;';
        }

        return {
            element,
            cleanup: () => URL.revokeObjectURL(blobUrl)
        };
    }

    /**
     * Read file as ArrayBuffer
     */
    static readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Read file as text
     */
    static readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }
}
