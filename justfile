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
    @sqlite3 dogbox.db < migrations/003_file_extension.sql
    @sqlite3 dogbox.db < migrations/004_post_content_types.sql
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
build: sqlx-prepare
    RUSTFLAGS="-D warnings" cargo build --release

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

# Prepare SQLx offline query cache (needed for Docker builds)
sqlx-prepare:
    @echo "Checking SQLx query cache..."
    @if [ ! -d .sqlx ] || [ -z "$(ls -A .sqlx 2>/dev/null)" ]; then \
        echo "SQLx cache missing or empty, preparing..."; \
        if [ ! -f dogbox.db ]; then just dev-db-init; fi; \
        cargo sqlx prepare --database-url sqlite:./dogbox.db; \
        echo "✓ SQLx cache updated in .sqlx/ directory"; \
    else \
        echo "✓ SQLx cache already exists"; \
    fi

# Force regenerate SQLx cache (use after changing database queries)
sqlx-prepare-force:
    @echo "Force regenerating SQLx query cache..."
    @if [ ! -f dogbox.db ]; then just dev-db-init; fi
    cargo sqlx prepare --database-url sqlite:./dogbox.db
    @echo "✓ SQLx cache regenerated in .sqlx/ directory"

# Clean build artifacts
clean:
    cargo clean
    rm -rf uploads/*
    rm -f dogbox.db dogbox.db-shm dogbox.db-wal

# Run in watch mode (requires cargo-watch)
watch:
    cargo watch -x run

# Create GCP VM if it doesn't exist
vm-create PROJECT_ID ZONE="us-central1-a":
    @bash scripts/vm-create.sh {{PROJECT_ID}} {{ZONE}}

# Show the VM's static IP address and check DNS
vm-ip PROJECT_ID ZONE="us-central1-a":
    @bash scripts/check-dns.sh {{PROJECT_ID}} {{ZONE}}

# Deploy to GCP VM
deploy PROJECT_ID ZONE="us-central1-a": sqlx-prepare (vm-create PROJECT_ID ZONE)
    @echo "Building release binary..."
    SQLX_OFFLINE=true RUSTFLAGS="-D warnings" cargo build --release
    @echo "Copying files to VM..."
    gcloud compute scp --project={{PROJECT_ID}} --zone={{ZONE}} target/release/dogbox dogbox:/tmp/
    gcloud compute scp --project={{PROJECT_ID}} --zone={{ZONE}} --recurse static dogbox:/tmp/
    gcloud compute scp --project={{PROJECT_ID}} --zone={{ZONE}} --recurse migrations dogbox:/tmp/
    gcloud compute scp --project={{PROJECT_ID}} --zone={{ZONE}} dogbox.service dogbox:/tmp/
    gcloud compute scp --project={{PROJECT_ID}} --zone={{ZONE}} scripts/vm-install.sh dogbox:/tmp/
    @echo "Running installation script..."
    gcloud compute ssh dogbox --project={{PROJECT_ID}} --zone={{ZONE}} --command='bash /tmp/vm-install.sh'
    @echo ""
    @echo "✓ Deployment complete!"
    @echo "Service URL: http://$(gcloud compute instances describe dogbox --project={{PROJECT_ID}} --zone={{ZONE}} --format='get(networkInterfaces[0].accessConfigs[0].natIP)'):8080"

# SSH into the VM
vm-ssh PROJECT_ID ZONE="us-central1-a":
    gcloud compute ssh dogbox --project={{PROJECT_ID}} --zone={{ZONE}}

# View VM logs
vm-logs PROJECT_ID ZONE="us-central1-a":
    gcloud compute ssh dogbox --project={{PROJECT_ID}} --zone={{ZONE}} --command='sudo journalctl -u dogbox -f'

# Setup nginx with SSL on VM (run after DNS is pointed to VM)
vm-setup-ssl PROJECT_ID ZONE="us-central1-a":
    @echo "Copying nginx configuration and setup script..."
    gcloud compute scp --project={{PROJECT_ID}} --zone={{ZONE}} nginx.conf dogbox:/tmp/
    gcloud compute scp --project={{PROJECT_ID}} --zone={{ZONE}} scripts/vm-setup-nginx.sh dogbox:/tmp/
    @echo "Running nginx setup script..."
    @echo "⚠️  Make sure dogbox.moe DNS is already pointing to the VM IP!"
    gcloud compute ssh dogbox --project={{PROJECT_ID}} --zone={{ZONE}} --command='bash /tmp/vm-setup-nginx.sh'
    @echo ""
    @echo "✓ SSL setup complete! Your site should now be available at https://dogbox.moe"

# Stop the VM
vm-stop PROJECT_ID ZONE="us-central1-a":
    gcloud compute instances stop dogbox --project={{PROJECT_ID}} --zone={{ZONE}}

# Start the VM
vm-start PROJECT_ID ZONE="us-central1-a":
    gcloud compute instances start dogbox --project={{PROJECT_ID}} --zone={{ZONE}}

# Delete the VM
vm-delete PROJECT_ID ZONE="us-central1-a":
    @echo "⚠️  This will delete the VM and all data!"
    @read -p "Are you sure? (yes/no): " confirm && [ "$$confirm" = "yes" ] || exit 1
    gcloud compute instances delete dogbox --project={{PROJECT_ID}} --zone={{ZONE}}

# Setup GCP project
setup-gcp PROJECT_ID:
    @echo "Enabling required GCP services..."
    gcloud config set project {{PROJECT_ID}}
    gcloud services enable compute.googleapis.com
    @echo "GCP setup complete!"

# Generate API client (using OpenAPI spec)
generate-client:
    @echo "Generating API client from OpenAPI spec..."
    @echo "Visit http://localhost:8080/docs to view the spec"
    curl -s http://localhost:8080/api-docs/openapi.json > openapi.json
    @echo "OpenAPI spec saved to openapi.json"

# Security audit (Rust dependencies)
audit:
    cargo audit

# Trivy security scan - filesystem
trivy-fs:
    @echo "Scanning filesystem for vulnerabilities..."
    trivy fs --scanners vuln,secret,misconfig .

# Trivy security scan - Docker image
trivy-docker:
    @echo "Building Docker image..."
    @docker build -t dogbox:latest . || (echo "Docker build failed. Make sure Docker is running."; exit 1)
    @echo "Scanning Docker image for vulnerabilities..."
    trivy image --scanners vuln dogbox:latest

# Trivy security scan - comprehensive (filesystem + dependencies)
trivy-all:
    @echo "Running comprehensive security scan..."
    @echo "\n=== Scanning Rust dependencies ==="
    trivy fs --scanners vuln --skip-dirs target --security-checks vuln .
    @echo "\n=== Scanning for secrets ==="
    trivy fs --scanners secret .
    @echo "\n=== Scanning for misconfigurations ==="
    trivy fs --scanners misconfig .

# Trivy - generate security report (JSON)
trivy-report:
    @echo "Generating security report..."
    @mkdir -p reports
    trivy fs --scanners vuln,secret,misconfig --format json --output reports/trivy-report.json .
    @echo "Report saved to reports/trivy-report.json"

# Trivy - scan with severity threshold (only HIGH and CRITICAL)
trivy-critical:
    @echo "Scanning for HIGH and CRITICAL vulnerabilities only..."
    trivy fs --scanners vuln --severity HIGH,CRITICAL .

# Run benchmarks
bench:
    cargo bench

# Install development dependencies
install-deps:
    cargo install cargo-watch
    cargo install cargo-audit
    @echo "Development dependencies installed!"

# Run upload/download integration test
test-upload URL="http://localhost:8080":
    @echo "Running upload/download integration test against {{URL}}..."
    TEST_URL={{URL}} cargo run --bin upload_test --features reqwest
