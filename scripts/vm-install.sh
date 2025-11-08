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

# Install and enable systemd service with reset mode and admin message
sudo mv /tmp/dogbox.service /etc/systemd/system/dogbox.service
sudo systemctl daemon-reload
sudo systemctl enable dogbox
sudo systemctl restart dogbox

# Wait a moment for service to start
sleep 2

# Install and configure nginx reverse proxy with SSL
if ! command -v nginx &> /dev/null; then
    echo "Installing nginx..."
    sudo apt-get update -qq
    sudo apt-get install -y nginx
    echo "✓ Nginx installed"
fi

# Configure nginx reverse proxy (always update config)
echo "Configuring nginx reverse proxy..."
sudo tee /etc/nginx/sites-available/dogbox > /dev/null <<'EOF'
server {
    listen 80;
    server_name dogbox.moe www.dogbox.moe _;

    # Allow uploads up to 5GB (matches application MAX_UPLOAD_SIZE)
    client_max_body_size 5120M;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Increase timeout for large uploads
        proxy_read_timeout 300;
        proxy_connect_timeout 300;
        proxy_send_timeout 300;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/dogbox /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl restart nginx
echo "✓ Nginx configured"

# Install certbot for SSL if not present
if ! command -v certbot &> /dev/null; then
    echo "Installing certbot for SSL..."
    sudo apt-get install -y certbot python3-certbot-nginx
    echo "✓ Certbot installed"
fi

# Obtain SSL certificate if not already present
if [ ! -f /etc/letsencrypt/live/dogbox.moe/fullchain.pem ]; then
    echo "Obtaining Let's Encrypt SSL certificate..."
    if sudo certbot --nginx -d dogbox.moe -d www.dogbox.moe --non-interactive --agree-tos --email noreply@dogbox.moe --redirect 2>&1 | tee /tmp/certbot.log; then
        echo "✓ SSL certificate obtained successfully"
        echo "✓ HTTPS enabled at https://dogbox.moe"
    else
        echo "⚠ SSL certificate acquisition failed (domain may not be pointing to this VM yet)"
        echo "  Run manually: sudo certbot --nginx -d dogbox.moe -d www.dogbox.moe"
    fi
else
    echo "✓ SSL certificate already present"
fi

# Show status
sudo systemctl status dogbox --no-pager

echo "✓ Installation complete!"
