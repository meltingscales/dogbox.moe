#!/bin/sh
set -e

echo "=== Dogbox Startup ==="
echo "Environment variables:"
echo "  DATABASE_URL=${DATABASE_URL}"
echo "  UPLOAD_DIR=${UPLOAD_DIR}"
echo "  HOST=${HOST}"
echo "  PORT=${PORT}"
echo "  RUST_LOG=${RUST_LOG}"

echo "Creating upload directory..."
mkdir -p "${UPLOAD_DIR}"

echo "Initializing database file..."
DB_PATH="${DATABASE_URL#sqlite:}"
# Create parent directory if needed
mkdir -p "$(dirname "$DB_PATH")"
# Touch the database file to ensure it exists with correct permissions
touch "$DB_PATH"

echo "Starting dogbox (migrations will run automatically)..."
# Run directly - Kubernetes captures stdout/stderr automatically
# SQLx migrations will run automatically in the Rust code
exec /app/dogbox
