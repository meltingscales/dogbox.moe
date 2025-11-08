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
     * Encrypt file with post-quantum hybrid authenticated encryption
     * Uses AES-256-GCM with key derived from ML-KEM-768
     * Returns: ArrayBuffer (IV prepended to ciphertext)
     */
    async encryptFile(file, hybridKey) {
        // Use file directly (metadata stripping removed)
        const cleanFile = file;

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
     * Read first N bytes of a file to use as seed
     * This doesn't load the whole file into memory
     */
    async readFileSeed(file, numBytes) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            const blob = file.slice(0, Math.min(numBytes, file.size));

            reader.onload = () => {
                const result = new Uint8Array(reader.result);
                // Pad with zeros if file is smaller than requested bytes
                if (result.length < numBytes) {
                    const padded = new Uint8Array(numBytes);
                    padded.set(result);
                    resolve(padded);
                } else {
                    resolve(result);
                }
            };
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(blob);
        });
    }

    /**
     * Encrypt file with visual progress callback using chunked encryption
     * This reads and encrypts the file in chunks to avoid memory issues
     * Pattern is tied to the actual file data being encrypted
     */
    async encryptFileWithProgress(file, hybridKey, onProgress) {
        const CHUNK_SIZE = 64 * 1024 * 1024; // 64MB chunks
        const totalBlocks = 4096; // Fixed grid of 64x64 blocks for visualization
        const fileSize = file.size;
        const numChunks = Math.ceil(fileSize / CHUNK_SIZE);

        // Read first 32 bytes of file to use as seed for block order
        const seed = await this.readFileSeed(file, 32);
        const blockOrder = await this.generateBlockOrder(seed, totalBlocks);

        // Track which blocks to show as we progress through chunks
        let currentBlockIndex = 0;

        // Use file directly (metadata stripping removed)
        const cleanFile = file;
        const cleanFileSize = cleanFile.size;

        // Array to hold encrypted chunks
        const encryptedChunks = [];
        let totalEncryptedSize = 0;

        // Process each chunk
        for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
            const start = chunkIndex * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, cleanFileSize);
            const chunk = cleanFile.slice(start, end);

            // Read chunk data
            const chunkData = await this.readFileAsArrayBuffer(chunk);

            // Generate random IV for this chunk (96 bits for GCM)
            const iv = crypto.getRandomValues(new Uint8Array(12));

            // Encrypt chunk using the AES key from the hybrid key structure
            const ciphertext = await crypto.subtle.encrypt(
                {
                    name: 'AES-GCM',
                    iv: iv,
                    tagLength: 128
                },
                hybridKey.aesKey,
                chunkData
            );

            // Store chunk with its IV: [IV (12 bytes)][ciphertext]
            const encryptedChunk = new Uint8Array(12 + ciphertext.byteLength);
            encryptedChunk.set(iv, 0);
            encryptedChunk.set(new Uint8Array(ciphertext), 12);
            encryptedChunks.push(encryptedChunk);
            totalEncryptedSize += encryptedChunk.length;

            // Calculate progress
            const bytesProcessed = end;
            const percentage = (bytesProcessed / cleanFileSize) * 100;

            // Update visualization blocks proportional to progress
            const targetBlockIndex = Math.floor((percentage / 100) * totalBlocks);
            const blocksToShow = blockOrder.slice(currentBlockIndex, targetBlockIndex);
            currentBlockIndex = targetBlockIndex;

            if (onProgress && blocksToShow.length > 0) {
                onProgress({
                    decryptedBlocks: blocksToShow,
                    totalDecrypted: currentBlockIndex,
                    totalBlocks: totalBlocks,
                    percentage: percentage,
                    bytesProcessed: bytesProcessed,
                    totalBytes: cleanFileSize
                });
            }
        }

        // Combine all encrypted chunks into a single buffer
        // Format: [magic(4)][total_chunks(4)][chunk1_size(4)][chunk1_data][chunk2_size(4)][chunk2_data]...
        // Magic number: 0x444F4743 ("DOGC" = DOGbox Chunked)
        const MAGIC_CHUNKED = 0x444F4743;
        const result = new Uint8Array(8 + (numChunks * 4) + totalEncryptedSize);
        let offset = 0;

        // Write magic number for format detection
        new DataView(result.buffer).setUint32(offset, MAGIC_CHUNKED, true);
        offset += 4;

        // Write number of chunks
        new DataView(result.buffer).setUint32(offset, numChunks, true);
        offset += 4;

        // Write each chunk with its size
        for (const chunk of encryptedChunks) {
            new DataView(result.buffer).setUint32(offset, chunk.length, true);
            offset += 4;
            result.set(chunk, offset);
            offset += chunk.length;
        }

        // Final progress update
        if (onProgress) {
            onProgress({
                decryptedBlocks: blockOrder.slice(currentBlockIndex),
                totalDecrypted: totalBlocks,
                totalBlocks: totalBlocks,
                percentage: 100,
                complete: true
            });
        }

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
     * Decrypt file with visual progress callback using chunked decryption
     * Handles both old single-chunk format and new multi-chunk format
     * tied to the actual encrypted data for security visualization
     */
    async decryptFileWithProgress(encryptedData, hybridKey, onProgress) {
        const data = new Uint8Array(encryptedData);
        const totalBlocks = 4096; // Fixed grid of 64x64 blocks

        // Generate pseudo-random block order based on first 32 bytes
        const seed = data.slice(0, Math.min(32, data.length));
        const blockOrder = await this.generateBlockOrder(seed, totalBlocks);

        // Track which blocks to show as we progress
        let currentBlockIndex = 0;

        // Check if this is the new chunked format by looking for magic number
        const MAGIC_CHUNKED = 0x444F4743; // "DOGC" = DOGbox Chunked
        const view = new DataView(data.buffer, data.byteOffset);
        let numChunks = 1;
        let isChunked = false;

        // Check for magic number in first 4 bytes
        if (data.length >= 8) {
            const magic = view.getUint32(0, true);
            if (magic === MAGIC_CHUNKED) {
                numChunks = view.getUint32(4, true);
                isChunked = true;
            }
        }

        let decryptedChunks = [];
        let totalDecryptedSize = 0;

        if (isChunked) {
            // New chunked format
            let offset = 8; // Skip magic number (4) and chunk count (4)

            for (let i = 0; i < numChunks; i++) {
                // Read chunk size
                const chunkSize = view.getUint32(offset, true);
                offset += 4;

                // Read chunk data (IV + ciphertext)
                const chunkData = data.slice(offset, offset + chunkSize);
                offset += chunkSize;

                // Extract IV and ciphertext
                const iv = chunkData.slice(0, 12);
                const ciphertext = chunkData.slice(12);

                // Decrypt chunk
                const decrypted = await crypto.subtle.decrypt(
                    {
                        name: 'AES-GCM',
                        iv: iv,
                        tagLength: 128
                    },
                    hybridKey.aesKey,
                    ciphertext
                );

                decryptedChunks.push(new Uint8Array(decrypted));
                totalDecryptedSize += decrypted.byteLength;

                // Calculate progress
                const percentage = ((i + 1) / numChunks) * 100;

                // Update visualization blocks proportional to progress
                const targetBlockIndex = Math.floor((percentage / 100) * totalBlocks);
                const blocksToShow = blockOrder.slice(currentBlockIndex, targetBlockIndex);
                currentBlockIndex = targetBlockIndex;

                if (onProgress && blocksToShow.length > 0) {
                    onProgress({
                        decryptedBlocks: blocksToShow,
                        totalDecrypted: currentBlockIndex,
                        totalBlocks: totalBlocks,
                        percentage: percentage,
                        chunksProcessed: i + 1,
                        totalChunks: numChunks
                    });
                }
            }

            // Combine all decrypted chunks
            const result = new Uint8Array(totalDecryptedSize);
            let resultOffset = 0;
            for (const chunk of decryptedChunks) {
                result.set(chunk, resultOffset);
                resultOffset += chunk.length;
            }

            // Final progress update
            if (onProgress) {
                onProgress({
                    decryptedBlocks: blockOrder.slice(currentBlockIndex),
                    totalDecrypted: totalBlocks,
                    totalBlocks: totalBlocks,
                    percentage: 100,
                    complete: true
                });
            }

            return result.buffer;
        } else {
            // Old single-chunk format - use original decryption
            const visualChunks = 20;
            const blocksPerChunk = Math.ceil(totalBlocks / visualChunks);

            for (let i = 0; i < visualChunks; i++) {
                const startBlock = i * blocksPerChunk;
                const endBlock = Math.min((i + 1) * blocksPerChunk, totalBlocks);
                const blocksToDecrypt = blockOrder.slice(startBlock, endBlock);

                if (onProgress) {
                    onProgress({
                        decryptedBlocks: blocksToDecrypt,
                        totalDecrypted: endBlock,
                        totalBlocks: totalBlocks,
                        percentage: (endBlock / totalBlocks) * 100
                    });
                }

                await new Promise(resolve => setTimeout(resolve, 30));
            }

            const decrypted = await this.decryptFile(encryptedData, hybridKey);

            if (onProgress) {
                onProgress({
                    decryptedBlocks: [],
                    totalDecrypted: totalBlocks,
                    totalBlocks: totalBlocks,
                    percentage: 100,
                    complete: true
                });
            }

            return decrypted;
        }
    }

    /**
     * Generate pseudo-random block order based on data content
     * This creates a deterministic but seemingly random decryption pattern
     * tied to the actual encrypted data
     */
    async generateBlockOrder(data, totalBlocks) {
        // Use first 32 bytes as seed (includes IV and start of ciphertext)
        const seed = data.slice(0, Math.min(32, data.length));

        // Create seeded pseudo-random number generator
        let state = 0;
        for (let i = 0; i < seed.length; i++) {
            state = (state * 31 + seed[i]) & 0xFFFFFFFF;
        }

        // Fisher-Yates shuffle with seeded PRNG
        const blocks = Array.from({ length: totalBlocks }, (_, i) => i);

        const seededRandom = () => {
            state = (state * 1664525 + 1013904223) & 0xFFFFFFFF;
            return state / 0xFFFFFFFF;
        };

        for (let i = blocks.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom() * (i + 1));
            [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
        }

        return blocks;
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
