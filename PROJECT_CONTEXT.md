# Dotor — Project Context

This document is a repo-wide orientation for people new to Dotor: what each package does, how data flows through the system, what’s stored (and what isn’t), and how to run/deploy.

## One-sentence summary
Dotor is a privacy-first assistant that answers questions by searching your connected sources (Gmail/Calendar, Microsoft, and optionally WhatsApp/LinkedIn via extension + browser server) and synthesizing responses with citations.

## Repo layout (what lives where)

- `packages/backend/` — Fastify API (auth, OAuth connection setup, search, answer synthesis)
- `packages/webapp/` — Next.js web app (UI for login/settings/ask)
- `packages/extension/` — Chrome MV3 extension (LinkedIn + WhatsApp content scripts, sidepanel)
- `packages/wa-browser-server/` — Fastify service that runs a *real* WhatsApp Web session in a single Chrome instance (for QR login + syncing)
- `packages/ui/` — Shared CSS + small utilities used by webapp/extension
- `scripts/` — `e2e-test.ts` and `privacy-audit.ts`
- `supabase/migrations/` — database schema migrations (RLS policies included)

## High-level architecture

**Primary services**

- **Webapp** (`packages/webapp`): user-facing UI; uses Supabase auth and calls the backend.
- **Backend API** (`packages/backend`): core logic; validates Supabase JWT; coordinates source searches; calls LLM planner + synthesizer.
- **Extension** (`packages/extension`): optional “local source” bridge for LinkedIn and WhatsApp Web DOM access; talks to backend and Supabase.
- **WA Browser Server** (`packages/wa-browser-server`): optional companion service that maintains a WhatsApp Web session in Chrome and pushes sync events to backend.

**Ports (defaults)**
- Webapp: `http://localhost:3000`
- Backend: `http://localhost:3001`
- WA Browser Server: `http://localhost:3002`

## Core user flows

### 1) Auth (Supabase)
- Webapp uses Supabase for sign-in.
- Backend endpoints use a JWT pre-handler (`verifyJWT`) and often create a user-scoped Supabase client (`createUserClient(accessToken)`).

### 2) Connect a source (OAuth)
- **Google**: backend exposes routes like:
  - `GET /google/auth-url` (returns OAuth URL)
  - `GET /google/callback` (exchanges code, encrypts tokens, upserts into `connections`)
- **Microsoft**: similar pattern exists under `routes/microsoft.ts`.

Tokens are stored encrypted (see `packages/backend/src/lib/encryption.ts`).

### 3) Ask a question (`POST /ask`)
In `packages/backend/src/routes/ask.ts`:

1. Validates input (`zod`).
2. Loads prior “ask” conversation context (short-lived; cleaned after ~10 minutes).
3. Records a usage event **without storing query content**.
4. Fetches `connections` (Google/Microsoft/WhatsApp), decrypts tokens, refreshes when expired.
5. Loads feature flags (`feature_flags`) and decides which sources are enabled.
6. Calls the LLM “planner” (`planQuery`) to determine which sources are needed.
7. Searches enabled sources:
   - Gmail + Calendar via Google APIs
   - Outlook mail/calendar via Microsoft Graph
   - WhatsApp via DB-backed search (synced messages)
   - LinkedIn/WhatsApp “extension mode” when enabled (async-style flow)
8. Normalizes/merges results and synthesizes a final answer (`synthesizeAnswer`).

### 4) WhatsApp linking + syncing
This is an optional, separate flow from Gmail/Microsoft.

- Backend WA endpoints live in `packages/backend/src/routes/whatsapp.ts` (prefix `/wa/*`).
- WA Browser Server notifies backend using an API key header (`X-API-Key`).

Typical sequence:
1. User starts WhatsApp linking from the app.
2. Backend calls WA Browser Server to spawn Chrome (`POST /browser/spawn`).
3. User scans QR code (backend can fetch a screenshot for display: `GET /wa/screenshot`).
4. When WA is ready, WA Browser Server calls backend endpoints like:
   - `POST /wa/linked` (link state)
   - `POST /wa/contacts`
   - message sync endpoints (batch uploads)
5. Backend persists link/session state in `browser_instances` and a `connections` record of type `whatsapp`.

## Data model (Supabase)

Migrations in `supabase/migrations/` define and secure tables (RLS enabled).

Notable tables referenced by backend:

- `connections`
  - one row per user per connection type (`google`, `microsoft`, `whatsapp`, …)
  - stores encrypted tokens for OAuth providers

- `browser_instances`
  - WA browser session status and health timestamps

- `synced_conversations`, `synced_messages`
  - persistent “synced” chat history (used for WhatsApp search)

- `feature_flags`
  - global and per-user feature gating (LinkedIn/WhatsApp/Gmail + async mode)

- `conversations`
  - short-lived “ask” chat state (kept briefly; cleaned by backend)

- `usage_events`
  - records usage metadata (backend intentionally avoids storing query text)

## Privacy model (what’s stored)

- The backend tries to avoid storing **query text** and “ask” request content (see `usage_events` insert in `routes/ask.ts`).
- OAuth tokens are stored encrypted.
- WhatsApp syncing is DB-backed: `synced_messages.content` can be stored for search.

If you need a stricter “no message storage” mode, you’ll want to disable WA sync features (feature flags + do not deploy WA browser server).

## Configuration (environment variables)

These are the commonly required variables; see `README.md` for the full dev setup snippets.

**Backend (`packages/backend/.env`)**
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENROUTER_API_KEY`
- `OPENROUTER_MODEL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
- `TOKEN_ENCRYPTION_SECRET`
- `WEBAPP_URL`
- Optional feature flags:
  - `FF_ENABLE_LINKEDIN`, `FF_ENABLE_WHATSAPP`, `FF_ENABLE_GMAIL`, `FF_ENABLE_OUTLOOK`, `FF_ENABLE_ASYNC_MODE`
- WhatsApp integration:
  - `WA_BROWSER_SERVER_URL` (backend → WA server)
  - `WA_API_SECRET_KEY` (shared secret used as `X-API-Key`)

**Webapp (`packages/webapp/.env.local`)**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Extension (`packages/extension/.env`)**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_API_URL`

**WA Browser Server (`packages/wa-browser-server/.env`)**
- `BACKEND_API_URL`
- `API_SECRET_KEY` (same idea as backend’s `WA_API_SECRET_KEY`)
- `CORS_ORIGIN` (optional)

## Local development

From repo root:

```bash
pnpm install
pnpm dev
```

Useful focused commands:

```bash
pnpm dev:backend
pnpm dev:webapp
pnpm dev:wa
```

## Builds

```bash
pnpm build
```

## Extension usage

- Build in `packages/extension` (`pnpm build`), then load unpacked from `packages/extension/dist` in Chrome.
- The extension is MV3 and includes content scripts for:
  - `https://www.linkedin.com/messaging/*`
  - `https://web.whatsapp.com/*`
  - plus a webapp bridge script for allowed webapp origins (see `packages/extension/manifest.json`).

## Deployment notes

- `DEPLOY.md` contains a GCP free-tier approach for the WA Browser Server (Compute Engine VM + swap, Docker run).
- Root `Dockerfile.backend` / `Dockerfile.webapp` exist for container builds.

## Where to look first (code map)

- Backend server bootstrap: `packages/backend/src/server.ts`
- Ask orchestration: `packages/backend/src/routes/ask.ts`
- Google OAuth + connection management: `packages/backend/src/routes/google.ts`
- WhatsApp backend integration: `packages/backend/src/routes/whatsapp.ts`
- WA Browser Server entrypoint: `packages/wa-browser-server/src/server.ts`
- Extension manifest: `packages/extension/manifest.json`
- Shared styles/tokens: `packages/ui/src/variables.css`
