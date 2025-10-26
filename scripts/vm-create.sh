#!/bin/bash
# Create GCP VM with static IP if it doesn't exist

set -e

PROJECT_ID=$1
ZONE=$2

if [ -z "$PROJECT_ID" ] || [ -z "$ZONE" ]; then
    echo "Usage: $0 PROJECT_ID ZONE"
    exit 1
fi

echo "Checking if VM exists..."
if gcloud compute instances describe dogbox --project="$PROJECT_ID" --zone="$ZONE" 2>/dev/null; then
    echo "✓ VM 'dogbox' already exists"
else
    # Get static IP from setup script (last line of output)
    STATIC_IP=$(bash scripts/setup-static-ip.sh "$PROJECT_ID" "$ZONE" | tail -1)

    echo "Creating VM 'dogbox' with static IP ${STATIC_IP}..."
    gcloud compute instances create dogbox \
        --project="$PROJECT_ID" \
        --zone="$ZONE" \
        --machine-type=e2-micro \
        --boot-disk-size=200GB \
        --boot-disk-type=pd-standard \
        --image-family=debian-12 \
        --image-project=debian-cloud \
        --tags=http-server,https-server \
        --address="${STATIC_IP}"

    echo "✓ VM created with static IP ${STATIC_IP}"
fi

echo "Configuring firewall rules..."
gcloud compute firewall-rules create allow-http \
    --project="$PROJECT_ID" \
    --allow=tcp:80 \
    --target-tags=http-server \
    --description="Allow HTTP traffic on port 80" 2>/dev/null || echo "✓ HTTP firewall rule already exists"

gcloud compute firewall-rules create allow-https \
    --project="$PROJECT_ID" \
    --allow=tcp:443 \
    --target-tags=https-server \
    --description="Allow HTTPS traffic on port 443" 2>/dev/null || echo "✓ HTTPS firewall rule already exists"
