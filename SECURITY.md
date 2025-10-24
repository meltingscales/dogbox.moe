# Security Model

## Overview

dogbox.moe implements a **zero-knowledge architecture** inspired by Signal's privacy model. The server operators cannot decrypt user files without the encryption key, which never leaves the client.

## Threat Model

### What we protect against:

1. **Server compromise**: Even if the server is compromised, attackers only get encrypted blobs
2. **Network eavesdropping**: TLS protects data in transit; encryption protects data at rest
3. **Malicious operators**: Server admins cannot read file contents
4. **Post-quantum attacks**: Hybrid encryption provides future-proof security

### What we DON'T protect against:

1. **Client compromise**: If the user's device is compromised before encryption
2. **Key sharing**: If users share download URLs (which contain keys)
3. **Metadata analysis**: File sizes and upload times are visible to the server
4. **Side-channel attacks**: Timing attacks, traffic analysis, etc.

## Cryptographic Design

### Current Implementation (Browser-based)

```
Client Side:
1. Generate 256-bit AES-GCM key
2. Encrypt file with AES-GCM (authenticated encryption)
3. Upload encrypted blob to server
4. Key stored in URL fragment (#key) - never sent to server

Server Side:
1. Receive encrypted blob
2. Store blob with metadata (size, expiry, hash)
3. Cannot decrypt without key
4. Auto-delete after expiration
```

### Future Post-Quantum Upgrade

The current implementation uses AES-GCM for simplicity and browser compatibility. For production deployment with true post-quantum security:

```
Hybrid Encryption (recommended):
1. ML-KEM-768 (Kyber) for key encapsulation
2. ChaCha20-Poly1305 for symmetric encryption
3. BLAKE3 for hashing
4. X25519 + ML-KEM for hybrid key exchange
```

**Implementation via WebAssembly:**
- Compile `pqcrypto-kyber` to WASM
- Use in browser for client-side encryption
- Maintains zero-knowledge property

## Privacy Features

### No User Tracking
- No user accounts or authentication
- No analytics or telemetry
- No IP logging (can be configured)
- No cookies or browser storage
- Minimal metadata collection

### Automatic Deletion
- Files auto-delete after configured expiry (default: 24h)
- Secure deletion from disk
- Database records cleaned up hourly
- No file recovery possible

### Deduplication
- Uses BLAKE3 hash of **encrypted** data
- Deduplication doesn't leak information about plaintext
- Each upload gets unique encryption key

## Server Security

### Database
- SQLite stores only metadata
- No encryption keys stored
- No plaintext filenames (can be encrypted client-side)
- Indexes for efficient cleanup

### File Storage
- Encrypted blobs stored on disk
- Random UUID filenames (no leakage)
- Separate from database
- Can be mounted on encrypted volume

### Network
- HTTPS required (TLS 1.3)
- CORS configured for browser access
- No unnecessary headers or fingerprinting

## Deployment Security

### GCP Cloud Run
- Runs as non-root user (UID 1000)
- Minimal container image (Debian slim)
- No shell in production container
- Health checks enabled
- Auto-scaling (0-10 instances)

### Environment Variables
Never commit secrets! Use:
```bash
gcloud run services update dogbox \
  --update-secrets=DATABASE_ENCRYPTION_KEY=key:latest
```

### Recommended Additional Hardening
1. **Enable Cloud Armor**: DDoS protection, rate limiting
2. **Cloud CDN**: Cache static files, reduce origin load
3. **VPC Service Controls**: Isolate the service
4. **Binary Authorization**: Only deploy signed images
5. **Secret Manager**: Manage encryption keys
6. **Cloud KMS**: Encrypt database at rest

## Key Management

### Client-Side Keys
- Generated using `crypto.getRandomValues()` (CSPRNG)
- 256-bit entropy
- Never transmitted to server
- Stored in URL fragment (not sent in HTTP requests)
- User responsible for sharing securely

### Server-Side (Future Enhancement)
- Optionally encrypt metadata with separate key
- Use GCP Secret Manager for key storage
- Rotate keys periodically
- Audit key access

## Vulnerability Disclosure

If you discover a security vulnerability:

1. **DO NOT** open a public GitHub issue
2. Email: security@dogbox.moe (or create a private security advisory)
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will respond within 48 hours and work on a fix.

## Security Audits

This is an open-source project. Security audits are welcome!

Areas of interest:
- Cryptographic implementation review
- Side-channel analysis
- Dependency audit (`cargo audit`)
- Fuzzing upload/download handlers
- Penetration testing

## Compliance

### GDPR
- No personal data collected
- No user accounts
- Anonymous uploads
- Automatic deletion
- No data retention

### Data Residency
- Configure GCP region for data sovereignty
- Files stored in specified region
- No cross-region replication

## References

- [Signal Protocol](https://signal.org/docs/)
- [ML-KEM (NIST FIPS 203)](https://csrc.nist.gov/pubs/fips/203/final)
- [OWASP Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
