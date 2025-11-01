/**
 * Index Page Initialization
 *
 * Handles upload page logic including:
 * - File uploads and drag-and-drop
 * - Markdown post creation
 * - Progress tracking
 * - Result display
 */

// Initialize page branding
if (window.DogboxConfig) {
    document.getElementById('page-logo').textContent = DogboxConfig.logo;
    document.getElementById('page-sitename').textContent = DogboxConfig.siteName;
    document.getElementById('page-tagline').textContent = DogboxConfig.tagline;
}

console.log('[Main] Initializing dogbox upload system...');

const dogboxCrypto = new DogboxCrypto();
const converter = new FormatConverter();
const uploadHandler = new UploadHandler(dogboxCrypto, converter);

// Test BLAKE3 WASM is working
(async () => {
    const testData = new TextEncoder().encode("hello world");
    const hash = await dogboxCrypto.hash(testData);
    const expectedBlake3 = "d74981efa70a0c880b8d8c1985d075dbcbf679b99a5f9914e5aaf96b831a9e24";
    const expectedSha256 = "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9";

    if (hash === expectedBlake3) {
        console.log('[Crypto] ✓ BLAKE3 WASM active (10-15x faster than SHA-256)');
    } else if (hash === expectedSha256) {
        console.warn('[Crypto] ⚠ Using SHA-256 fallback (BLAKE3 failed to load)');
    } else {
        console.error('[Crypto] ✗ Hash verification failed:', hash);
    }
})();

const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const progress = document.getElementById("progress");
const progressFill = document.getElementById("progressFill");
const progressText = document.getElementById("progressText");
const result = document.getElementById("result");
const shareLink = document.getElementById("shareLink");
const converterNotice = document.getElementById("converterNotice");

console.log('[Main] Upload system initialized');

// Click to upload
uploadArea.addEventListener("click", () => fileInput.click());

// Drag and drop
uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.classList.add("dragover");
});

uploadArea.addEventListener("dragleave", () => {
    uploadArea.classList.remove("dragover");
});

uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    uploadArea.classList.remove("dragover");
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        console.log('[Main] File dropped:', files[0].name);
        uploadHandler.handleFile(files[0], callbacks);
    }
});

// Callback functions for upload handler
let lastProgressLog = 0; // Track last progress log time
const callbacks = {
    showConverterNotice: (file) => {
        console.log('[Main] Showing converter notice for:', file.name, file.type);
        document.getElementById('originalFileName').textContent = file.name;
        document.getElementById('originalFileType').textContent = file.type;
        converterNotice.classList.add('show');
    },

    hideConverterNotice: () => {
        console.log('[Main] Hiding converter notice');
        converterNotice.classList.remove('show');
    },

    showProgress: () => {
        console.log('[Main] Showing progress bar');
        progress.style.display = "block";
        lastProgressLog = 0; // Reset progress log throttle
    },

    hideProgress: () => {
        console.log('[Main] Hiding progress bar');
        progress.style.display = "none";
    },

    updateProgress: (percent, text) => {
        // Always update the UI
        progressFill.style.width = percent + "%";
        progressText.textContent = text;

        // Only log progress every 5 seconds
        const now = Date.now();
        if (now - lastProgressLog >= 5000) {
            console.log('[Main] Progress update:', percent.toFixed(1) + '%', text);
            lastProgressLog = now;
        }
    },

    showResult: (url, data) => {
        console.log('[Main] Showing result, URL length:', url.length);
        shareLink.value = url;
        result.classList.add("show");
        updateResultDisplay(data);
    },

    hideResult: () => {
        console.log('[Main] Hiding result');
        result.classList.remove("show");
    },

    resetFileInput: () => {
        console.log('[Main] Resetting file input');
        fileInput.value = '';
    },

    getPostType: () => {
        const value = document.getElementById("postType").value;
        console.log('[Main] getPostType:', value);
        return value;
    },

    getIsPermanent: () => {
        const value = document.getElementById("isPermanent").checked;
        console.log('[Main] getIsPermanent:', value);
        return value;
    },

    getExpiryHours: () => {
        const value = document.getElementById("expiryHours").value;
        console.log('[Main] getExpiryHours:', value);
        return value;
    }
};

// File selection
fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        console.log('[Main] File selected:', e.target.files[0].name);
        uploadHandler.handleFile(e.target.files[0], callbacks);
    }
});

// Show/hide markdown input and upload area based on post type
const postTypeSelect = document.getElementById("postType");
const markdownInputDiv = document.getElementById("markdownInput");
const markdownContentTextarea = document.getElementById("markdownContent");

postTypeSelect.addEventListener("change", () => {
    if (postTypeSelect.value === "post") {
        // Show markdown input, hide file upload area
        markdownInputDiv.style.display = "block";
        uploadArea.style.display = "none";
        converterNotice.style.display = "none";

        // Clear any pending file since posts don't use file upload
        uploadHandler.pendingFile = null;
        const fileInput = document.getElementById("fileInput");
        if (fileInput) fileInput.value = '';
    } else {
        // Show file upload area, hide markdown input
        markdownInputDiv.style.display = "none";
        uploadArea.style.display = "block";
        // Note: converterNotice visibility is managed by upload handler
    }
});

// Add markdown getter to callbacks
callbacks.getMarkdownContent = () => {
    const value = markdownContentTextarea.value.trim();
    console.log('[Main] getMarkdownContent:', value ? `${value.length} chars` : 'empty');
    return value;
};

// Handle markdown-only post submission
const submitMarkdownBtn = document.getElementById("submitMarkdownBtn");
submitMarkdownBtn.addEventListener("click", async () => {
    const markdownContent = markdownContentTextarea.value.trim();
    if (!markdownContent) {
        alert('Please write some markdown content before creating a post.');
        return;
    }

    // Create a dummy file object with the markdown content
    const markdownBlob = new Blob([markdownContent], { type: 'text/plain' });
    const dummyFile = new File([markdownBlob], 'post.md', { type: 'text/plain' });

    console.log('[Main] Submitting markdown-only post');
    await uploadHandler.uploadFile(dummyFile, callbacks);
});

function copyLink() {
    shareLink.select();
    document.execCommand("copy");
    alert("Link copied to clipboard!");
}

function updateResultDisplay(data) {
    const resultDiv = document.getElementById("result");
    const isPost = data.post_type === "post";
    const isPermanent = data.is_permanent;

    // Update the result message
    let message = `<h3>✅ ${isPost ? 'Post' : 'File'} uploaded successfully!</h3>`;

    if (isPost && data.post_append_key) {
        message += `
            <div style="background: #dbeafe; padding: 15px; border-radius: 8px; margin: 15px 0;">
                <strong>📝 Post Append Key:</strong><br/>
                <code style="word-break: break-all; background: white; padding: 5px;">${data.post_append_key}</code>
                <p style="margin-top: 10px; font-size: 0.9em;">
                    Save this key! You'll need it to add more content to this post.
                </p>
            </div>
        `;
    }

    resultDiv.querySelector('h3').outerHTML = message;

    // Update expiry message
    const warningBox = resultDiv.querySelector('.warning');
    if (isPermanent) {
        warningBox.innerHTML = `
            ℹ️ <strong>Permanent ${isPost ? 'Post' : 'File'}:</strong>
            This will never auto-delete. Use the deletion token to remove it manually.
        `;
        warningBox.style.background = '#dbeafe';
        warningBox.style.borderColor = '#3b82f6';
    } else {
        warningBox.innerHTML = `
            ⚠️ <strong>Save this link!</strong> There's no way to recover it if you lose it.
            The ${isPost ? 'post' : 'file'} will auto-delete ${data.expires_at ? 'at ' + new Date(data.expires_at).toLocaleString() : 'after expiration'}.
        `;
    }
}

// Handle permanent checkbox toggle
document.getElementById("isPermanent").addEventListener("change", (e) => {
    const expiryRow = document.getElementById("expiryRow");
    expiryRow.style.display = e.target.checked ? "none" : "block";
});

// Initialize page (load navbar and banners)
initializePage();

// Event listeners for buttons that were using onclick
document.getElementById('copyLinkBtn').addEventListener('click', copyLink);
document.getElementById('convertAndUploadBtn').addEventListener('click', () => {
    uploadHandler.convertAndUpload(callbacks);
});
document.getElementById('cancelConversionBtn').addEventListener('click', () => {
    uploadHandler.cancelConversion(callbacks);
});
