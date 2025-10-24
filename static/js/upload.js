/**
 * dogbox.moe Upload Handler
 *
 * Handles file upload with post-quantum encryption
 */

class UploadHandler {
    constructor(dogboxCrypto, converter) {
        this.crypto = dogboxCrypto;
        this.converter = converter;
        this.pendingFile = null;
        this.lastProgressLog = 0; // Timestamp of last progress log

        console.log('[Upload] UploadHandler initialized');
    }

    /**
     * Check if file needs conversion to PNG/WebM
     */
    needsConversion(file) {
        const result = this.converter.needsConversion(file);
        console.log('[Upload] needsConversion:', file.type, '→', result);
        return result;
    }

    /**
     * Check if file format is allowed (PNG, WebM, TXT)
     * MP3 files need conversion to WebM to strip ID3 metadata
     */
    isAllowedFormat(file) {
        const allowed = file.type === 'image/png' ||
                       file.type === 'video/webm' ||
                       file.type === 'audio/webm' ||
                       file.type === 'text/plain';
        console.log('[Upload] isAllowedFormat:', file.type, '→', allowed);
        return allowed;
    }

    /**
     * Handle file selection/drop
     */
    async handleFile(file, callbacks) {
        console.log('[Upload] handleFile called:', file.name, file.type, file.size);

        const needsConversion = this.needsConversion(file);
        const isAllowed = this.isAllowedFormat(file);

        if (!isAllowed && !needsConversion) {
            const msg = 'Unsupported file type. Please upload PNG, WebM, or TXT files, or a file that can be converted (JPEG, MP3, MP4, etc.)';
            console.error('[Upload] File rejected:', msg);
            alert(msg);
            return;
        }

        if (needsConversion) {
            console.log('[Upload] File needs conversion, showing converter notice');
            this.pendingFile = file;
            callbacks.showConverterNotice(file);
            return;
        }

        // File is already in correct format, proceed with upload
        console.log('[Upload] File is in correct format, proceeding with upload');
        await this.uploadFile(file, callbacks);
    }

    /**
     * Cancel conversion
     */
    cancelConversion(callbacks) {
        console.log('[Upload] Conversion cancelled');
        this.pendingFile = null;
        callbacks.hideConverterNotice();
        callbacks.resetFileInput();
    }

    /**
     * Convert and upload file
     */
    async convertAndUpload(callbacks) {
        if (!this.pendingFile) {
            console.error('[Upload] No pending file to convert');
            return;
        }

        console.log('[Upload] Starting conversion for:', this.pendingFile.name);

        try {
            callbacks.hideConverterNotice();
            callbacks.hideResult();
            callbacks.showProgress();
            callbacks.updateProgress(0, 'Converting file format...');

            // Convert file with progress tracking (throttled logging)
            const convertedFile = await this.converter.convert(this.pendingFile, (progressInfo) => {
                const conversionProgress = progressInfo.progress || 0;
                callbacks.updateProgress(conversionProgress * 0.5, `Converting: ${progressInfo.status}... ${Math.round(conversionProgress)}%`);

                // Only log progress every 5 seconds
                const now = Date.now();
                if (now - this.lastProgressLog >= 5000) {
                    console.log('[Upload] Conversion progress:', conversionProgress.toFixed(1) + '%', progressInfo.status);
                    this.lastProgressLog = now;
                }
            });

            console.log('[Upload] Conversion complete:', convertedFile.name, convertedFile.type);
            this.pendingFile = null;

            // Now upload the converted file
            await this.uploadFile(convertedFile, callbacks);

        } catch (error) {
            console.error('[Upload] Conversion failed:', error);
            alert("Conversion failed: " + error.message);
            callbacks.hideProgress();
            callbacks.hideConverterNotice();
            this.pendingFile = null;
        }
    }

    /**
     * Upload file (main upload function)
     */
    async uploadFile(file, callbacks) {
        console.log('[Upload] uploadFile started for:', file.name, file.type, file.size);

        try {
            callbacks.hideResult();
            callbacks.showProgress();
            callbacks.updateProgress(50, 'Generating encryption key...');

            // Check if post-quantum library is loaded
            console.log('[Upload] Checking if noblePostQuantum is loaded...');
            console.log('[Upload] window.noblePostQuantum:', window.noblePostQuantum);

            if (!window.noblePostQuantum) {
                throw new Error('Post-quantum library not loaded (window.noblePostQuantum is undefined). Please refresh the page and try again.');
            }

            if (!window.noblePostQuantum.ml_kem1024) {
                throw new Error('ML-KEM-1024 not available in post-quantum library. Please refresh the page and try again.');
            }

            console.log('[Upload] Post-quantum library confirmed loaded');

            // Generate encryption key
            console.log('[Upload] Generating ML-KEM-1024 hybrid key...');
            const key = await this.crypto.generateKey();
            console.log('[Upload] Key generated:', {
                hasAesKey: !!key.aesKey,
                kemSecretKeyLength: key.kemSecretKey?.length,
                kemCiphertextLength: key.kemCiphertext?.length
            });

            const keyBase64 = await this.crypto.exportKey(key);
            console.log('[Upload] Key exported to base64, length:', keyBase64.length);

            callbacks.updateProgress(60, 'Encrypting file...');

            // Encrypt file
            console.log('[Upload] Encrypting file...');
            const encryptedData = await this.crypto.encryptFile(file, key);
            console.log('[Upload] File encrypted, size:', encryptedData.byteLength);

            callbacks.updateProgress(75, 'Uploading encrypted data...');

            // Get upload options
            const postType = callbacks.getPostType();
            const isPermanent = callbacks.getIsPermanent();
            const expiryHours = callbacks.getExpiryHours();

            console.log('[Upload] Upload options:', { postType, isPermanent, expiryHours });

            // Upload to server
            const formData = new FormData();
            formData.append("file", new Blob([encryptedData]), "encrypted.bin");
            formData.append("mime_type", "application/octet-stream");
            formData.append("post_type", postType);
            formData.append("is_permanent", isPermanent.toString());
            if (!isPermanent) {
                formData.append("expiry_hours", expiryHours);
            }

            console.log('[Upload] Sending POST to /api/upload...');
            const response = await fetch("/api/upload", {
                method: "POST",
                body: formData,
            });

            console.log('[Upload] Response status:', response.status, response.statusText);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('[Upload] Server error response:', errorText);
                throw new Error("Upload failed: " + response.statusText);
            }

            const data = await response.json();
            console.log('[Upload] Upload successful, response:', data);

            callbacks.updateProgress(100, 'Complete!');

            // Construct URL with key in fragment
            const url = `${window.location.origin}/f/${data.file_id}#${keyBase64}`;
            console.log('[Upload] Share URL created, length:', url.length);

            // Store append key if this is a post
            if (data.post_append_key) {
                window.lastAppendKey = data.post_append_key;
                console.log('[Upload] Stored append key');
            }

            setTimeout(() => {
                callbacks.hideProgress();
                callbacks.showResult(url, data);
                console.log('[Upload] Upload flow complete');
            }, 500);

        } catch (error) {
            console.error('[Upload] Upload failed with error:', error);
            console.error('[Upload] Error stack:', error.stack);
            alert("Upload failed: " + error.message);
            callbacks.hideProgress();
        }
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.UploadHandler = UploadHandler;
    console.log('[Upload] UploadHandler class exported to window');
}
