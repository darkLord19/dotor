# Deploying WhatsApp Browser Server to GCP Free Tier (Compute Engine)

To run the WhatsApp Browser Server **for free** and ensure it stays online 24/7 (required for WhatsApp Web sessions), you must use a **VM Instance** (Google Compute Engine) instead of Cloud Run. Cloud Run scales to zero, which would disconnect your WhatsApp session repeatedly.

We will use the **e2-micro** instance which is part of [GCP Free Tier](https://cloud.google.com/free).

## Prerequisites
- Google Cloud Project with Billing enabled
- `gcloud` CLI installed
- Existing Backend URL (e.g., `https://api.yourdomain.com`)

## 1. Build the Docker Image

We use Cloud Build (free for 120 mins/day) to build the image so we don't stress the small VM.

```bash
# Set your Project ID
export PROJECT_ID=your-project-id
gcloud config set project $PROJECT_ID

# Build the image
gcloud builds submit packages/wa-browser-server --tag gcr.io/$PROJECT_ID/wa-browser-server
```

## 2. Create the VM Instance

We create an `e2-micro` instance in `us-central1` (Free Tier region). We assign it the `cloud-platform` scope so it can pull the Docker image we just built.

```bash
gcloud compute instances create wa-server \
    --project=$PROJECT_ID \
    --zone=us-central1-a \
    --machine-type=e2-micro \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB \
    --boot-disk-type=pd-standard \
    --scopes=https://www.googleapis.com/auth/cloud-platform \
    --tags=http-server
```

*(Note: "Standard persistent disk" and "e2-micro" are key for the Free Tier)*

## 3. Configure the VM

The `e2-micro` only has 1GB RAM. Chrome needs more, so we **must** enable Swap memory.

1. **SSH into the VM**:
   ```bash
   gcloud compute ssh wa-server --zone=us-central1-a
   ```

2. **Run the following commands inside the VM** to setup Swap and Docker:

   ```bash
   # 1. Create 2GB Swap file (Prevents Chrome crashes)
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

   # 2. Install Docker
   sudo apt-get update
   sudo apt-get install -y docker.io

   # 3. Allow running docker without sudo (Fixes permission issues)
   sudo usermod -aG docker $USER
   newgrp docker

   # 4. Configure Docker Auth (to pull your image)
   gcloud auth configure-docker
   ```

## 4. Run the Container

Still inside the VM, start the server. Replace the values for `BACKEND_API_URL` and `WA_API_SECRET_KEY`.

```bash
# Run container in background (detached)
docker run -d \
  --name wa-server \
  --restart unless-stopped \
  --network host \
  -e BACKEND_API_URL="https://your-backend.com" \
  -e WA_API_SECRET_KEY="super-secret-key-123" \
  -e PORT=3002 \
  gcr.io/YOUR_PROJECT_ID/wa-browser-server
```
*(Replace `YOUR_PROJECT_ID` with your actual project ID)*

## 5. Open Firewall Port

Exit the SSH session (`exit`) and run this on your local machine to allow traffic to port 3002:

```bash
gcloud compute firewall-rules create allow-wa-server \
    --allow tcp:3002 \
    --target-tags=http-server
```

## 6. Finish

1. Get your VM's External IP:
   ```bash
   gcloud compute instances list
   ```
2. Your server URL is `http://<EXTERNAL_IP>:3002`.
3. Update your **Backend** environment variable:
   ```
   WA_BROWSER_SERVER_URL=http://<EXTERNAL_IP>:3002
   ```
