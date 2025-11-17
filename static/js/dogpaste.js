/**
 * Dogpaste - Encrypted Pastebin with PBKDF2-based encryption
 *
 * Security Model:
 * - Uses 10-character alphanumeric codes (a-zA-Z0-9) as passwords
 * - PBKDF2 with 100,000 iterations to derive AES-256 key
 * - AES-256-GCM for authenticated encryption
 * - Client-side only encryption/decryption
 *
 * Warning: 62^10 possible combinations (~839 quadrillion)
 * This is NOT cryptographically secure like the main upload feature!
 * Use only for non-sensitive data.
 */

class DogpasteClient {
    constructor() {
        this.PBKDF2_ITERATIONS = 100000;
        this.CODE_LENGTH = 6;  // 6 chars for encryption key
        this.ID_LENGTH = 5;     // 5 chars for paste ID
        // Human-friendly charset: excludes 0, O, 1, l, I (ambiguous characters)
        this.CHARSET = '23456789abcdefghjkmnpqrstuvwxyz';
    }

    /**
     * Generate a random alphanumeric string of given length
     */
    generateRandomString(length) {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);

        let result = '';
        for (let i = 0; i < length; i++) {
            result += this.CHARSET[array[i] % this.CHARSET.length];
        }
        return result;
    }

    /**
     * Generate encryption key
     */
    generateCode() {
        return this.generateRandomString(this.CODE_LENGTH);
    }

    /**
     * Generate paste ID
     */
    generateId() {
        return this.generateRandomString(this.ID_LENGTH);
    }

    /**
     * Derive AES-256 key from code using PBKDF2
     */
    async deriveKey(code, salt) {
        // Import the code as a key
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(code),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        // Derive AES-256 key
        return await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: salt,
                iterations: this.PBKDF2_ITERATIONS,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt text with a generated code
     * Returns: { encrypted: Uint8Array, code: string }
     */
    async encrypt(text) {
        const code = this.generateCode();

        // Generate salt and IV
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Derive key from code
        const key = await this.deriveKey(code, salt);

        // Encrypt the text
        const encoder = new TextEncoder();
        const encrypted = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv
            },
            key,
            encoder.encode(text)
        );

        // Combine salt + iv + encrypted data
        const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
        combined.set(salt, 0);
        combined.set(iv, salt.length);
        combined.set(new Uint8Array(encrypted), salt.length + iv.length);

        return {
            encrypted: combined,
            code: code
        };
    }

    /**
     * Decrypt data with a code
     * Returns: decrypted text
     */
    async decrypt(encryptedData, code) {
        // Extract salt, IV, and ciphertext
        const data = new Uint8Array(encryptedData);
        const salt = data.slice(0, 16);
        const iv = data.slice(16, 28);
        const ciphertext = data.slice(28);

        // Derive key from code
        const key = await this.deriveKey(code, salt);

        try {
            // Decrypt
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: 'AES-GCM',
                    iv: iv
                },
                key,
                ciphertext
            );

            return new TextDecoder().decode(decrypted);
        } catch (e) {
            throw new Error('Failed to decrypt: invalid code or corrupted data');
        }
    }

    /**
     * Base64 encode for URL safety
     */
    toBase64(data) {
        return btoa(String.fromCharCode(...new Uint8Array(data)))
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }

    /**
     * Base64 decode from URL-safe format
     */
    fromBase64(str) {
        str = str.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) {
            str += '=';
        }
        const binary = atob(str);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
    }
}

// Initialize the client
const dogpaste = new DogpasteClient();

// UI Elements
const createMode = document.getElementById('createMode');
const viewMode = document.getElementById('viewMode');
const pasteContent = document.getElementById('pasteContent');
const createBtn = document.getElementById('createBtn');
const loading = document.getElementById('loading');
const result = document.getElementById('result');
const shareLink = document.getElementById('shareLink');
const copyLinkBtn = document.getElementById('copyLinkBtn');
const anotherPasteBtn = document.getElementById('anotherPasteBtn');
const newPasteBtn = document.getElementById('newPasteBtn');
const loadingView = document.getElementById('loadingView');
const pasteDisplay = document.getElementById('pasteDisplay');

// Check if we're viewing a paste (hash in URL)
if (window.location.hash && window.location.hash.length > 1) {
    // View mode
    createMode.style.display = 'none';
    viewMode.style.display = 'block';
    viewPaste();
} else {
    // Create mode
    createMode.style.display = 'block';
    viewMode.style.display = 'none';
}

// Create paste button
createBtn.addEventListener('click', async () => {
    const text = pasteContent.value.trim();

    if (!text) {
        alert('Please enter some text to paste');
        return;
    }

    try {
        createBtn.disabled = true;
        loading.style.display = 'block';

        // Encrypt the text once (encryption generates its own code)
        const { encrypted, code } = await dogpaste.encrypt(text);
        const encryptedB64 = dogpaste.toBase64(encrypted);

        // Retry logic for ID collisions (max 5 attempts)
        let success = false;
        let finalId = null;

        for (let attempt = 0; attempt < 5 && !success; attempt++) {
            // Generate new ID for each attempt
            const id = dogpaste.generateId();

            try {
                // Upload encrypted data to dogpaste API
                const response = await fetch('/api/dogpaste', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        id: id,
                        encrypted_data: encryptedB64
                    })
                });

                if (response.ok) {
                    finalId = id;
                    success = true;
                } else if (response.status === 400) {
                    // Check if it's a collision
                    const errorData = await response.json();
                    if (errorData.error && errorData.error.includes('collision')) {
                        // Collision - try again with new ID
                        console.log(`ID collision on attempt ${attempt + 1}, retrying...`);
                        continue;
                    } else {
                        throw new Error(errorData.error || 'Upload failed');
                    }
                } else {
                    throw new Error(`Upload failed: ${response.status}`);
                }
            } catch (err) {
                if (attempt === 4) {
                    throw err; // Final attempt failed
                }
                // Otherwise continue to next attempt
            }
        }

        if (!success) {
            throw new Error('Failed to create paste after 5 attempts. Please try again.');
        }

        // Create share URL with combined code (code + id = 11 chars total)
        const fullCode = code + finalId;
        const url = `${window.location.origin}/dogpaste#${fullCode}`;

        // Show result
        shareLink.value = url;
        result.classList.add('show');
        pasteContent.value = '';
        loading.style.display = 'none';
        createBtn.disabled = false;

    } catch (error) {
        console.error('Error creating paste:', error);
        alert('Failed to create paste: ' + error.message);
        loading.style.display = 'none';
        createBtn.disabled = false;
    }
});

// Copy link button
copyLinkBtn.addEventListener('click', () => {
    shareLink.select();
    navigator.clipboard.writeText(shareLink.value);
    copyLinkBtn.textContent = 'Copied!';
    setTimeout(() => {
        copyLinkBtn.textContent = 'Copy';
    }, 2000);
});

// Another paste button
anotherPasteBtn.addEventListener('click', () => {
    result.classList.remove('show');
    pasteContent.value = '';
    window.location.hash = '';
    createMode.style.display = 'block';
    viewMode.style.display = 'none';
});

// New paste button
newPasteBtn.addEventListener('click', () => {
    window.location.hash = '';
    window.location.reload();
});

// View paste function
async function viewPaste() {
    try {
        // Parse hash: #CODEID (6 chars code + 5 chars ID = 11 chars total)
        const hash = window.location.hash.substring(1);

        if (hash.length !== 11) {
            throw new Error('Invalid paste URL. Expected 11 characters.');
        }

        // Split into code (first 6 chars) and ID (last 5 chars)
        const code = hash.substring(0, 6);
        const id = hash.substring(6);

        // Download encrypted data from dogpaste API
        const response = await fetch(`/api/dogpaste/${id}`);

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('Paste not found or expired');
            }
            throw new Error(`Failed to download paste: ${response.status}`);
        }

        const data = await response.json();
        const encryptedData = dogpaste.fromBase64(data.encrypted_data);

        // Decrypt
        const decryptedText = await dogpaste.decrypt(encryptedData, code);

        // Display
        loadingView.style.display = 'none';
        pasteDisplay.textContent = decryptedText;
        pasteDisplay.style.display = 'block';
        newPasteBtn.style.display = 'block';

    } catch (error) {
        console.error('Error viewing paste:', error);
        loadingView.innerHTML = `
            <p style="color: #dc2626; font-weight: bold;">❌ Failed to load paste</p>
            <p style="color: #666; margin-top: 10px;">${error.message}</p>
        `;
        newPasteBtn.style.display = 'block';
    }
}
