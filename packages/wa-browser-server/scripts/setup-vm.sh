#!/bin/bash
#
# GCP VM Setup Script for WA Browser Server
# Run this on a fresh Ubuntu 22.04 e2-micro VM
#

set -e

echo "=== WA Browser Server - GCP VM Setup ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "Please run as root (sudo ./setup-vm.sh)"
  exit 1
fi

# Update system
echo "Updating system packages..."
apt-get update
apt-get upgrade -y

# Install Docker
echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

# Install Docker Compose
echo "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
  apt-get install -y docker-compose-plugin
fi

# Add current user to docker group
if [ -n "$SUDO_USER" ]; then
  usermod -aG docker "$SUDO_USER"
  echo "Added $SUDO_USER to docker group"
fi

# Create app directory
APP_DIR="/opt/wa-browser-server"
mkdir -p "$APP_DIR"
cd "$APP_DIR"

# Configure swap (helpful for e2-micro)
echo "Configuring swap..."
if [ ! -f /swapfile ]; then
  fallocate -l 1G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

# Configure sysctl for better performance
echo "Configuring system settings..."
cat > /etc/sysctl.d/99-wa-browser.conf << EOF
# Reduce swappiness
vm.swappiness=10

# Increase file descriptors
fs.file-max=65535

# Network optimizations
net.core.somaxconn=1024
net.ipv4.tcp_max_syn_backlog=1024
EOF
sysctl -p /etc/sysctl.d/99-wa-browser.conf

# Setup firewall
echo "Configuring firewall..."
if command -v ufw &> /dev/null; then
  ufw allow 22/tcp    # SSH
  ufw allow 3002/tcp  # WA Browser Server API
  ufw allow 5900/tcp  # VNC (optional, for debugging)
  ufw --force enable
fi

# Create data directory for Chrome profiles
mkdir -p /data/profile
chmod 755 /data

# Print next steps
echo ""
echo "=== Setup Complete ==="
echo ""
echo "Next steps:"
echo "1. Clone your repository or copy files to $APP_DIR"
echo "2. Create .env file with your configuration"
echo "3. Run: docker-compose up -d"
echo ""
echo "Example .env file:"
echo "  BACKEND_API_URL=https://your-backend.com"
echo "  API_SECRET_KEY=your-secret-key"
echo "  ENABLE_VNC=true"
echo ""
echo "To check logs: docker-compose logs -f"
echo ""
