#!/bin/sh
# Don't use set -e so we can see errors
set +e

echo "=== Dogbox Startup ==="
echo "Environment variables:"
echo "  DATABASE_URL=${DATABASE_URL}"
echo "  UPLOAD_DIR=${UPLOAD_DIR}"
echo "  HOST=${HOST}"
echo "  PORT=${PORT}"
echo "  RUST_LOG=${RUST_LOG}"

echo "Creating upload directory..."
mkdir -p "${UPLOAD_DIR}"

echo "Starting dogbox..."
echo "Binary info:"
ls -la /app/dogbox
ldd /app/dogbox || true

echo "Executing dogbox binary..."
# Run the binary and capture all output
/app/dogbox > /tmp/dogbox.stdout 2> /tmp/dogbox.stderr &
DOGBOX_PID=$!
echo "Dogbox started with PID: $DOGBOX_PID"
sleep 2
echo "=== STDOUT ==="
cat /tmp/dogbox.stdout 2>/dev/null || echo "(no stdout)"
echo "=== STDERR ==="
cat /tmp/dogbox.stderr 2>/dev/null || echo "(no stderr)"

# Wait for the process and capture exit code
wait $DOGBOX_PID
EXIT_CODE=$?
echo "Dogbox exited with code: $EXIT_CODE"

# Keep container alive if it failed for debugging
if [ $EXIT_CODE -ne 0 ]; then
    echo "Dogbox failed! Sleeping to allow log inspection..."
    sleep 3600
fi

exit $EXIT_CODE
