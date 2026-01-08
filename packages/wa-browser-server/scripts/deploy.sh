#!/bin/bash
#
# Deploy WA Browser Server to GCP
# Usage: ./deploy.sh <vm-name> [zone]
#

set -e

VM_NAME="${1:-wa-browser-server}"
ZONE="${2:-us-central1-a}"
PROJECT_ID=$(gcloud config get-value project 2>/dev/null)

if [ -z "$PROJECT_ID" ]; then
  echo "Error: No GCP project configured. Run: gcloud config set project YOUR_PROJECT"
  exit 1
fi

echo "=== Deploying WA Browser Server ==="
echo "VM: $VM_NAME"
echo "Zone: $ZONE"
echo "Project: $PROJECT_ID"
echo ""

# Check if VM exists
if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" &>/dev/null; then
  echo "VM $VM_NAME exists, updating..."
else
  echo "Creating new VM $VM_NAME..."
  
  gcloud compute instances create "$VM_NAME" \
    --machine-type=e2-micro \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB \
    --boot-disk-type=pd-standard \
    --zone="$ZONE" \
    --tags=wa-browser-server \
    --metadata=startup-script='#!/bin/bash
      apt-get update
      apt-get install -y docker.io docker-compose
      systemctl enable docker
      systemctl start docker'
  
  echo "Waiting for VM to be ready..."
  sleep 30
fi

# Create firewall rules if they don't exist
if ! gcloud compute firewall-rules describe wa-browser-server-api &>/dev/null; then
  echo "Creating firewall rules..."
  gcloud compute firewall-rules create wa-browser-server-api \
    --direction=INGRESS \
    --priority=1000 \
    --network=default \
    --action=ALLOW \
    --rules=tcp:3002,tcp:5900 \
    --target-tags=wa-browser-server
fi

# Build and push Docker image (optional - for Container Registry)
# echo "Building Docker image..."
# docker build -t "gcr.io/$PROJECT_ID/wa-browser-server:latest" .
# docker push "gcr.io/$PROJECT_ID/wa-browser-server:latest"

# Copy files to VM
echo "Copying files to VM..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$(dirname "$SCRIPT_DIR")"

gcloud compute scp --zone="$ZONE" --recurse \
  "$PACKAGE_DIR/Dockerfile" \
  "$PACKAGE_DIR/docker-compose.yml" \
  "$PACKAGE_DIR/docker-entrypoint.sh" \
  "$PACKAGE_DIR/package.json" \
  "$PACKAGE_DIR/tsconfig.json" \
  "$PACKAGE_DIR/src" \
  "$VM_NAME:/tmp/wa-browser-server/"

# Deploy on VM
echo "Deploying on VM..."
gcloud compute ssh "$VM_NAME" --zone="$ZONE" --command='
  sudo mkdir -p /opt/wa-browser-server
  sudo cp -r /tmp/wa-browser-server/* /opt/wa-browser-server/
  cd /opt/wa-browser-server
  
  # Check for .env file
  if [ ! -f .env ]; then
    echo "Warning: .env file not found. Create one with your configuration."
    echo "Example:"
    echo "  BACKEND_API_URL=https://your-backend.com"
    echo "  API_SECRET_KEY=your-secret-key"
    exit 1
  fi
  
  # Build and start
  sudo docker-compose build
  sudo docker-compose up -d
  
  echo ""
  echo "Deployment complete!"
  echo "Check status: sudo docker-compose ps"
  echo "View logs: sudo docker-compose logs -f"
'

# Get external IP
EXTERNAL_IP=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo ""
echo "=== Deployment Complete ==="
echo "External IP: $EXTERNAL_IP"
echo "API URL: http://$EXTERNAL_IP:3002"
echo "Health: http://$EXTERNAL_IP:3002/health"
echo ""
echo "VNC (if enabled): $EXTERNAL_IP:5900"
echo ""
