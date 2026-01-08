# GCP Deployment Guide for WA Browser Server

## Prerequisites

1. Google Cloud SDK installed and configured
2. Docker installed locally (optional, for testing)
3. A GCP project with billing enabled

## Quick Start

### 1. Create the VM

```bash
# Set your project
gcloud config set project YOUR_PROJECT_ID

# Create e2-micro VM (free tier eligible)
gcloud compute instances create wa-browser-server \
  --machine-type=e2-micro \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --zone=us-central1-a

# Create firewall rules
gcloud compute firewall-rules create wa-browser-server-api \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:3002 \
  --target-tags=http-server
```

### 2. Setup the VM

```bash
# SSH into VM
gcloud compute ssh wa-browser-server --zone=us-central1-a

# Run setup script
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/YOUR_REPO/main/packages/wa-browser-server/scripts/setup-vm.sh)"
```

### 3. Deploy

```bash
# Clone your repo (or copy files)
cd /opt/wa-browser-server
git clone YOUR_REPO .

# Create .env file
cat > .env << EOF
PORT=3002
HOST=0.0.0.0
BACKEND_API_URL=https://your-backend.example.com
API_SECRET_KEY=$(openssl rand -hex 32)
IDLE_TIMEOUT_MS=600000
ENABLE_VNC=true
EOF

# Build and start
docker-compose up -d
```

### 4. Verify

```bash
# Check status
docker-compose ps

# View logs
docker-compose logs -f

# Test health endpoint
curl http://localhost:3002/health
```

## Static IP Setup

For production, assign a static IP:

```bash
# Reserve static IP
gcloud compute addresses create wa-browser-ip --region=us-central1

# Get the IP
gcloud compute addresses describe wa-browser-ip --region=us-central1 --format='get(address)'

# Assign to VM
gcloud compute instances delete-access-config wa-browser-server \
  --access-config-name="External NAT" --zone=us-central1-a

gcloud compute instances add-access-config wa-browser-server \
  --access-config-name="External NAT" \
  --address=YOUR_STATIC_IP \
  --zone=us-central1-a
```

## VNC Access (for QR Code)

If VNC is enabled, use a VNC client to connect:

```bash
# Port forward for secure access
gcloud compute ssh wa-browser-server --zone=us-central1-a -- -L 5900:localhost:5900

# Then connect VNC client to localhost:5900
```

Or use Cloud Console's SSH-in-browser and run:
```bash
docker-compose exec wa-browser-server x11vnc -display :99
```

## Costs

- e2-micro: ~$0-7/month (often free tier)
- 30GB disk: ~$1.20/month
- Network egress: Varies

**Total: $1-10/month typical**

## Troubleshooting

### Browser won't start
```bash
# Check logs
docker-compose logs wa-browser-server

# Restart container
docker-compose restart
```

### Out of memory
```bash
# Check memory
free -m

# Add swap (if not done)
sudo fallocate -l 1G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
```

### VNC not working
```bash
# Check if VNC is enabled
docker-compose exec wa-browser-server ps aux | grep vnc

# Check DISPLAY
docker-compose exec wa-browser-server echo $DISPLAY
```

## Security Notes

1. Always use HTTPS in production (via load balancer or Cloudflare)
2. Keep API_SECRET_KEY secure
3. Restrict firewall to your backend's IP if possible
4. Enable VNC only for debugging
