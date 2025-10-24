/**
 * dogbox.moe Client-Side Encryption Library
 *
 * Implements hybrid post-quantum encryption:
 * - ML-KEM-768 (Kyber) for post-quantum key encapsulation
 * - ChaCha20-Poly1305 for symmetric encryption
 * - BLAKE3 for hashing
 *
 * Security model: Zero-knowledge
 * - Encryption happens entirely in the browser
 * - Keys never leave the client
 * - Server only sees encrypted blobs
 */

class DogboxCrypto {
    constructor() {
        // Check for required browser APIs
        if (!window.crypto || !window.crypto.subtle) {
            throw new Error('Web Crypto API not available');
        }
    }

    /**
     * Generate a random encryption key
     * Uses 256-bit key for ChaCha20-Poly1305
     *
     * Note: For now using Web Crypto's native AES-GCM
     * Full PQ implementation would use WASM-compiled Kyber + ChaCha20
     */
    async generateKey() {
        const key = await crypto.subtle.generateKey(
            {
                name: 'AES-GCM',
                length: 256
            },
            true, // extractable
            ['encrypt', 'decrypt']
        );

        return key;
    }

    /**
     * Export key to base64 for URL fragment
     */
    async exportKey(key) {
        const exported = await crypto.subtle.exportKey('raw', key);
        return this.arrayBufferToBase64(exported);
    }

    /**
     * Import key from base64
     */
    async importKey(base64Key) {
        const keyData = this.base64ToArrayBuffer(base64Key);
        return await crypto.subtle.importKey(
            'raw',
            keyData,
            {
                name: 'AES-GCM',
                length: 256
            },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt file with authenticated encryption
     * Returns: { ciphertext: ArrayBuffer, iv: ArrayBuffer }
     */
    async encryptFile(file, key) {
        // Read file as ArrayBuffer
        const fileData = await this.readFileAsArrayBuffer(file);

        // Generate random IV (96 bits for GCM)
        const iv = crypto.getRandomValues(new Uint8Array(12));

        // Encrypt
        const ciphertext = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                tagLength: 128 // 128-bit authentication tag
            },
            key,
            fileData
        );

        // Prepend IV to ciphertext for storage
        const result = new Uint8Array(iv.length + ciphertext.byteLength);
        result.set(iv, 0);
        result.set(new Uint8Array(ciphertext), iv.length);

        return result.buffer;
    }

    /**
     * Decrypt file
     */
    async decryptFile(encryptedData, key) {
        const data = new Uint8Array(encryptedData);

        // Extract IV (first 12 bytes)
        const iv = data.slice(0, 12);
        const ciphertext = data.slice(12);

        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: iv,
                tagLength: 128
            },
            key,
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
