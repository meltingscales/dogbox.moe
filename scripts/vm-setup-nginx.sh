#!/bin/bash
set -e

echo "Setting up nginx with Let's Encrypt SSL..."

# Install nginx and certbot
echo "Installing nginx and certbot..."
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx

# Stop nginx temporarily
sudo systemctl stop nginx

# Get SSL certificate from Let's Encrypt
echo "Obtaining SSL certificate from Let's Encrypt..."
sudo certbot certonly --standalone -d dogbox.moe -d www.dogbox.moe --non-interactive --agree-tos --email admin@dogbox.moe

# Install nginx configuration
echo "Installing nginx configuration..."
sudo mv /tmp/nginx.conf /etc/nginx/sites-available/dogbox
sudo ln -sf /etc/nginx/sites-available/dogbox /etc/nginx/sites-enabled/dogbox
sudo rm -f /etc/nginx/sites-enabled/default

# Test nginx configuration
sudo nginx -t

# Enable and start nginx
sudo systemctl enable nginx
sudo systemctl start nginx

# Set up auto-renewal
echo "Setting up SSL certificate auto-renewal..."
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer

echo "✓ Nginx with SSL configured successfully!"
echo "✓ SSL certificates will auto-renew via certbot.timer"
echo ""
echo "Next steps:"
echo "1. Point dogbox.moe DNS A record to this VM's IP"
echo "2. Wait for DNS propagation (can take a few minutes to 48 hours)"
echo "3. Access https://dogbox.moe"
