#!/bin/bash
set -e

echo "Installing dogbox on VM..."

# Create dogbox user if it doesn't exist
sudo useradd -r -s /bin/false dogbox 2>/dev/null || true

# Create application directory
sudo mkdir -p /opt/dogbox/data/uploads

# Move files into place
sudo mv /tmp/dogbox /opt/dogbox/dogbox
sudo rm -rf /opt/dogbox/static /opt/dogbox/migrations
sudo mv /tmp/static /opt/dogbox/static
sudo mv /tmp/migrations /opt/dogbox/migrations

# Initialize empty database file (SQLx needs this to exist)
echo "Creating database file..."
sudo touch /opt/dogbox/data/dogbox.db

# Set ownership and permissions (do this before starting service)
sudo chown -R dogbox:dogbox /opt/dogbox
sudo chmod +x /opt/dogbox/dogbox

# Install and enable systemd service
sudo mv /tmp/dogbox.service /etc/systemd/system/dogbox.service
sudo systemctl daemon-reload
sudo systemctl enable dogbox
sudo systemctl restart dogbox

# Wait a moment for service to start
sleep 2

# Show status
sudo systemctl status dogbox --no-pager

echo "✓ Installation complete!"
