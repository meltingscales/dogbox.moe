# dogbox.moe automation recipes
# Install just: https://github.com/casey/just

# List available recipes
default:
    @just --list

# Initialize database with migrations
dev-db-init:
    @echo "Creating database and running migrations..."
    @mkdir -p uploads
    @sqlite3 dogbox.db < migrations/000_migrations.sql
    @sqlite3 dogbox.db < migrations/001_init.sql
    @sqlite3 dogbox.db < migrations/002_post_types.sql
    @echo "Database initialized!"

# Reset database (clean and reinitialize)
dev-db-reset:
    @echo "Resetting database..."
    @rm -f dogbox.db dogbox.db-shm dogbox.db-wal
    @just dev-db-init

# Run the development server
dev:
    @echo "Setting up development environment..."
    @mkdir -p uploads
    @if [ ! -f dogbox.db ]; then just dev-db-init; fi
    @echo "Starting dogbox in development mode..."
    RUST_LOG=dogbox=debug,tower_http=debug cargo run

# Run the development server in TEST MODE (wipes all data every 24hr)
dev-test:
    @echo "Setting up TEST MODE development environment..."
    @mkdir -p uploads
    @if [ ! -f dogbox.db ]; then just dev-db-init; fi
    @echo "⚠️  Starting dogbox in TEST MODE - all data will be wiped every 24 hours"
    TEST_DELETE_24HR=true RUST_LOG=dogbox=debug,tower_http=debug cargo run

# Build for production
build:
    cargo build --release

# Run tests
test:
    cargo test

# Check code without building
check:
    cargo check
    cargo clippy -- -D warnings

# Format code
fmt:
    cargo fmt

# Run database migrations
migrate:
    @echo "Creating uploads directory..."
    @mkdir -p uploads
    @echo "Database will be created automatically on first run"

# Clean build artifacts
clean:
    cargo clean
    rm -rf uploads/*
    rm -f dogbox.db dogbox.db-shm dogbox.db-wal

# Run in watch mode (requires cargo-watch)
watch:
    cargo watch -x run

# Build Docker image
docker-build:
    docker build -t dogbox:latest .

# Run Docker container locally
docker-run:
    docker run -p 8080:8080 -v $(pwd)/uploads:/app/uploads dogbox:latest

# Deploy to GCP Cloud Run
deploy PROJECT_ID REGION="us-central1":
    @echo "Building for GCP Cloud Run..."
    gcloud builds submit --tag gcr.io/{{PROJECT_ID}}/dogbox
    @echo "Deploying to Cloud Run..."
    gcloud run deploy dogbox \
        --image gcr.io/{{PROJECT_ID}}/dogbox \
        --platform managed \
        --region {{REGION}} \
        --allow-unauthenticated \
        --set-env-vars "DATABASE_URL=sqlite:/data/dogbox.db,UPLOAD_DIR=/data/uploads" \
        --memory 512Mi \
        --max-instances 10

# Setup GCP project
setup-gcp PROJECT_ID:
    @echo "Enabling required GCP services..."
    gcloud config set project {{PROJECT_ID}}
    gcloud services enable run.googleapis.com
    gcloud services enable cloudbuild.googleapis.com
    @echo "GCP setup complete!"

# Generate API client (using OpenAPI spec)
generate-client:
    @echo "Generating API client from OpenAPI spec..."
    @echo "Visit http://localhost:8080/docs to view the spec"
    curl -s http://localhost:8080/api-docs/openapi.json > openapi.json
    @echo "OpenAPI spec saved to openapi.json"

# Security audit
audit:
    cargo audit

# Run benchmarks
bench:
    cargo bench

# Install development dependencies
install-deps:
    cargo install cargo-watch
    cargo install cargo-audit
    @echo "Development dependencies installed!"
