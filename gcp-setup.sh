#!/bin/bash
# GCP setup script for dogbox.moe
# Run this once to configure your GCP project

set -e

# Check if PROJECT_ID is set
if [ -z "$1" ]; then
    echo "Usage: ./gcp-setup.sh PROJECT_ID [REGION]"
    echo "Example: ./gcp-setup.sh my-project us-central1"
    exit 1
fi

PROJECT_ID=$1
REGION=${2:-us-central1}

echo "🐕 Setting up dogbox.moe on GCP"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo ""

# Set the project
echo "📋 Setting GCP project..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔧 Enabling required GCP services..."
gcloud services enable run.googleapis.com
gcloud services enable cloudbuild.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable artifactregistry.googleapis.com

# Create Artifact Registry repository (recommended over Container Registry)
echo "📦 Creating Artifact Registry repository..."
gcloud artifacts repositories create dogbox \
    --repository-format=docker \
    --location=$REGION \
    --description="dogbox.moe container images" \
    || echo "Repository may already exist"

# Set up Cloud Storage bucket for persistent file storage (optional, for production)
echo "💾 Creating Cloud Storage bucket for uploads..."
BUCKET_NAME="${PROJECT_ID}-dogbox-uploads"
gsutil mb -l $REGION gs://$BUCKET_NAME/ || echo "Bucket may already exist"
gsutil uniformbucketlevelaccess set on gs://$BUCKET_NAME/

# Set lifecycle policy to auto-delete old files (privacy!)
cat > /tmp/lifecycle.json <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 7}
      }
    ]
  }
}
EOF

gsutil lifecycle set /tmp/lifecycle.json gs://$BUCKET_NAME/
rm /tmp/lifecycle.json

echo ""
echo "✅ GCP setup complete!"
echo ""
echo "Next steps:"
echo "1. Build and deploy:"
echo "   just deploy $PROJECT_ID $REGION"
echo ""
echo "2. Or use Cloud Build for CI/CD:"
echo "   gcloud builds submit --config cloudbuild.yaml"
echo ""
echo "3. Set up a custom domain (optional):"
echo "   gcloud run domain-mappings create --service dogbox --domain dogbox.moe --region $REGION"
echo ""
