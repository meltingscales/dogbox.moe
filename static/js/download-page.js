        // Initialize page branding
        if (window.DogboxConfig) {
            document.getElementById('page-logo').textContent = DogboxConfig.logo;
            document.getElementById('page-sitename').textContent = DogboxConfig.siteName;
        }

        const status = document.getElementById('status');
        const statusText = document.getElementById('statusText');
        const fileInfo = document.getElementById('fileInfo');
        const downloadBtn = document.getElementById('downloadBtn');
        const playBtn = document.getElementById('playBtn');
        const progress = document.getElementById('progress');
        const progressFill = document.getElementById('progressFill');
        const progressText = document.getElementById('progressText');
        const mediaPlayer = document.getElementById('mediaPlayer');
        const imagePlayer = document.getElementById('imagePlayer');
        const videoPlayer = document.getElementById('videoPlayer');
        const audioPlayer = document.getElementById('audioPlayer');

        let encryptedData = null;
        let decryptionKey = null;
        let mimeType = null;
        let decryptedBlob = null;
        let dogboxCrypto = null;

        // Initialize crypto when ready
        async function initCrypto() {
            if (!window.noblePostQuantumReady) {
                await new Promise(resolve => {
                    window.addEventListener('noblePostQuantumReady', resolve, { once: true });
                });
            }
            dogboxCrypto = new DogboxCrypto();
        }

        // Handle post viewing (markdown + file attachments)
        async function handlePostView(postData) {
            try {
                status.classList.remove('loading');
                status.classList.add('ready');
                statusText.textContent = `✅ Post loaded (${postData.content.length} entries)`;

                // Hide file-specific UI
                fileInfo.style.display = 'none';
                downloadBtn.style.display = 'none';
                playBtn.style.display = 'none';

                // Create post display area
                const postDisplay = document.createElement('div');
                postDisplay.style.cssText = 'background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0;';

                for (const entry of postData.content) {
                    try {
                        // Decrypt each content entry
                        const encryptedBase64 = entry.content_encrypted;
                        const encryptedBytes = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
                        const decryptedData = await dogboxCrypto.decryptFile(encryptedBytes.buffer, decryptionKey);

                        // Create entry display
                        const entryDiv = document.createElement('div');
                        entryDiv.style.cssText = 'background: white; border-radius: 8px; padding: 15px; margin: 10px 0; border-left: 4px solid #667eea;';

                        // Timestamp header
                        const timestamp = document.createElement('div');
                        timestamp.style.cssText = 'color: #666; font-size: 0.85em; margin-bottom: 10px;';

                        if (entry.content_type === 'file') {
                            // File attachment
                            const fileSize = entry.file_size ? (entry.file_size / 1024).toFixed(1) + ' KB' : 'Unknown size';
                            const fileExt = entry.file_extension || '';
                            timestamp.innerHTML = `📅 ${new Date(entry.appended_at).toLocaleString()} • 📎 File Attachment (${fileSize})`;
                            entryDiv.appendChild(timestamp);

                            // Create file attachment UI
                            const fileAttachment = document.createElement('div');
                            fileAttachment.className = 'file-attachment';

                            const icon = document.createElement('div');
                            icon.className = 'file-attachment-icon';
                            icon.textContent = MediaUtils.getFileIcon(entry.mime_type);

                            const info = document.createElement('div');
                            info.className = 'file-attachment-info';
                            info.textContent = `${entry.mime_type || 'application/octet-stream'} ${fileExt}`;

                            const buttons = document.createElement('div');
                            buttons.className = 'file-attachment-buttons';

                            // Download button
                            const downloadBtn = document.createElement('button');
                            downloadBtn.className = 'btn';
                            downloadBtn.textContent = '🔓 Decrypt and Download';
                            downloadBtn.onclick = async () => {
                                try {
                                    downloadBtn.disabled = true;
                                    downloadBtn.textContent = '⏳ Decrypting...';

                                    const filename = 'dogbox_file' + (fileExt || '');
                                    const blob = new Blob([decryptedData], { type: entry.mime_type || 'application/octet-stream' });
                                    const url = URL.createObjectURL(blob);
                                    const a = document.createElement('a');
                                    a.href = url;
                                    a.download = filename;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    URL.revokeObjectURL(url);

                                    downloadBtn.textContent = '✅ Downloaded!';
                                    setTimeout(() => {
                                        downloadBtn.disabled = false;
                                        downloadBtn.textContent = '🔓 Decrypt and Download';
                                    }, 2000);
                                } catch (err) {
                                    alert('Download failed: ' + err.message);
                                    downloadBtn.disabled = false;
                                    downloadBtn.textContent = '🔓 Decrypt and Download';
                                }
                            };
                            buttons.appendChild(downloadBtn);

                            // Play button for media
                            if (entry.mime_type && MediaUtils.isPlayableMedia(entry.mime_type)) {
                                const playBtn = document.createElement('button');
                                playBtn.className = 'btn';
                                playBtn.textContent = '▶️ Play in Browser';
                                playBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
                                playBtn.onclick = async () => {
                                    try {
                                        playBtn.disabled = true;
                                        const blob = new Blob([decryptedData], { type: entry.mime_type });
                                        const blobUrl = URL.createObjectURL(blob);

                                        // Create media player
                                        const playerDiv = document.createElement('div');
                                        playerDiv.style.cssText = 'margin-top: 15px; text-align: center;';

                                        if (entry.mime_type.startsWith('image/')) {
                                            const img = document.createElement('img');
                                            img.src = blobUrl;
                                            img.style.cssText = 'max-width: 100%; border-radius: 8px;';
                                            playerDiv.appendChild(img);
                                        } else if (entry.mime_type.startsWith('video/')) {
                                            const video = document.createElement('video');
                                            video.src = blobUrl;
                                            video.controls = true;
                                            video.style.cssText = 'max-width: 100%; border-radius: 8px;';
                                            playerDiv.appendChild(video);
                                        } else if (entry.mime_type.startsWith('audio/')) {
                                            const audio = document.createElement('audio');
                                            audio.src = blobUrl;
                                            audio.controls = true;
                                            audio.style.cssText = 'width: 100%;';
                                            playerDiv.appendChild(audio);
                                        }

                                        fileAttachment.appendChild(playerDiv);
                                        playBtn.disabled = true;
                                        playBtn.textContent = '✅ Playing';
                                    } catch (err) {
                                        alert('Playback failed: ' + err.message);
                                        playBtn.disabled = false;
                                    }
                                };
                                buttons.appendChild(playBtn);
                            }

                            fileAttachment.appendChild(icon);
                            fileAttachment.appendChild(info);
                            fileAttachment.appendChild(buttons);
                            entryDiv.appendChild(fileAttachment);
                        } else {
                            // Markdown content
                            timestamp.innerHTML = `📅 ${new Date(entry.appended_at).toLocaleString()} • 📝 Markdown`;
                            entryDiv.appendChild(timestamp);

                            const decryptedText = new TextDecoder().decode(decryptedData);
                            const content = document.createElement('div');
                            content.className = 'markdown-content';
                            content.innerHTML = marked.parse(decryptedText);
                            entryDiv.appendChild(content);
                        }

                        postDisplay.appendChild(entryDiv);
                    } catch (err) {
                        console.error('Failed to decrypt entry:', err);
                        const errorDiv = document.createElement('div');
                        errorDiv.style.cssText = 'background: #fee2e2; border: 2px solid #ef4444; border-radius: 8px; padding: 15px; margin: 10px 0;';
                        errorDiv.textContent = '❌ Failed to decrypt this entry';
                        postDisplay.appendChild(errorDiv);
                    }
                }

                // Add info footer
                const infoFooter = document.createElement('div');
                infoFooter.style.cssText = 'margin-top: 20px; padding-top: 15px; border-top: 2px solid #e5e7eb; color: #666; font-size: 0.9em;';
                infoFooter.innerHTML = `
                    <strong>Post Info:</strong><br/>
                    📊 Views: ${postData.view_count}<br/>
                    📅 Created: ${new Date(postData.uploaded_at).toLocaleString()}<br/>
                    ${postData.is_permanent ? '♾️ Permanent (never expires)' : `⏱️ Expires: ${new Date(postData.expires_at).toLocaleString()}`}
                `;
                postDisplay.appendChild(infoFooter);

                // Insert after status message
                status.parentNode.insertBefore(postDisplay, status.nextSibling);

                // Show append section for posts
                document.getElementById('appendSection').classList.add('show');
            } catch (error) {
                throw new Error('Failed to display post: ' + error.message);
            }
        }

        async function init() {
            try {
                // Extract file ID and key from URL
                const path = window.location.pathname;
                const pathParts = path.split('/');
                const pathType = pathParts[1]; // 'f' or 'p'
                const fileId = pathParts[2];
                const keyBase64 = window.location.hash.substring(1); // Remove #

                if (!keyBase64) {
                    throw new Error('No decryption key found in URL');
                }

                // Import key
                decryptionKey = await dogboxCrypto.importKey(keyBase64);

                // Determine if this is a post or file based on URL
                const isPost = pathType === 'p';

                if (isPost) {
                    // Fetch as post
                    const response = await fetch(`/api/posts/${fileId}`);
                    if (!response.ok) {
                        if (response.status === 404) {
                            throw new Error('Post not found or expired');
                        }
                        throw new Error('Failed to load post');
                    }
                    const postData = await response.json();
                    await handlePostView(postData);
                    return;
                } else {
                    // Fetch as file
                    const response = await fetch(`/api/files/${fileId}`);
                    if (!response.ok) {
                        if (response.status === 404) {
                            throw new Error('File not found or expired');
                        }
                        throw new Error('Failed to download file');
                    }

                    // Extract MIME type from response headers
                    mimeType = response.headers.get('content-type');

                    encryptedData = await response.arrayBuffer();

                    // Ready to decrypt
                    status.classList.remove('loading');
                    status.classList.add('ready');
                    statusText.textContent = '✅ File loaded successfully';
                    fileInfo.classList.add('show');
                    downloadBtn.disabled = false;

                    // Check if file is playable media and show play button
                    if (mimeType && MediaUtils.isPlayableMedia(mimeType)) {
                        playBtn.style.display = 'inline-block';
                        playBtn.disabled = false;
                    }
                }

            } catch (error) {
                status.classList.remove('loading');
                status.classList.add('error');
                statusText.textContent = '❌ ' + error.message;
            }
        }

        downloadBtn.addEventListener('click', async () => {
            try {
                downloadBtn.disabled = true;
                progress.style.display = 'block';
                progressFill.style.width = '0%';
                progressText.textContent = 'Decrypting...';

                // Decrypt file
                const decryptedData = await dogboxCrypto.decryptFile(encryptedData, decryptionKey);

                progressFill.style.width = '100%';
                progressText.textContent = 'Starting download...';

                // Determine file extension from MIME type
                const extension = MediaUtils.getExtensionFromMimeType(mimeType);
                const filename = 'dogbox_file' + extension;

                // Trigger download
                const blob = new Blob([decryptedData]);
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                progressText.textContent = 'Download complete!';

                setTimeout(() => {
                    progress.style.display = 'none';
                    downloadBtn.disabled = false;
                }, 1000);

            } catch (error) {
                alert('Decryption failed: ' + error.message);
                progress.style.display = 'none';
                downloadBtn.disabled = false;
            }
        });

        // Play button handler
        playBtn.addEventListener('click', async () => {
            try {
                playBtn.disabled = true;
                progress.style.display = 'block';
                progressFill.style.width = '0%';
                progressText.textContent = 'Decrypting...';

                // Decrypt file if not already decrypted
                if (!decryptedBlob) {
                    const decryptedData = await dogboxCrypto.decryptFile(encryptedData, decryptionKey);
                    decryptedBlob = new Blob([decryptedData], { type: mimeType });
                }

                progressFill.style.width = '100%';
                progressText.textContent = 'Loading media...';

                // Create blob URL
                const blobUrl = URL.createObjectURL(decryptedBlob);

                // Hide all players first
                imagePlayer.style.display = 'none';
                videoPlayer.style.display = 'none';
                audioPlayer.style.display = 'none';

                // Show appropriate player
                if (mimeType && mimeType.startsWith('image/')) {
                    imagePlayer.src = blobUrl;
                    imagePlayer.style.display = 'block';
                } else if (mimeType && mimeType.startsWith('video/')) {
                    videoPlayer.src = blobUrl;
                    videoPlayer.style.display = 'block';
                } else if (mimeType && mimeType.startsWith('audio/')) {
                    audioPlayer.src = blobUrl;
                    audioPlayer.style.display = 'block';
                }

                // Show media player
                mediaPlayer.style.display = 'block';
                progressText.textContent = 'Ready to play!';

                setTimeout(() => {
                    progress.style.display = 'none';
                    playBtn.disabled = false;
                }, 1000);

            } catch (error) {
                alert('Failed to play media: ' + error.message);
                progress.style.display = 'none';
                playBtn.disabled = false;
            }
        });

        // === APPEND FUNCTIONALITY ===

        let currentPostId = null;
        let currentAppendMode = 'markdown';
        let selectedFile = null;

        // Tab switching
        document.querySelectorAll('.append-mode-tab').forEach(tab => {
            tab.addEventListener('click', () => {
                const mode = tab.dataset.mode;
                currentAppendMode = mode;

                // Update tab styling
                document.querySelectorAll('.append-mode-tab').forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Show correct content area
                document.getElementById('markdownAppend').classList.remove('show');
                document.getElementById('fileAppend').classList.remove('show');
                document.getElementById(mode === 'markdown' ? 'markdownAppend' : 'fileAppend').classList.add('show');
            });
        });

        // File selection
        const fileDropZone = document.getElementById('fileDropZone');
        const fileInput = document.getElementById('fileInput');
        const selectedFileInfo = document.getElementById('selectedFileInfo');
        const selectedFileName = document.getElementById('selectedFileName');

        fileDropZone.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files.length > 0) {
                selectedFile = e.target.files[0];
                const fileName = selectedFile.name || 'unknown file';
                const fileSize = selectedFile.size || 0;
                selectedFileName.textContent = `${fileName} (${MediaUtils.formatFileSize(fileSize)})`;
                selectedFileInfo.style.display = 'block';
            }
        });

        // Drag and drop
        fileDropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            fileDropZone.classList.add('dragover');
        });

        fileDropZone.addEventListener('dragleave', () => {
            fileDropZone.classList.remove('dragover');
        });

        fileDropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            fileDropZone.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                selectedFile = e.dataTransfer.files[0];
                const fileName = selectedFile.name || 'unknown file';
                const fileSize = selectedFile.size || 0;
                selectedFileName.textContent = `${fileName} (${MediaUtils.formatFileSize(fileSize)})`;
                selectedFileInfo.style.display = 'block';
            }
        });

        // Append button handler
        document.getElementById('appendBtn').addEventListener('click', async () => {
            const appendKeyInput = document.getElementById('appendKeyInput');
            const appendKey = appendKeyInput.value.trim();
            const appendBtn = document.getElementById('appendBtn');
            const appendStatus = document.getElementById('appendStatus');

            // Make sure crypto is initialized
            if (!dogboxCrypto) {
                appendStatus.style.display = 'block';
                appendStatus.style.background = '#fee2e2';
                appendStatus.style.border = '2px solid #ef4444';
                appendStatus.textContent = '❌ Crypto library not ready. Please refresh the page.';
                return;
            }

            // Make sure we have a decryption key
            if (!decryptionKey) {
                appendStatus.style.display = 'block';
                appendStatus.style.background = '#fee2e2';
                appendStatus.style.border = '2px solid #ef4444';
                appendStatus.textContent = '❌ No decryption key found. Please make sure the URL includes #key.';
                return;
            }

            if (!appendKey) {
                appendStatus.style.display = 'block';
                appendStatus.style.background = '#fee2e2';
                appendStatus.style.border = '2px solid #ef4444';
                appendStatus.textContent = '❌ Please enter an append key';
                return;
            }

            if (!appendKey.startsWith('DOGBOX_KEY_APPEND_')) {
                appendStatus.style.display = 'block';
                appendStatus.style.background = '#fee2e2';
                appendStatus.style.border = '2px solid #ef4444';
                appendStatus.textContent = '❌ Invalid append key format';
                return;
            }

            try {
                appendBtn.disabled = true;
                appendStatus.style.display = 'block';
                appendStatus.style.background = '#dbeafe';
                appendStatus.style.border = '2px solid #3b82f6';
                appendStatus.textContent = '⏳ Encrypting and uploading...';

                let contentToAppend;
                let contentType;
                let mimeType = null;
                let fileExtension = null;
                let fileSize = null;

                if (currentAppendMode === 'markdown') {
                    const markdownText = document.getElementById('markdownTextarea').value;
                    if (!markdownText.trim()) {
                        throw new Error('Please enter some markdown content');
                    }
                    // Create a Blob for encryptFile (it expects a File/Blob)
                    contentToAppend = new Blob([markdownText], { type: 'text/plain' });
                    contentType = 'markdown';
                    mimeType = 'text/plain';
                } else {
                    if (!selectedFile) {
                        throw new Error('Please select a file to upload');
                    }
                    // Keep as File object for encryptFile (it needs the type property)
                    contentToAppend = selectedFile;
                    contentType = 'file';
                    mimeType = selectedFile.type || 'application/octet-stream';
                    fileExtension = (selectedFile.name && selectedFile.name.includes('.')) ?
                        '.' + selectedFile.name.split('.').pop() : null;
                    fileSize = selectedFile.size || 0;
                }

                // Encrypt the content
                const encryptedData = await dogboxCrypto.encryptFile(contentToAppend, decryptionKey);

                // Convert to base64
                const encryptedBytes = new Uint8Array(encryptedData);
                const base64Content = btoa(String.fromCharCode(...encryptedBytes));

                // Prepare request - only include defined values
                const requestBody = {
                    append_key: appendKey,
                    content: base64Content,
                    content_type: contentType
                };

                if (mimeType && mimeType !== '') {
                    requestBody.mime_type = mimeType;
                }
                if (fileExtension && fileExtension !== '') {
                    requestBody.file_extension = fileExtension;
                }
                if (fileSize !== null && fileSize !== undefined) {
                    requestBody.file_size = fileSize;
                }

                // Send to API
                const response = await fetch(`/api/posts/${currentPostId}/append`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(errorText || 'Failed to append content');
                }

                const result = await response.json();

                appendStatus.style.background = '#d1fae5';
                appendStatus.style.border = '2px solid #10b981';
                appendStatus.textContent = `✅ Content appended successfully! Refresh the page to see it.`;

                // Clear inputs
                document.getElementById('markdownTextarea').value = '';
                selectedFile = null;
                fileInput.value = '';
                selectedFileInfo.style.display = 'none';

                setTimeout(() => {
                    appendBtn.disabled = false;
                }, 2000);

            } catch (error) {
                appendStatus.style.display = 'block';
                appendStatus.style.background = '#fee2e2';
                appendStatus.style.border = '2px solid #ef4444';
                appendStatus.textContent = '❌ ' + error.message;
                appendBtn.disabled = false;
            }
        });

        // Initialize on load (wait for post-quantum library)
        async function waitForLibraryAndInit() {
            // Initialize crypto first
            await initCrypto();

            // Extract post ID for append functionality
            const path = window.location.pathname;
            const pathParts = path.split('/');
            currentPostId = pathParts[2]; // The ID is always at index 2 for /f/:id or /p/:id

            init();
        }
        waitForLibraryAndInit();

        // Initialize page (load navbar and banners)
        initializePage();
