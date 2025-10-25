# Multi-stage Dockerfile for dogbox.moe
# Optimized for GCP Cloud Run deployment

# Build stage - use bookworm to match runtime
FROM rust:1.90-slim-bookworm as builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests first for dependency caching
COPY Cargo.toml Cargo.lock ./

# Copy SQLx query metadata for offline compilation
COPY .sqlx ./.sqlx

# Build dependencies only (leverage Docker layer caching)
# This layer will be cached unless Cargo.toml or Cargo.lock changes
RUN mkdir -p src && \
    echo "fn main() {}" > src/main.rs && \
    cargo build --release && \
    rm -rf src

# Copy source code
COPY src ./src
COPY migrations ./migrations
COPY static ./static

# Build release binary (SQLx offline mode)
# This will reuse the cached dependencies from above
ENV SQLX_OFFLINE=true
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 dogbox

# Copy binary and scripts from builder
COPY --from=builder /build/target/release/dogbox /app/dogbox
COPY entrypoint.sh /app/entrypoint.sh

# Copy static files
COPY static /app/static

# Set ownership and make entrypoint executable
RUN chown -R dogbox:dogbox /app && chmod +x /app/entrypoint.sh

USER dogbox

# Environment variables (defaults - can be overridden)
ENV HOST=0.0.0.0
ENV PORT=8080
ENV DATABASE_URL=sqlite:/tmp/dogbox.db
ENV UPLOAD_DIR=/tmp/uploads
ENV RUST_LOG=dogbox=info

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["/app/entrypoint.sh"]
