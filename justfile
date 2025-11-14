# dogbox.moe automation recipes
# Install just: https://github.com/casey/just

# List available recipes
default:
    @just --list

# Initialize database with migrations
dev-db-init:
    @echo "Creating database and running migrations..."
    @mkdir -p uploads
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

# Run the development server (always nukes DB for fresh start)
dev:
    @echo "Setting up development environment..."
    @mkdir -p uploads
    @echo "Nuking database for fresh start..."
    @rm -f dogbox.db dogbox.db-shm dogbox.db-wal
    @just dev-db-init
    @echo "Starting dogbox in development mode..."
    RUST_LOG=dogbox=debug,tower_http=debug cargo run

# Run the development server in TEST MODE (wipes all data every 24hr)
dev-test:
    @echo "Setting up TEST MODE development environment..."
    @mkdir -p uploads
    @if [ ! -f dogbox.db ]; then just dev-db-init; fi
    @echo "⚠️  Starting dogbox in TEST MODE - all data will be wiped every 24 hours"
    TEST_DELETE_PERIOD_HOURS=24 RUST_LOG=dogbox=debug,tower_http=debug cargo run

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

# Calculate SHA256 hashes for inline scripts (for CSP)
# Run this after modifying import maps in HTML files
hash-scripts:
    @echo "Calculating SHA256 hashes for inline scripts..."
    @python3 scripts/hash-inline-scripts.py

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

# ========================================
# DEPRECATED: Old VM deployment (replaced by GKE)
# These commands are kept for reference but are no longer used
# ========================================

# OLD: Create GCP VM (DEPRECATED - use GKE instead)
vm-create-old PROJECT_ID ZONE="us-central1-a":
    @echo "⚠️  WARNING: VM deployment is deprecated. Use 'just gke-setup' instead"
    @bash scripts/vm-create.sh {{PROJECT_ID}} {{ZONE}}

# OLD: Deploy to VM (DEPRECATED - use 'just gke-deploy' instead)
deploy-old PROJECT_ID ZONE="us-central1-a":
    @echo "⚠️  WARNING: VM deployment is deprecated. Use 'just gke-deploy {{PROJECT_ID}}' instead"

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

# ========================================
# GKE Deployment Commands (PRIMARY DEPLOYMENT METHOD)
# ========================================

# Quick deploy to GKE (recommended)
deploy PROJECT_ID: (gke-deploy PROJECT_ID)

# Show deployment info (IP, status, logs)
status:
    @echo "=== GKE Deployment Status ==="
    @kubectl get service dogbox-service
    @echo ""
    @kubectl get pods -l app=dogbox
    @echo ""
    @echo "💡 Access your site at: http://$(kubectl get service dogbox-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"
    @echo "💡 Point DNS: dogbox.moe → $(kubectl get service dogbox-service -o jsonpath='{.status.loadBalancer.ingress[0].ip}')"

# View live logs
logs:
    kubectl logs -f -l app=dogbox --tail=100

# Check SSL certificate status
ssl-status:
    @echo "=== SSL Certificate Status ==="
    @kubectl get managedcertificate
    @echo ""
    @echo "=== Ingress Status ==="
    @kubectl get ingress dogbox-ingress
    @echo ""
    @echo "💡 Certificate provisioning can take 15-60 minutes"
    @echo "💡 Once Active, HTTPS will be available at: https://dogbox.moe"

# Setup GKE cluster (Autopilot mode - fully managed)
gke-setup PROJECT_ID REGION="us-central1":
    @echo "Setting up GKE Autopilot cluster..."
    gcloud config set project {{PROJECT_ID}}
    gcloud services enable container.googleapis.com
    gcloud services enable artifactregistry.googleapis.com
    @echo "Creating GKE Autopilot cluster (this takes ~5 minutes)..."
    gcloud container clusters create-auto dogbox-cluster \
        --region={{REGION}} \
        --project={{PROJECT_ID}} || echo "Cluster may already exist"
    @echo "Getting cluster credentials..."
    gcloud container clusters get-credentials dogbox-cluster --region={{REGION}} --project={{PROJECT_ID}}
    @echo "✓ GKE cluster ready!"

# Build and push Docker image to Google Container Registry
gke-build PROJECT_ID: sqlx-prepare
    @echo "Building Docker image..."
    docker build -t gcr.io/{{PROJECT_ID}}/dogbox:latest .
    @echo "Pushing to GCR..."
    docker push gcr.io/{{PROJECT_ID}}/dogbox:latest
    @echo "✓ Image pushed to gcr.io/{{PROJECT_ID}}/dogbox:latest"

# Deploy to GKE cluster
gke-deploy PROJECT_ID: (gke-build PROJECT_ID)
    @echo "Updating Kubernetes manifests with project ID..."
    @sed "s/PROJECT_ID/{{PROJECT_ID}}/g" k8s/deployment.yaml > /tmp/deployment.yaml
    @echo "Applying Kubernetes manifests..."
    kubectl apply -f k8s/pvc.yaml
    kubectl apply -f /tmp/deployment.yaml
    kubectl apply -f k8s/service.yaml
    @echo "Waiting for deployment to be ready..."
    kubectl rollout status deployment/dogbox
    @echo ""
    @echo "✓ Deployment complete!"
    @echo ""
    @echo "Getting service IP (may take a few minutes for load balancer)..."
    @kubectl get service dogbox-service

# Get GKE service status and external IP
gke-status:
    @echo "=== Dogbox Service Status ==="
    @kubectl get service dogbox-service
    @echo ""
    @echo "=== Pods ==="
    @kubectl get pods -l app=dogbox
    @echo ""
    @echo "External IP: (wait for EXTERNAL-IP to appear above)"

# View GKE logs (live tail)
gke-logs:
    @echo "Tailing logs from dogbox pod..."
    kubectl logs -f -l app=dogbox --tail=100

# View all GKE logs
gke-logs-all:
    @echo "Fetching all logs from dogbox pod..."
    kubectl logs -l app=dogbox --tail=500

# SSH into GKE pod (for debugging)
gke-shell:
    @echo "Opening shell in dogbox pod..."
    kubectl exec -it $(kubectl get pod -l app=dogbox -o jsonpath='{.items[0].metadata.name}') -- /bin/sh

# Restart GKE deployment (rolling restart)
gke-restart:
    @echo "Restarting dogbox deployment..."
    kubectl rollout restart deployment/dogbox
    kubectl rollout status deployment/dogbox
    @echo "✓ Deployment restarted!"

# Delete GKE deployment (keeps cluster)
gke-delete-app:
    @echo "Deleting dogbox application..."
    kubectl delete -f k8s/service.yaml
    kubectl delete -f k8s/deployment.yaml
    @echo "⚠️  Keeping PVC (persistent data). To delete data, run: kubectl delete -f k8s/pvc.yaml"
    @echo "✓ Application deleted!"

# Delete entire GKE cluster
gke-delete-cluster PROJECT_ID REGION="us-central1":
    @echo "⚠️  This will delete the entire GKE cluster and all data!"
    @read -p "Are you sure? (yes/no): " confirm && [ "$$confirm" = "yes" ] || exit 1
    gcloud container clusters delete dogbox-cluster --region={{REGION}} --project={{PROJECT_ID}} --quiet
    @echo "✓ Cluster deleted!"

# Scale GKE deployment
gke-scale REPLICAS="1":
    @echo "Scaling dogbox to {{REPLICAS}} replicas..."
    kubectl scale deployment/dogbox --replicas={{REPLICAS}}
    kubectl rollout status deployment/dogbox
    @echo "✓ Scaled to {{REPLICAS}} replicas!"

# Get GKE cluster info
gke-info PROJECT_ID REGION="us-central1":
    @echo "=== GKE Cluster Info ==="
    gcloud container clusters describe dogbox-cluster --region={{REGION}} --project={{PROJECT_ID}} --format="table(name,location,status,currentNodeCount)"
