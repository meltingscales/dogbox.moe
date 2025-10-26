#!/bin/bash
# Setup or verify static IP for dogbox VM

set -e

PROJECT_ID=$1
ZONE=$2

if [ -z "$PROJECT_ID" ] || [ -z "$ZONE" ]; then
    echo "Usage: $0 PROJECT_ID ZONE"
    exit 1
fi

# Extract region from zone (e.g., us-central1-a -> us-central1)
REGION=$(echo "$ZONE" | sed 's/-[a-z]$//')

echo "Creating/verifying static IP address..."

# Create static IP if it doesn't exist
if ! gcloud compute addresses describe dogbox-static-ip --project="$PROJECT_ID" --region="$REGION" 2>/dev/null; then
    gcloud compute addresses create dogbox-static-ip --project="$PROJECT_ID" --region="$REGION"
    echo "✓ Static IP created"
else
    echo "✓ Static IP already exists"
fi

# Get the static IP address
STATIC_IP=$(gcloud compute addresses describe dogbox-static-ip --project="$PROJECT_ID" --region="$REGION" --format="get(address)")

echo ""
echo "==================================================================="
echo "📍 Static IP: $STATIC_IP"
echo "🌐 Update DNS: dogbox.moe → $STATIC_IP"
echo "==================================================================="
echo ""

# Return the static IP for use in other scripts
echo "$STATIC_IP"
