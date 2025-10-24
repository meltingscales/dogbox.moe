/**
 * dogbox.moe Client-Side Encryption Library
 *
 * Implements hybrid post-quantum encryption:
 * - ML-KEM-1024 (NIST FIPS 203) for post-quantum key encapsulation
 * - AES-256-GCM for symmetric encryption (128-bit auth tags)
 * - SHA-256 for hashing (BLAKE3 planned)
 *
 * How it works:
 * 1. Generate ML-KEM-1024 keypair (public/secret)
 * 2. Encapsulate using public key → produces ciphertext + 32-byte shared secret
 * 3. Use shared secret to derive AES-256 key
 * 4. Encrypt file with AES-256-GCM
 * 5. Store ML-KEM ciphertext + secret key in URL (allows decapsulation)
 *
 * Security model: Zero-knowledge
 * - Encryption happens entirely in the browser
 * - Keys never leave the client
 * - Server only sees encrypted blobs
 * - URL contains: DOGBOX_KEY_SYMMETRIC_<base64(kemSecretKey || kemCiphertext)>
 *
 * Post-quantum security:
 * - Protected against Shor's algorithm (breaks RSA/ECC)
 * - ML-KEM-1024 provides ~256-bit classical security, ~192-bit quantum security
 * - Maximum security level available in NIST FIPS 203
 * - Future-proof against quantum computers
 *
 * Privacy features:
 * - Automatic EXIF/metadata stripping from images (JPEG, PNG, GIF, WebP)
 * - No GPS, camera data, or timestamps exposed
 *
 * Dependencies:
 * - @noble/post-quantum v0.2.0 (ML-KEM-1024 implementation)
 * - Pinned via unpkg CDN: https://unpkg.com/@noble/post-quantum@0.2.0/esm/ml-kem.js
 * - SHA-256: CeJlciQZTjtmql3xOG0+mocmNKM2nuYlWd0jATqxaNc=
 * - Requires @noble/hashes v1.3.3 for SHA-3 support
 * - Uses import map to resolve bare module specifiers
 */

class DogboxCrypto {
    constructor() {
        // Check for required browser APIs
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Web Crypto API not available');
        }
    }

    /**
     * Generate post-quantum hybrid encryption keypair
     * Uses ML-KEM-1024 for maximum security key encapsulation
     * Returns: { publicKey, secretKey } with the secret key containing both
     *          the ML-KEM secret key and the encapsulated ciphertext
     */
    async generateKey() {
        if (!window.noblePostQuantum || !window.noblePostQuantum.ml_kem1024) {
            throw new Error('Post-quantum library not loaded. Page must include @noble/post-quantum with ml_kem1024.');
        }

        // Generate ML-KEM-1024 keypair
        const kemKeyPair = window.noblePostQuantum.ml_kem1024.keygen();

        // Encapsulate to get shared secret and ciphertext
        const { cipherText, sharedSecret } = window.noblePostQuantum.ml_kem1024.encapsulate(kemKeyPair.publicKey);

        // Derive AES-256 key from the shared secret (use first 32 bytes)
        const aesKeyData = sharedSecret.slice(0, 32);

        // Import as Web Crypto key
        const aesKey = await crypto.subtle.importKey(
            'raw',
            aesKeyData,
            { name: 'AES-GCM', length: 256 },
            false, // not extractable for security
            ['encrypt', 'decrypt']
        );

        // Return hybrid key structure
        return {
            aesKey: aesKey,
            kemSecretKey: kemKeyPair.secretKey,
            kemCiphertext: cipherText
        };
    }

    /**
     * Generate post-quantum key pair using ML-KEM-768
     * Requires @noble/post-quantum library to be loaded
     * Returns: { publicKey, secretKey } as Uint8Array
     */
    async generatePQKeyPair() {
        if (!window.noblePostQuantum || !window.noblePostQuantum.ml_kem768) {
            throw new Error('Post-quantum library (@noble/post-quantum) not loaded. Include: <script type="module">import { ml_kem768 } from "https://unpkg.com/@noble/post-quantum@0.2.0/esm/ml-kem.js"; window.noblePostQuantum = { ml_kem768 };</script>');
        }

        const keyPair = window.noblePostQuantum.ml_kem768.keygen();
        return {
            publicKey: keyPair.publicKey,
            secretKey: keyPair.secretKey
        };
    }

    /**
     * Encapsulate a shared secret using ML-KEM-768 public key
     * Returns: { ciphertext: Uint8Array, sharedSecret: Uint8Array }
     */
    async pqEncapsulate(publicKey) {
        if (!window.noblePostQuantum || !window.noblePostQuantum.ml_kem768) {
            throw new Error('Post-quantum library not loaded');
        }

        const result = window.noblePostQuantum.ml_kem768.encapsulate(publicKey);
        return {
            ciphertext: result.ciphertext,
            sharedSecret: result.sharedSecret
        };
    }

    /**
     * Decapsulate a shared secret using ML-KEM-768 secret key
     * Returns: Uint8Array (shared secret)
     */
    async pqDecapsulate(ciphertext, secretKey) {
        if (!window.noblePostQuantum || !window.noblePostQuantum.ml_kem768) {
            throw new Error('Post-quantum library not loaded');
        }

        return window.noblePostQuantum.ml_kem768.decapsulate(ciphertext, secretKey);
    }

    /**
     * Export hybrid key to base64 for URL fragment
     * Encodes: ML-KEM secret key + ML-KEM ciphertext
     * Format: kemSecretKey || kemCiphertext (concatenated then base64 encoded)
     * Adds DOGBOX_KEY_SYMMETRIC_ prefix for clarity
     */
    async exportKey(hybridKey) {
        // Concatenate KEM secret key (1632 bytes) and ciphertext (1088 bytes)
        const combined = new Uint8Array(hybridKey.kemSecretKey.length + hybridKey.kemCiphertext.length);
        combined.set(hybridKey.kemSecretKey, 0);
        combined.set(hybridKey.kemCiphertext, hybridKey.kemSecretKey.length);

        const base64 = this.arrayBufferToBase64(combined.buffer);
        return `DOGBOX_KEY_SYMMETRIC_${base64}`;
    }

    /**
     * Import hybrid key from base64
     * Decodes the ML-KEM secret key and ciphertext, then re-derives the AES key
     * Handles both prefixed (DOGBOX_KEY_SYMMETRIC_) and legacy formats
     */
    async importKey(base64Key) {
        if (!window.noblePostQuantum || !window.noblePostQuantum.ml_kem1024) {
            throw new Error('Post-quantum library not loaded');
        }

        // Remove prefix if present
        let cleanKey = base64Key;
        if (base64Key.startsWith('DOGBOX_KEY_SYMMETRIC_')) {
            cleanKey = base64Key.substring('DOGBOX_KEY_SYMMETRIC_'.length);
        }

        const combinedData = new Uint8Array(this.base64ToArrayBuffer(cleanKey));

        // ML-KEM-1024 secret key is 3168 bytes, ciphertext is 1568 bytes
        const kemSecretKeyLength = 3168;
        const kemSecretKey = combinedData.slice(0, kemSecretKeyLength);
        const kemCiphertext = combinedData.slice(kemSecretKeyLength);

        // Decapsulate to recover shared secret
        const sharedSecret = window.noblePostQuantum.ml_kem1024.decapsulate(kemCiphertext, kemSecretKey);

        // Derive AES-256 key from shared secret (first 32 bytes)
        const aesKeyData = sharedSecret.slice(0, 32);

        // Import as Web Crypto key
        const aesKey = await crypto.subtle.importKey(
            'raw',
            aesKeyData,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );

        return {
            aesKey: aesKey,
            kemSecretKey: kemSecretKey,
            kemCiphertext: kemCiphertext
        };
    }

    /**
     * Strip metadata from PNG images for privacy
     * Note: Only PNG and WebM files should reach this point
     * Conversion happens before encryption
     */
    async stripMetadata(file) {
        // Only process PNG images (WebM already has metadata stripped during conversion)
        if (file.type.toLowerCase() !== 'image/png') {
            return file;
        }

        try {
            // Load image into canvas
            const img = await this.loadImage(file);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);

            // Convert canvas back to PNG blob without metadata (lossless)
            const blob = await new Promise((resolve) => {
                canvas.toBlob(resolve, 'image/png', 1.0);
            });

            // Return new file without metadata
            return new File([blob], file.name, { type: 'image/png' });
        } catch (err) {
            console.warn('Failed to strip metadata, using original file:', err);
            return file;
        }
    }

    loadImage(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    }

    /**
     * Encrypt file with post-quantum hybrid authenticated encryption
     * Uses AES-256-GCM with key derived from ML-KEM-768
     * Returns: ArrayBuffer (IV prepended to ciphertext)
     */
    async encryptFile(file, hybridKey) {
        // Strip metadata from images before encryption
        const cleanFile = await this.stripMetadata(file);

        // Read file as ArrayBuffer
        const fileData = await this.readFileAsArrayBuffer(cleanFile);

        // Generate random IV (96 bits for GCM)
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Encrypt using the AES key from the hybrid key structure
        const ciphertext = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                tagLength: 128 // 128-bit authentication tag
            },
            hybridKey.aesKey,
            fileData
        );

        // Prepend IV to ciphertext for storage
        const result = new Uint8Array(iv.length + ciphertext.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(ciphertext), iv.length);

        return result.buffer;
    }

    /**
     * Decrypt file using post-quantum hybrid key
     * Uses AES-256-GCM with key derived from ML-KEM-768
     */
    async decryptFile(encryptedData, hybridKey) {
        const data = new Uint8Array(encryptedData);

        // Extract IV (first 12 bytes)
        const iv = data.slice(0, 12);
        const ciphertext = data.slice(12);

        // Decrypt using the AES key from the hybrid key structure
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                tagLength: 128
            },
            hybridKey.aesKey,
            ciphertext
        );

        return decrypted;
    }

    /**
     * Hash data using SubtleCrypto (SHA-256 as fallback for BLAKE3)
     * In production, use WASM-compiled BLAKE3
     */
    async hash(data) {
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return this.arrayBufferToHex(hashBuffer);
    }

    // Utility functions

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary)
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, ''); // URL-safe base64
    }

    base64ToArrayBuffer(base64) {
        // Add padding
        base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
        while (base64.length % 4) {
            base64 += '=';
        }

        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    arrayBufferToHex(buffer) {
        return Array.from(new Uint8Array(buffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }
}

// Export for use in browser
if (typeof window !== 'undefined') {
    window.DogboxCrypto = DogboxCrypto;
}
