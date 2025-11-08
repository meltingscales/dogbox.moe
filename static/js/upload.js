/**
 * dogbox.moe Upload Handler
 *
 * Handles file upload with post-quantum encryption
 */

class UploadHandler {
    constructor(dogboxCrypto, blockViz) {
        this.crypto = dogboxCrypto;
        this.blockViz = blockViz;

        console.log('[Upload] UploadHandler initialized');
    }

    /**
     * Handle file selection/drop
     */
    async handleFile(file, callbacks) {
        console.log('[Upload] handleFile called:', file.name, file.type, file.size);

        // Accept all files - no restrictions
        await this.uploadFile(file, callbacks);
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

            // Get upload options
            const postType = callbacks.getPostType();
            const isPermanent = callbacks.getIsPermanent();
            const expiryHours = callbacks.getExpiryHours();
            const markdownContent = callbacks.getMarkdownContent ? callbacks.getMarkdownContent() : '';

            console.log('[Upload] Upload options:', { postType, isPermanent, expiryHours, hasMarkdown: !!markdownContent });

            callbacks.updateProgress(60, 'Encrypting content...');

            // Initialize and show block visualization (now works with chunked encryption for all file sizes!)
            if (this.blockViz) {
                this.blockViz.initialize();
                this.blockViz.show();
            }

            // For posts, prioritize markdown content; if no markdown, use file
            let encryptedData;
            let mimeType;
            let fileExtension = '';

            if (postType === 'post' && markdownContent) {
                // Encrypt markdown content
                console.log('[Upload] Encrypting markdown content:', markdownContent.length, 'chars');
                const markdownBlob = new Blob([markdownContent], { type: 'text/plain' });
                encryptedData = await this.crypto.encryptFileWithProgress(markdownBlob, key, (progressData) => {
                    // Update block visualization
                    if (this.blockViz && progressData.decryptedBlocks && progressData.decryptedBlocks.length > 0) {
                        this.blockViz.decryptBlocks(progressData.decryptedBlocks);
                    }
                    // Update progress bar
                    callbacks.updateProgress(60 + (progressData.percentage * 0.15), `Encrypting... ${Math.round(progressData.percentage)}%`);
                });
                mimeType = 'text/plain';
                fileExtension = '.md';
                console.log('[Upload] Markdown encrypted, size:', encryptedData.byteLength);
            } else {
                // Encrypt file
                console.log('[Upload] Encrypting file, size:', file.size, 'bytes');
                encryptedData = await this.crypto.encryptFileWithProgress(file, key, (progressData) => {
                    // Update block visualization
                    if (this.blockViz && progressData.decryptedBlocks && progressData.decryptedBlocks.length > 0) {
                        this.blockViz.decryptBlocks(progressData.decryptedBlocks);
                    }
                    // Update progress bar
                    callbacks.updateProgress(60 + (progressData.percentage * 0.15), `Encrypting... ${Math.round(progressData.percentage)}%`);
                });
                mimeType = file.type || "application/octet-stream";
                fileExtension = file.name.includes('.') ? '.' + file.name.split('.').pop() : '';
                console.log('[Upload] File encrypted, size:', encryptedData.byteLength);
            }

            // Hide block viz
            if (this.blockViz) {
                setTimeout(() => this.blockViz.hide(), 1000);
            }

            callbacks.updateProgress(75, 'Uploading encrypted data...');

            // Upload to server
            const formData = new FormData();
            formData.append("file", new Blob([encryptedData]), "encrypted.bin");
            formData.append("mime_type", mimeType);
            formData.append("post_type", postType);
            formData.append("is_permanent", isPermanent.toString());
            if (!isPermanent) {
                formData.append("expiry_hours", expiryHours);
            }
            // Preserve file extension
            if (fileExtension) {
                formData.append("file_extension", fileExtension);
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

                // Provide more detailed error messages
                if (response.status === 413) {
                    const fileSizeMB = (encryptedData.byteLength / (1024 * 1024)).toFixed(2);
                    const maxSizeBytes = window.maxUploadSize || (1024 * 1024 * 1024); // Get from API or default to 1GB
                    const maxSizeMB = (maxSizeBytes / (1024 * 1024)).toFixed(0);
                    const maxSizeGB = (maxSizeBytes / (1024 * 1024 * 1024)).toFixed(1);

                    const sizeLabel = maxSizeBytes >= 1024 * 1024 * 1024 ? `${maxSizeGB} GB` : `${maxSizeMB} MB`;

                    throw new Error(
                        `File too large: Your encrypted file is ${fileSizeMB} MB. ` +
                        `Maximum allowed size is ${sizeLabel}. ` +
                        `Try uploading a smaller file or compressing it into a ZIP archive.`
                    );
                } else {
                    throw new Error("Upload failed: " + response.statusText + (errorText ? " - " + errorText : ""));
                }
            }

            const data = await response.json();
            console.log('[Upload] Upload successful, response:', data);

            callbacks.updateProgress(100, 'Complete!');

            // Construct URL with key in fragment - use correct path based on type
            const pathPrefix = data.post_type === 'post' ? '/p/' : '/f/';
            const url = `${window.location.origin}${pathPrefix}${data.file_id}#${keyBase64}`;
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
