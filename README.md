# dogbox.moe 🐕🐾🦴💨

privacy focused catbox.moe alternative. data privacy model similar to signal

e2e encryption and post quantum crypto

## why?

boredom and to see if i could do it

## Privacy Model

Inspired by Signal's zero-knowledge architecture:

- **Client-side encryption**: Files are encrypted in the browser before upload
- **Zero-knowledge server**: Server operators cannot decrypt files without the key
- **Post-quantum security**: Hybrid encryption using ML-KEM-1024 (Kyber) + AES-256-GCM
- **Key in URL fragment**: Encryption keys never leave the client or touch the server
- **Automatic expiration**: Files auto-delete after configured period
- **No tracking**: No analytics, no user accounts, no IP logging

## Encryption Design

```
┌─────────────┐                    ┌─────────────┐
│   Client    │                    │   Server    │
│             │                    │             │
│ 1. Generate │                    │             │
│    key      │                    │             │
│             │                    │             │
│ 2. Encrypt  │  ─── upload ───>  │ 3. Store    │
│    file     │      blob          │    blob     │
│             │                    │             │
│ 4. Key in   │  <── file_id ───   │             │
│    #fragment│                    │             │
└─────────────┘                    └─────────────┘

URL format: https://dogbox.moe/f/{file_id}#{encryption_key}
                                            ^^^^^^^^^^^^^^^^
                                            Never sent to server
```

## Tech Stack

- **Backend**: Rust + Axum
- **Database**: SQLite (stores only metadata, not file content)
- **Crypto**: ML-KEM-1024 (post-quantum) + AES-256-GCM (classic)
- **API**: OpenAPI 3.0 specification
- **Deployment**: GCP Cloud Run
- **Build**: Just (command runner)

## Quick Start

```bash
# Install dependencies
cargo build

# Set up environment
cp .env.example .env

# Run migrations
just migrate

# Start server
just dev

# Or run directly
cargo run
```

## API Endpoints

- `POST /api/upload` - Upload encrypted file blob
- `GET /api/files/{id}` - Download encrypted blob
- `DELETE /api/files/{id}?token={deletion_token}` - Delete file
- `GET /api/health` - Health check
- `GET /docs` - Swagger UI

## Development

```bash
# Run tests
just test

# Check code
just check

# Format code
just fmt

# Build for production
just build

# Deploy to GCP
just deploy
```

## Security Features

- No user authentication (fully anonymous)
- Files encrypted before reaching server
- Server stores only encrypted blobs
- Automatic secure deletion after expiry
- No request logging or analytics
- CORS configured for browser upload
- Content-Security-Policy headers

## License

MIT
