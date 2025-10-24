# Multi-stage Dockerfile for dogbox.moe
# Optimized for GCP Cloud Run deployment

# Build stage
FROM rust:1.75-slim as builder

WORKDIR /build

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy manifests
COPY Cargo.toml Cargo.lock ./

# Copy source code
COPY src ./src
COPY migrations ./migrations
COPY static ./static

# Build release binary
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN useradd -m -u 1000 dogbox && \
    mkdir -p /data/uploads && \
    chown -R dogbox:dogbox /data

# Copy binary from builder
COPY --from=builder /build/target/release/dogbox /app/dogbox

# Copy static files
COPY static /app/static

# Set ownership
RUN chown -R dogbox:dogbox /app

USER dogbox

# Environment variables
ENV HOST=0.0.0.0
ENV PORT=8080
ENV DATABASE_URL=sqlite:/data/dogbox.db
ENV UPLOAD_DIR=/data/uploads
ENV RUST_LOG=dogbox=info

EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD ["/app/dogbox", "health"] || exit 1

CMD ["/app/dogbox"]
