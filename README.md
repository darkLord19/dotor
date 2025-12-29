# Dotor

Privacy-first personal assistant that searches your emails, calendar, and messages without storing any data.

## Architecture

This is a production-grade pnpm monorepo with strict TypeScript, modern tooling, and layered architecture.

### Repository Structure

```
dotor/
├── apps/
│   ├── backend/       # Fastify API with layered architecture
│   └── webapp/        # Next.js web application
├── packages/
│   ├── shared/        # Shared types, schemas, and constants
│   ├── tsconfig/      # Shared TypeScript configurations
│   ├── logger/        # Structured logging utilities
│   ├── config/        # Shared tooling configurations
│   ├── ui/           # Shared UI components
│   └── extension/     # Chrome extension (legacy structure)
└── scripts/          # E2E tests & privacy audits
```

### Dependency Rules

- Apps may depend on packages
- Packages must never depend on apps
- No cross-app imports
- No circular dependencies

## Technology Stack

### Backend

- **Runtime**: Node.js ≥ 20
- **Framework**: Fastify
- **Database**: Supabase (PostgreSQL + Auth)
- **AI**: OpenRouter API
- **External APIs**: Google OAuth, Gmail API, Calendar API
- **Architecture**: Layered (Routes → Controllers → Services)

### Webapp

- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript (strict mode)
- **Styling**: CSS Modules + Tailwind CSS
- **Auth**: Supabase Auth with SSR

### Shared Infrastructure

- **Package Manager**: pnpm ≥ 9
- **TypeScript**: 5.9.3 with strict mode
- **Logging**: Structured JSON logs with Pino
- **Validation**: Zod schemas
- **Code Quality**: ESLint, Prettier

## Features

- **Gmail & Calendar Search**: Natural language queries over your email and schedule
- **LinkedIn & WhatsApp**: Browser extension for message search
- **AI-Powered Answers**: Synthesized responses with cited sources
- **Zero Storage**: All data processed in-memory only

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase project with auth enabled
- OpenRouter API key
- Google OAuth credentials

### Setup

1. Clone and install:

```bash
git clone <repo>
cd dotor
pnpm install
```

2. Configure environment variables:

**Backend** (`apps/backend/.env`):

```bash
# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# OpenRouter (LLM)
OPENROUTER_API_KEY=your_openrouter_key
OPENROUTER_MODEL=openai/gpt-4-turbo-preview
APP_URL=http://localhost:3000

# Google OAuth (for Gmail/Calendar access)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
GOOGLE_REDIRECT_URI=http://localhost:3001/google/callback

# Token encryption (generate with: openssl rand -base64 32)
TOKEN_ENCRYPTION_SECRET=your_random_32_byte_secret

# Web app URL (for OAuth redirects)
WEBAPP_URL=http://localhost:3000

# Optional
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:3000
```

**Webapp** (`apps/webapp/.env.local`):

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```

**Extension** (`packages/extension/.env`):

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
VITE_API_URL=http://localhost:3001
```

3. Build shared packages:

```bash
pnpm run build:packages
```

4. Start development servers:

```bash
# All services
pnpm dev

# Backend only
pnpm dev:backend

# Webapp only
pnpm dev:webapp
```

### Development Scripts

```bash
# Install dependencies
pnpm install

# Build all packages and apps
pnpm build

# Build only packages
pnpm run build:packages

# Build only apps
pnpm run build:apps

# Type check all workspaces
pnpm run typecheck

# Format code
pnpm run format

# Clean build artifacts
pnpm clean

# E2E tests
pnpm test:e2e

# Privacy audit
pnpm audit:privacy
```

## Backend Architecture

### Layered Design

```
apps/backend/src/
├── modules/           # Business modules
│   └── auth/
│       ├── auth.routes.ts      # HTTP endpoints
│       ├── auth.controller.ts  # Request handling
│       ├── auth.service.ts     # Business logic
│       └── auth.types.ts       # Module types
├── lib/
│   ├── supabase/      # Database clients
│   │   ├── client.ts  # Admin & user clients
│   │   └── admin.ts   # Admin-only operations
│   ├── errors/        # Error handling
│   │   ├── domain-errors.ts
│   │   └── error-handler.ts
│   ├── env/           # Environment configuration
│   ├── http/          # HTTP utilities
│   └── observability/ # Logging & metrics
├── middleware/        # Fastify middleware
│   ├── auth.ts        # JWT verification
│   └── request-id.ts  # Request tracking
├── routes/            # Legacy routes (being refactored)
├── app.ts            # Application setup
└── server.ts         # Server entry point
```

### Key Principles

1. **Layered Architecture**: Routes → Controllers → Services
2. **Supabase-First**: All data operations through Supabase
3. **Domain Errors**: Typed error classes with proper HTTP mapping
4. **Validation**: Zod schemas validate all inputs
5. **Security**: Helmet, CORS, rate limiting, JWT verification
6. **Observability**: Structured logging with request IDs

### Supabase Usage

- **Admin Client**: Privileged operations, bypasses RLS
- **User Client**: Request-scoped, respects RLS policies
- **Auth Client**: Public auth operations (login, signup)

## Webapp Architecture

### Structure

```
apps/webapp/
├── app/               # Next.js App Router
│   ├── (auth)/       # Auth route group (future)
│   ├── api/          # API routes
│   ├── ask/          # Ask page
│   ├── login/        # Login page
│   ├── settings/     # Settings page
│   └── layout.tsx    # Root layout
├── components/        # React components
├── lib/
│   ├── supabase/     # Supabase clients
│   │   ├── client.ts # Browser client
│   │   └── server.ts # Server client
│   └── config.ts     # Configuration
└── styles/           # Global styles
```

### Key Principles

1. **Server Components**: Default to server components
2. **Secure Auth**: Cookie-based sessions, no localStorage
3. **Type Safety**: Strict TypeScript, shared types
4. **Styling**: CSS Modules + Tailwind CSS

## Shared Packages

### @dotor/shared

Single source of truth for:

- **Types**: API request/response DTOs, domain types
- **Schemas**: Zod validation schemas
- **Constants**: API routes, error codes, HTTP status codes

### @dotor/logger

Structured logging with:

- JSON formatted logs
- Automatic PII redaction
- Request correlation IDs
- Pretty printing in development

### @dotor/tsconfig

Shared TypeScript configurations:

- `base.json`: Common strict settings
- `node.json`: Backend configuration
- `nextjs.json`: Next.js configuration

### @dotor/config

Shared tooling configurations:

- Prettier
- ESLint (future)

## Privacy Guarantees

- ✅ No query content stored in database
- ✅ No snippet/message content logged
- ✅ No background sync jobs
- ✅ Extension performs read-only DOM access
- ✅ 6-month date cap enforced on Gmail queries
- ✅ All data processed in-memory only
- ✅ No hardcoded credentials - all from environment variables
- ✅ OAuth tokens encrypted at rest with AES-256-GCM

## Security

### Backend

- Helmet for security headers
- Rate limiting (100 req/min)
- CORS allowlist
- JWT verification on protected routes
- Input validation with Zod
- Secrets via environment variables only
- Automatic PII redaction in logs

### Webapp

- HttpOnly cookies only
- Server-side session validation
- No token handling in client components
- Secure Supabase client setup

## Extension

Load the extension in Chrome:

1. Create `.env` file with required variables
2. Build: `cd packages/extension && pnpm build`
3. Open `chrome://extensions`
4. Enable Developer Mode
5. Load unpacked from `packages/extension/dist`

## Test Account

For development and testing:

- **Email**: `test@example.com`
- **Password**: `testpassword123`

## Contributing

### Code Quality Rules

- No `any` types
- Explicit return types for public APIs
- One responsibility per file
- Clear naming conventions
- No deep relative imports
- No dead code

### Before Committing

```bash
# Type check
pnpm run typecheck

# Format code
pnpm run format

# Run tests (if applicable)
pnpm test
```

## TODOs

- [ ] Complete backend module refactoring (Google, Ask, DOM modules)
- [ ] Implement proper route groups in webapp
- [ ] Add auth provider and guards in webapp
- [ ] Convert all CSS modules to Tailwind
- [ ] Add Husky + lint-staged
- [ ] Add Commitlint
- [ ] Add comprehensive tests
- [ ] Set up CI/CD pipeline

## License

Private
