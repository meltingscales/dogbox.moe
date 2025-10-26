#!/bin/bash
# Check if DNS matches the static IP

set -e

PROJECT_ID=$1
ZONE=$2

if [ -z "$PROJECT_ID" ] || [ -z "$ZONE" ]; then
    echo "Usage: $0 PROJECT_ID ZONE"
    exit 1
fi

# Extract region from zone
REGION=$(echo "$ZONE" | sed 's/-[a-z]$//')

# Get static IP
STATIC_IP=$(gcloud compute addresses describe dogbox-static-ip --project="$PROJECT_ID" --region="$REGION" --format="get(address)" 2>/dev/null)

if [ -z "$STATIC_IP" ]; then
    echo "❌ No static IP found. Run 'just vm-create $PROJECT_ID $ZONE' first."
    exit 1
fi

echo "📍 Static IP: $STATIC_IP"
echo "🌐 DNS should point to: $STATIC_IP"

# Check current DNS
CURRENT_DNS=$(host dogbox.moe | grep "has address" | awk '{print $4}' 2>/dev/null || echo "N/A")
echo "🔍 Current DNS: $CURRENT_DNS"

if [ "$STATIC_IP" != "$CURRENT_DNS" ]; then
    echo "⚠️  WARNING: DNS mismatch! Update your DNS A record."
    exit 1
else
    echo "✅ DNS is correct!"
fi
