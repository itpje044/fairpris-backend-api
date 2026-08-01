# Fairpris Backend

> **Stateless Node.js microservice** bridging the Frontend, Penneo digital signature, and Cube API.

No database. No sessions. No user management. Pure orchestration.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [API Endpoints](#api-endpoints)
4. [OAuth / PKCE Flow](#oauth--pkce-flow)
5. [Webhook Handling](#webhook-handling)
6. [Setup & Installation](#setup--installation)
7. [Environment Variables](#environment-variables)
8. [Docker](#docker)
9. [Testing with Postman](#testing-with-postman)
10. [Project Structure](#project-structure)

---

## Architecture Overview

```
Frontend
  │
  ▼
POST /agreement/create
  │  • Validate input (Zod)
  │  • Generate PDF (Puppeteer)
  │  • Create Penneo casefile
  │  • Upload PDF document
  │  • Add signer
  │  • Activate casefile
  └─► Return { signingUrl }
        │
        ▼
  Customer redirected to Penneo
        │
        ▼
  Customer signs digitally
        │
   ┌────┴──────────────┐
   │                   │
   ▼                   ▼
GET /oauth/callback   POST /webhooks/penneo
   │                   │
   ▼                   ▼
Exchange code       Verify event type
   │                   │
   └───────┬───────────┘
           ▼
   Verify status == completed
           │
           ▼
   Send customer → Cube API
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22+ |
| Framework | Express.js 5 |
| Language | TypeScript (strict mode) |
| HTTP Client | Axios |
| Config | dotenv |
| Validation | Zod |
| Logging | Winston |
| PDF | Puppeteer |
| Auth | OAuth 2.0 + PKCE (S256) / API Keys (WSSE) |

---

## API Endpoints

### `POST /agreement/create`

Creates a full Penneo signing casefile and returns the URL where the customer signs.

**Request body:**
```json
{
  "customer": {
    "firstName": "Lars",
    "lastName": "Jensen",
    "email": "lars@example.com",
    "phone": "12345678"
  },
  "agreement": {
    "cprNumber": "010101-1234",
    "address": "Nørrebrogade 1",
    "zipCode": "2200",
    "city": "København N",
    "gsrnNumber": "571313000000000001",
    "selectedProduct": "Spotpris Plus",
    "moveInDate": "2026-08-01"
  }
}
```

**Response:**
```json
{
  "success": true,
  "signingUrl": "https://sandbox.penneo.com/sign/...",
  "casefileId": 12345
}
```

---

### `GET /oauth/authorize`

Initiates the Authorization Code + PKCE flow. Redirects the browser to Penneo login.

---

### `GET /oauth/callback?code=...&state=...&casefileId=...`

Penneo redirects here after the user logs in. Exchanges the code for tokens, verifies agreement status, and syncs to Cube if completed.

| Param | Required | Description |
|-------|----------|-------------|
| `code` | ✅ | Authorization code from Penneo |
| `state` | ✅ | CSRF/PKCE state token |
| `casefileId` | Optional | Penneo casefile ID for status check |

---

### `POST /webhooks/penneo`

Receives Penneo event webhooks. Always returns `200`.

The actual route includes the global `/api` prefix:

```text
https://your-public-domain.example/api/webhooks/penneo
```

Set the public HTTPS endpoint and create or update the Penneo subscription:

```env
PENNEO_WEBHOOK_ENDPOINT=https://your-public-domain.example/api/webhooks/penneo
```

```bash
npm run webhook:setup
npm run webhook:test
```

`webhook:setup` is idempotent: it updates an existing subscription using the
same endpoint or creates one when none exists. When a subscription is created,
Penneo returns its verification secret once; store that value securely.

Put the returned secret into the deployed backend environment, then restart it:

```env
PENNEO_WEBHOOK_SECRET=the-secret-returned-by-penneo
```

Incoming deliveries are rejected unless their `X-Event-Signature` HMAC is
valid and its timestamp is within five minutes. Duplicate `X-Event-Id` values
are ignored.

### Frontend signing-status notifications (no database)

`POST /api/agreement/create` returns a signer URL, casefile ID, and a stateless
status token:

```json
{
  "success": true,
  "data": {
    "casefileId": 12345,
    "signingUrl": "https://app.penneo.com/signing/...",
    "statusToken": "..."
  }
}
```

The preferred frontend flow uses Server-Sent Events. Open the stream before
opening Penneo in a new tab:

```js
const { casefileId, signingUrl, statusToken } = response.data.data;
const apiBaseUrl = 'https://your-api-domain.example';

const events = new EventSource(
  `${apiBaseUrl}/api/agreement/events/${casefileId}?token=${encodeURIComponent(statusToken)}`,
);

events.addEventListener('status', (message) => {
  const update = JSON.parse(message.data);

  if (update.status === 'completed') {
    events.close();
    // Show success and continue the customer workflow.
  }

  if (['rejected', 'expired', 'failed', 'deleted'].includes(update.status)) {
    events.close();
    // Show the appropriate failure state.
  }
});

window.open(signingUrl, '_blank', 'noopener,noreferrer');
```

If SSE is unavailable, poll Penneo through the backend:

```js
const result = await fetch(
  `${apiBaseUrl}/api/agreement/status/${casefileId}`,
  { headers: { 'x-agreement-status-token': statusToken } },
).then(response => response.json());
```

Webhook statuses are held in memory for 24 hours. They are intentionally not
durable: restarting the process clears them, and multiple backend instances do
not share them. The polling endpoint falls back to Penneo when no in-memory
event exists. Use Redis or a database before running multiple instances.

**Supported events:**

| Event | Action |
|-------|--------|
| `webhook.subscription.test` | Confirm delivery |
| `sign.signer.opened` | Log signer activity |
| `sign.signer.signed` | Log signature (not completed yet) |
| `sign.casefile.completed` | Log that signed documents are ready |
| `sign.casefile.rejected` | Log warning |
| `sign.casefile.expired` | Log warning |
| `sign.casefile.failed` | Log error |

---

### `GET /health`

```json
{ "status": "ok", "service": "fairpris-backend", "timestamp": "...", "environment": "production" }
```

---

## OAuth / PKCE Flow

This service uses **Authorization Code + PKCE (S256)** for user-facing flows and **API Keys (WSSE)** for all server-to-server Penneo API calls.

### Authorization Code + PKCE

1. Frontend redirects to `GET /oauth/authorize`
2. Service generates `code_verifier` + `code_challenge` (SHA-256, Base64url)
3. Stores PKCE state in-memory with 10-min TTL
4. Redirects user to `https://sandbox.oauth.penneo.cloud/oauth/authorize?...`
5. Penneo redirects back to `GET /oauth/callback?code=...&state=...`
6. Service validates state, retrieves verifier, exchanges code for token
7. Verifies agreement status → sends to Cube if completed

### API Keys Grant (headless)

Used for all background Penneo API calls (casefile creation, document upload, etc.).
Credentials: `PENNEO_API_KEY` + `PENNEO_API_SECRET`.
Tokens are cached in-process and refreshed automatically.

---

## Webhook Handling

- Webhooks respond `200 OK` immediately before processing to prevent Penneo retries
- Duplicate events are deduplicated using an in-memory idempotency set
- Only `CaseFileCompleted` triggers a Cube API call
- Never crashes on bad payloads — all errors are logged silently

---

## Setup & Installation

### Prerequisites

- Node.js 22+
- npm 10+

### Install

```bash
npm install
```

### Configure

```bash
cp .env.example .env
# Edit .env with your Penneo and Cube credentials
```

### Run (development)

```bash
npm run dev
```

### Build (production)

```bash
npm run build
npm start
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `development` or `production` |
| `BASE_URL` | No | Public URL of this service |
| `PENNEO_CLIENT_ID` | ✅ | OAuth client ID |
| `PENNEO_CLIENT_SECRET` | ✅ | OAuth client secret |
| `PENNEO_API_KEY` | ✅ | API Keys grant key |
| `PENNEO_API_SECRET` | ✅ | API Keys grant secret |
| `PENNEO_REDIRECT_URI` | ✅ | Must match registered redirect URI in Penneo |
| `PENNEO_OAUTH_BASE_URL` | No | Defaults to sandbox |
| `PENNEO_API_BASE_URL` | No | Defaults to sandbox |
| `CUBE_API_URL` | No | Empty = mock mode |
| `CUBE_API_KEY` | No | Cube bearer token |

---

## Docker

### Build & Run

```bash
docker-compose up --build
```

### Production

```bash
NODE_ENV=production docker-compose up -d
```

---

## Testing with Postman

Import the collection from `docs/fairpris-backend.postman_collection.json`.

Set the `baseUrl` collection variable to `http://localhost:3000`.

**Test flow:**
1. Run **Health Check** — verify `status: ok`
2. Run **Create Agreement** — note the `signingUrl` and `casefileId`
3. Open `signingUrl` in a browser → sign
4. Simulate webhook with **Webhook – CaseFileCompleted**

---

## Project Structure

```
src/
├── config/
│   └── index.ts              # Centralized environment config
├── controllers/
│   ├── oauth.controller.ts   # OAuth initiate + callback
│   └── webhook.controller.ts # Penneo webhook handler
├── integrations/
│   ├── pdf/
│   │   └── pdf.service.ts    # Puppeteer PDF generator
│   └── penneo/
│       └── penneo.service.ts # (legacy shim)
├── middleware/
│   ├── error.middleware.ts   # Global error handler + HttpError classes
│   └── validate.middleware.ts# Zod request validation factory
├── modules/
│   └── agreement/
│       ├── controllers/
│       │   └── agreement.controller.ts
│       ├── dtos/
│       │   └── agreement.schema.ts
│       ├── repositories/
│       │   └── db.service.ts  # (legacy in-memory store, unused)
│       ├── routes/
│       │   └── agreement.routes.ts (legacy)
│       └── services/
│           ├── agreement.service.ts        # Main orchestrator
│           └── agreement.service.legacy.ts # Flat-payload compat
├── routes/
│   ├── agreement.routes.ts   # POST /agreement/create
│   ├── oauth.routes.ts       # GET /oauth/authorize + /callback
│   └── webhook.routes.ts     # POST /webhooks/penneo
├── services/
│   ├── cube.service.ts       # Cube API client
│   ├── oauth.service.ts      # PKCE + API Keys token management
│   └── penneo.service.ts     # Penneo casefile / document / signer API
├── types/
│   └── index.ts              # Shared TypeScript interfaces
└── utils/
    └── logger.ts             # Winston logger with sensitive-field redaction
```

---

## Security Notes

- Tokens (`access_token`, `refresh_token`, secrets) are **never logged**
- PKCE state entries expire after 10 minutes and are one-time-use
- API Key grant tokens are cached in-process with proactive refresh
- Helmet is configured; CORS is wide-open by default (restrict in production)
- Docker image runs as non-root user
