# WhatsApp Browser Server

Server-side WhatsApp Web support using headful Chrome on GCP e2-micro.

## Overview

This service:
- Runs ONE headful Chrome browser with WhatsApp Web
- User logs in via official QR code
- Syncs visible messages while browser is running
- Auto-kills browser after idle timeout
- Designed for ultra-low cost GCP e2-micro VMs

## Hard Constraints

- ❌ No headless Chrome
- ❌ No Puppeteer / whatsapp-web.js / Baileys
- ❌ No background always-on sync
- ❌ No multiple browsers
- ❌ No auto-scrolling
- ❌ No message sending automation

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Next.js App   │────▶│ wa-browser-server│────▶│   Chrome    │
│   (webapp)      │◀────│   (this pkg)     │◀────│ WhatsApp Web│
└─────────────────┘     └──────────────────┘     └─────────────┘
         │                       │
         ▼                       ▼
    ┌─────────┐           ┌──────────┐
    │Supabase │           │ /webhook │
    │   DB    │           │ endpoints│
    └─────────┘           └──────────┘
```

## API Endpoints

### Browser Control

- `GET /browser/status` - Get browser state
- `POST /browser/spawn` - Start browser for user
- `POST /browser/stop` - Stop browser
- `POST /browser/activity` - Record activity (extend idle timeout)
- `DELETE /browser/force` - Force kill (admin)

### Webhooks (from content script)

- `POST /webhook/linked` - Login state changed
- `POST /webhook/messages` - New messages detected
- `POST /webhook/heartbeat` - Keep-alive

### Health

- `GET /health` - Health check
- `GET /ready` - Readiness check

## Deployment

### Prerequisites

- GCP account with e2-micro VM
- Docker installed
- Static external IP

### GCP VM Setup

```bash
# Create VM
gcloud compute instances create wa-browser-server \
  --machine-type=e2-micro \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --zone=us-central1-a

# SSH into VM
gcloud compute ssh wa-browser-server

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

### Deploy

```bash
# Clone repo and navigate to package
cd packages/wa-browser-server

# Create .env file
cp .env.example .env
# Edit .env with your values

# Build and run
docker-compose up -d

# Check logs
docker-compose logs -f
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3002 |
| BACKEND_API_URL | Main backend URL | http://localhost:3001 |
| API_SECRET_KEY | Shared secret for auth | - |
| IDLE_TIMEOUT_MS | Browser idle timeout | 600000 (10 min) |
| ENABLE_VNC | Enable VNC for debugging | false |

## Cost

- e2-micro: ~$0-7/month (often free tier eligible)
- Ideal for demos, pilots, first users

## Security Notes

1. API key required for all endpoints
2. Browser runs as non-root user
3. Profile data persisted in Docker volume
4. No sensitive data logged

## What This Does

✔ Official QR login
✔ Real WhatsApp Web (not automation)
✔ Message sync while active
✔ Ultra-low cost
✔ Very low ban risk

## What This Does NOT Do

❌ Offline sync
❌ Multiple users at once
❌ Always-on browsers
❌ Background scraping
❌ Message sending
