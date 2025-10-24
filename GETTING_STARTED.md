# Getting Started with dogbox.moe

## Prerequisites

- Rust 1.75+ ([Install](https://rustup.rs/))
- Just (command runner) - `cargo install just`
- SQLite 3
- Docker (optional, for containerized deployment)
- GCP account (optional, for cloud deployment)

## Local Development

### 1. Clone and Setup

```bash
git clone <repository-url>
cd dogbox.moe

# Install dependencies
cargo build

# Create environment file
cp .env.example .env

# Create upload directory and database
just migrate
```

### 2. Run Development Server

```bash
# Start the server (with hot reload)
just dev

# Or run directly
cargo run
```

The server will start on http://localhost:8080

- 🏠 Homepage: http://localhost:8080
- 📖 API Docs: http://localhost:8080/docs
- 💚 Health Check: http://localhost:8080/api/health

### 3. Test File Upload

#### Via Web Interface
1. Open http://localhost:8080
2. Drag & drop a file or click to browse
3. File is encrypted in your browser
4. Copy the share link
5. Share with anyone (key is in URL fragment after #)

#### Via API (with curl)

```bash
# Upload a file
curl -X POST http://localhost:8080/api/upload \
  -F "file=@test.txt" \
  -F "expiry_hours=24"

# Response:
# {
#   "file_id": "550e8400-e29b-41d4-a716-446655440000",
#   "deletion_token": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
#   "expires_at": "2024-01-02T12:00:00Z",
#   "url": "/api/files/550e8400-e29b-41d4-a716-446655440000"
# }

# Download the file
curl http://localhost:8080/api/files/550e8400-e29b-41d4-a716-446655440000

# Delete the file
curl -X DELETE "http://localhost:8080/api/files/550e8400-e29b-41d4-a716-446655440000?token=<deletion_token>"
```

## Configuration

Edit `.env` to configure:

```bash
# Server
HOST=0.0.0.0
PORT=8080

# Database
DATABASE_URL=sqlite:./dogbox.db

# Storage
UPLOAD_DIR=./uploads
MAX_FILE_SIZE_MB=100

# Privacy
DEFAULT_EXPIRY_HOURS=24
MAX_EXPIRY_HOURS=168  # 7 days
ENABLE_ANALYTICS=false  # Always false for privacy!
```

## Development Commands

```bash
# List all commands
just

# Run tests
just test

# Format code
just fmt

# Check code quality
just check

# Security audit
just audit

# Watch mode (requires cargo-watch)
just watch
```

## Docker Deployment

### Build Docker Image

```bash
just docker-build
```

### Run Locally with Docker

```bash
just docker-run
```

Access at http://localhost:8080

## GCP Cloud Run Deployment

### 1. Setup GCP Project

```bash
# Make setup script executable
chmod +x gcp-setup.sh

# Run setup (replace YOUR_PROJECT_ID)
./gcp-setup.sh YOUR_PROJECT_ID us-central1
```

This will:
- Enable required APIs
- Create Artifact Registry
- Set up Cloud Storage bucket
- Configure lifecycle policies

### 2. Deploy to Cloud Run

```bash
# Deploy using Just
just deploy YOUR_PROJECT_ID us-central1

# Or manually
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/dogbox
gcloud run deploy dogbox \
  --image gcr.io/YOUR_PROJECT_ID/dogbox \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```

### 3. Set Up Custom Domain (Optional)

```bash
gcloud run domain-mappings create \
  --service dogbox \
  --domain dogbox.moe \
  --region us-central1
```

Follow the instructions to configure your DNS records.

## Production Considerations

### Security Hardening

1. **Enable HTTPS Only**
   - Cloud Run provides automatic HTTPS
   - For self-hosted: use Caddy or nginx with Let's Encrypt

2. **Rate Limiting**
   - Enable Cloud Armor on GCP
   - Or use nginx rate limiting

3. **File Size Limits**
   - Adjust `MAX_FILE_SIZE_MB` in environment
   - Cloud Run has 32MB request limit (use Cloud Storage for larger files)

4. **Database Encryption**
   ```bash
   # Use encrypted volume
   docker run -v encrypted-volume:/data dogbox:latest
   ```

5. **Secrets Management**
   ```bash
   # Use GCP Secret Manager
   gcloud secrets create dogbox-db-key --data-file=-
   ```

### Monitoring

#### Health Checks
```bash
curl http://localhost:8080/api/health
```

#### Logs (GCP)
```bash
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=dogbox"
```

#### Metrics
- Upload count (via database)
- Storage usage (disk space)
- Auto-deletion stats (cleanup logs)

### Backup Strategy

1. **Database Backups**
   ```bash
   # Backup SQLite database
   sqlite3 dogbox.db ".backup dogbox.backup.db"

   # Restore
   cp dogbox.backup.db dogbox.db
   ```

2. **File Storage Backups**
   ```bash
   # With Cloud Storage
   gsutil -m rsync -r gs://your-bucket gs://backup-bucket
   ```

## Troubleshooting

### Build Errors

```bash
# Clean and rebuild
just clean
cargo build
```

### Database Issues

```bash
# Reset database
rm dogbox.db dogbox.db-shm dogbox.db-wal
just migrate
cargo sqlx prepare  # Regenerate query metadata
```

### Port Already in Use

```bash
# Change port in .env
PORT=3000
```

### Upload Fails

Check:
1. File size < MAX_FILE_SIZE_MB
2. `uploads/` directory exists and is writable
3. Database is accessible
4. CORS is configured (for browser uploads)

## Next Steps

- [ ] Read [SECURITY.md](SECURITY.md) for security model
- [ ] Review [OpenAPI spec](http://localhost:8080/docs) for API details
- [ ] Enable monitoring and alerting
- [ ] Set up automated backups
- [ ] Configure custom domain
- [ ] Consider adding Cloud CDN for static assets

## Getting Help

- Check [README.md](README.md) for overview
- Review [SECURITY.md](SECURITY.md) for privacy details
- Open an issue on GitHub
- Check the OpenAPI documentation at `/docs`

## Development Roadmap

Future enhancements:
- [ ] True post-quantum encryption (ML-KEM WASM)
- [ ] Album/multi-file uploads
- [ ] Password-protected links
- [ ] Burn-after-reading mode
- [ ] CLI client for uploads
- [ ] Browser extension
- [ ] File previews (images, videos)
- [ ] Drag-and-drop interface improvements
