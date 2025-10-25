#!/bin/bash
set -e

echo "Installing dogbox on VM..."

# Install sqlite3 if not present
if ! command -v sqlite3 &> /dev/null; then
    echo "Installing sqlite3..."
    sudo apt-get update -qq
    sudo apt-get install -y sqlite3
fi

# Install Google Cloud Ops Agent for monitoring and logging
if ! systemctl is-active --quiet google-cloud-ops-agent; then
    echo "Installing Google Cloud Ops Agent..."
    curl -sSO https://dl.google.com/cloudagents/add-google-cloud-ops-agent-repo.sh
    sudo bash add-google-cloud-ops-agent-repo.sh --also-install
    rm add-google-cloud-ops-agent-repo.sh
    echo "✓ Ops Agent installed"
fi

# Create dogbox user if it doesn't exist
sudo useradd -r -s /bin/false dogbox 2>/dev/null || true

# Create application directory
sudo mkdir -p /opt/dogbox/data/uploads

# Move files into place
sudo mv /tmp/dogbox /opt/dogbox/dogbox
sudo rm -rf /opt/dogbox/static /opt/dogbox/migrations
sudo mv /tmp/static /opt/dogbox/static
sudo mv /tmp/migrations /opt/dogbox/migrations

# Initialize database with migrations (ignore errors for existing tables/columns)
echo "Creating database and running migrations..."
sudo touch /opt/dogbox/data/dogbox.db
cd /opt/dogbox
sudo sqlite3 /opt/dogbox/data/dogbox.db < migrations/000_migrations.sql 2>/dev/null || true
sudo sqlite3 /opt/dogbox/data/dogbox.db < migrations/001_init.sql 2>/dev/null || true
sudo sqlite3 /opt/dogbox/data/dogbox.db < migrations/002_post_types.sql 2>/dev/null || true
sudo sqlite3 /opt/dogbox/data/dogbox.db < migrations/003_file_extension.sql 2>/dev/null || true
echo "✓ Database migrations complete"

# Set ownership and permissions (do this before starting service)
sudo chown -R dogbox:dogbox /opt/dogbox
sudo chmod +x /opt/dogbox/dogbox

# Install and enable systemd service with 24-hour reset mode and admin message
sudo mv /tmp/dogbox.service /etc/systemd/system/dogbox.service
sudo systemctl daemon-reload
sudo systemctl enable dogbox
sudo systemctl restart dogbox

# Wait a moment for service to start
sleep 2

# Show status
sudo systemctl status dogbox --no-pager

echo "✓ Installation complete!"
