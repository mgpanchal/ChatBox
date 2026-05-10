<div align="center">

# ChatBox

**An internal messaging platform for iOS, Android, and the web.**

Built for companies that want a real-time chat tool they actually own:
invite-only access, admin-managed users, and a full audit trail.

[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](#license)

</div>

---

## What it is

ChatBox is a private chat platform for companies of up to about 5,000 people.
The goal was simple: take the responsiveness people expect from a modern
messaging app, and pair it with the controls a company actually needs (admin
ownership of accounts, retention, audit, and access).

Three things drove every design decision:

1. **The company is in charge.** Accounts, roles, channels, retention, and
   audit logs are owned by admins, not end users.
2. **Mobile and web stay in lockstep.** Whatever ships on one platform ships
   on the other. Same realtime backbone, same features, same look.
3. **Everything is auditable.** Read receipts, last-seen, edits, and deletions
   are stored as evidence in Internal, Confidential, and Restricted channels.
   Users can't turn them off in those scopes.

> ChatBox is not a public/SaaS messenger and does not ship with end-to-end
> encryption. The threat model is "trusted internal platform with strong
> access controls", not "untrusted server".

---

## What you get

| Area              | Capabilities                                                                                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Messaging         | DMs, group chats, broadcast announcement channels, replies, edits (15-minute window), soft delete (for me / for everyone), message forwarding                                              |
| Realtime          | Sent/delivered/read ticks, online presence dot, last-seen, typing indicators, per-recipient read receipts, instant cross-device sync over Socket.IO                                        |
| Rich content      | Image and file attachments with signed URLs, image lightbox, jumbo emoji, markdown-lite (`*bold*`, `_italic_`, `~strike~`, `` `code` ``), `@mentions`                                      |
| Identity & RBAC   | Mobile-number + OTP login, six built-in roles, permission-based authorization (data-driven, not hard-coded), force-logout from admin, per-user device limit                                |
| Tenancy           | Multi-tenant data model with tenant-scoped suppressions, invites, and audit logs                                                                                                            |
| Privacy levels    | Public, Internal, Confidential, and Restricted channels with audience-scoped redaction and watermarked surfaces                                                                             |
| Admin console     | User management, bulk CSV/XLSX import, invite lifecycle, channel governance, flagged-message queue, audit log viewer, basic analytics                                                       |
| Offline & PWA     | Cached conversation list and threads (IndexedDB on web, AsyncStorage on mobile), persistent send queue with retries, service-worker push notifications                                     |
| Performance       | Two-tier cache (in-memory LRU + persistent), prefetch top conversations on hover, inline thumbnail avatars (data-URL), inverted FlatList / windowed message rendering                       |
| Boot UX           | Animated loading splash, hidden conversation IDs in the URL bar, deep prefetch on app start                                                                                                 |

---

## Architecture

```mermaid
flowchart LR
    subgraph Clients
      Web["apps/web<br/>Next.js 14 App Router<br/>(employee + admin)"]
      Mobile["apps/mobile<br/>Expo / React Native"]
    end

    subgraph Backend["apps/api  (NestJS 10)"]
      REST["REST controllers"]
      WS["Socket.IO gateway"]
      Workers["Background jobs"]
    end

    DB[("PostgreSQL<br/>(Prisma ORM)")]
    Redis[("Redis<br/>OTP, queues, rate limits")]
    OBJ[("Object storage<br/>S3 / R2 / local")]
    SMS["SMS / OTP provider"]
    PUSH["FCM + APNs<br/>via Expo Push"]

    Web -- HTTPS --> REST
    Web -- WebSocket --> WS
    Mobile -- HTTPS --> REST
    Mobile -- WebSocket --> WS

    REST --> DB
    WS --> DB
    REST --> OBJ
    REST --> Redis
    Workers --> Redis
    Workers --> SMS
    Workers --> PUSH
```

### Why this shape

A single Next.js app powers both the employee web client and the admin
dashboard. They live in the same codebase, separated only by route segments.
This keeps auth and session reuse trivial, and the admin pages can borrow
components from the chat side without copy-paste.

A single NestJS app exposes both the REST API and the Socket.IO gateway. We
don't run microservices for the MVP. The modules are cleanly separated, so
peeling one off later (say, the realtime fan-out) is straightforward if any
single concern starts to feel cramped.

Three small TypeScript packages (`@chatbox/types`, `@chatbox/validation`,
`@chatbox/config`) are shared between the API, the web app, and the mobile
app. They make the API contract the single source of truth across every
client.

---

## Repository layout

```
chatbox/
├── apps/
│   ├── api/         NestJS REST API + Socket.IO gateway + Prisma
│   ├── web/         Next.js 14 App Router (employee web + admin)
│   └── mobile/      Expo / React Native (iOS + Android)
├── packages/
│   ├── types/       Shared TypeScript domain types
│   ├── validation/  Shared Zod schemas
│   └── config/      Runtime constants
├── turbo.json       Turborepo task graph
├── package.json     npm workspaces root
└── docker-compose.yml
```

Apps depend on packages. Apps don't depend on each other. The only way one
app talks to another is over HTTP or WebSocket.

---

## Tech stack

| Layer            | Choice                                                  | Why                                                                       |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| Monorepo         | Turborepo + npm workspaces                              | Cached, parallel task graph; cross-app refactors are painless             |
| Language         | TypeScript 5.5 everywhere                               | One language across web, mobile, backend, and shared packages             |
| Web              | Next.js 14 App Router, React 18                         | SSR-ready, mature ecosystem, fits the admin-dashboard table workloads     |
| Mobile           | Expo SDK 54, React Native 0.81, React 19, Expo Router   | Real native binaries via EAS Build (no WebView wrapper, no PWA shortcut)  |
| Backend          | NestJS 10, Express, Socket.IO                           | Modular DI, first-class WS gateway, easy to test                          |
| ORM              | Prisma 5                                                | Type-safe queries, migrations, good Postgres ergonomics                   |
| Database         | PostgreSQL (Neon)                                       | Relational shape fits the entity list cleanly                             |
| Auth             | JWT access tokens + opaque refresh tokens in DB         | Standard, lets admins force-logout instantly                              |
| Cache / queues   | Redis + BullMQ (planned)                                | OTP throttling, invite expiry, push fan-out, analytics rollups            |
| Object storage   | S3 / R2 / MinIO (pluggable driver) or local             | Signed URLs for attachments; same code path locally and in prod           |
| Push             | Expo Push (FCM + APNs)                                  | One API for both iOS and Android                                          |
| Validation       | Zod, shared via `@chatbox/validation`                   | Same schemas server-side and client-side                                  |
| Realtime         | Socket.IO with JWT handshake                            | Reconnect, rooms-per-conversation, sticky online state                    |
| Tests            | Vitest / Jest (per app)                                 | TBD per workspace                                                         |

---

## Quick start

### Prerequisites

- **Node.js** 20 or later
- **npm** 11.5 (the `packageManager` field is pinned)
- **PostgreSQL** 14+ (a local instance or a managed service like Neon)
- **Redis** 6+ (optional during early dev, required once OTP rate limits and queues are wired)
- For mobile: **Expo CLI**, plus Xcode (iOS) or Android Studio (Android) for native builds. Day-to-day dev only needs Expo Go on your phone.

> **Windows users:** PowerShell may block `npm.ps1`. Use `npm.cmd` and `npx.cmd` instead.

### 1. Install dependencies

```bash
npm install
# or on Windows PowerShell:
npm.cmd install
```

This bootstraps every workspace via npm workspaces.

### 2. Configure environment

```bash
cp apps/api/.env.example apps/api/.env
```

Then open `apps/api/.env` and fill it in:

```dotenv
DATABASE_URL="postgresql://USER:PASS@HOST/db?sslmode=require"
DIRECT_URL="postgresql://USER:PASS@HOST/db?sslmode=require"
PORT=4000

JWT_SECRET=<64-char hex random, generate with `openssl rand -hex 32`>
ACCESS_TTL_MINUTES=15
REFRESH_TTL_DAYS=30

OTP_TTL_SECONDS=300
OTP_LENGTH=6
OTP_MAX_ATTEMPTS=5
OTP_RESEND_COOLDOWN_SECONDS=30

INVITE_TTL_DAYS=7
DEVICE_LIMIT_PER_USER=5
```

For the web app, create `apps/web/.env.local`:

```dotenv
NEXT_PUBLIC_API_BASE=http://localhost:4000/v1
```

### 3. Set up the database

```bash
cd apps/api
npx prisma migrate dev      # apply schema migrations
npx prisma db seed          # seed roles, permissions, demo tenant
```

### 4. Run everything

From the repo root:

```bash
npm run dev
# Turbo runs api, web, and mobile concurrently.
```

| Service | URL                                            |
| ------- | ---------------------------------------------- |
| API     | http://localhost:4000                          |
| Web     | http://localhost:3000                          |
| Mobile  | Open Expo Go and scan the QR printed by Metro  |

Or run a single workspace at a time:

```bash
npm run dev --workspace @chatbox/api
npm run dev --workspace @chatbox/web
npm run dev --workspace @chatbox/mobile
```

### 5. Common scripts

```bash
npm run build       # turbo build
npm run typecheck   # tsc --noEmit across workspaces
npm run lint        # eslint where configured
npm run format      # prettier --write .
```

---

## Security model

ChatBox is built as a trusted internal platform, not a zero-trust messenger.
The trade-offs that come with that are deliberate.

- **Transport** is HTTPS / TLS in production. CORS is allowlisted to known origins.
- **Auth** uses short-lived JWT access tokens (15 minutes by default) plus refresh
  tokens stored server-side. Sessions are revocable from the admin console;
  force-logout invalidates all of a user's devices instantly.
- **OTP** is rate-limited per mobile number, per IP, and per device. Attempt
  counts and cooldowns are configurable via environment variables.
- **RBAC** is permission-based via a `role_permissions` join. Granting or
  removing a permission is a data change, not a code change.
- **Audit** logs every privileged action: force-logouts, role changes, channel
  visibility changes, suppression edits.
- **Privacy levels.** In Confidential and Restricted channels, read receipts
  and last-seen are mandatory and not user-toggleable. Messages outside a
  viewer's audience are redacted on the server, never sent to the client.
- **Attachments** go through a pluggable storage driver. URLs are short-lived
  and signed. The local driver inlines tiny avatar thumbs as base64 data URLs
  to skip redundant fetches.
- **Headers** are locked down: HSTS, X-Content-Type-Options, frame ancestors
  blocked, referrer policy `strict-origin-when-cross-origin`.

End-to-end encryption is intentionally out of scope for the MVP. Full E2EE
would conflict with the audit, search, retention, and compliance features
that are core to the product. It can be revisited later if a customer's
policy requires it.

---

## Out of scope

These are not features and won't be built unless the decision is reopened:

- ❌ Public sign-up or self-registration
- ❌ Voice or video calls
- ❌ Email or SSO login (mobile + OTP only)
- ❌ Federation with external chat tools
- ❌ End-to-end encryption (see above)

---

## Screenshots

> Drop product screenshots into [`docs/screenshots/`](docs/screenshots) and
> they will render below.

| Web, chat thread          | Web, admin dashboard            | Mobile, chat thread        | Mobile, chats list         |
| ------------------------- | ------------------------------- | -------------------------- | -------------------------- |
| ![](docs/screenshots/web-chat.png) | ![](docs/screenshots/web-admin.png) | ![](docs/screenshots/mobile-chat.png) | ![](docs/screenshots/mobile-list.png) |

---

## Roadmap

The MVP feature list is in [.claude/project-overview.md](.claude/project-overview.md);
delivery status is in [.claude/status.md](.claude/status.md). Highlights:

- ✅ Mobile and web at parity for chat, presence, reactions, attachments, mentions
- ✅ Multi-tenant data model with audit logs and suppressions
- ✅ Admin console (users, invites, channels, flagged queue, audit)
- 🚧 Push notifications via Expo Push (FCM + APNs), pending credentials
- 🚧 EAS Build pipeline for production iOS / Android binaries
- 🚧 Pin messages, announcement read-acknowledgments
- 🚧 Redis + BullMQ for OTP throttling, invite expiry, push fan-out
- 🔜 SQLite (mobile) message persistence to replace the AsyncStorage blob
- 🔜 SAML / OIDC SSO option for organisations that require it

---

## Contributing

Contributions are welcome. If you'd like to help out:

1. Fork the repo and create a feature branch off `main`.
2. Run `npm install` at the root to set up the workspaces.
3. Make your change. Keep it focused, one topic per PR.
4. Run `npm run typecheck` before opening a PR.
5. Open a pull request with a short description of the change and why.

For larger changes (new modules, schema migrations, anything that touches the
realtime gateway), please open an issue first so we can talk through the
approach before you write the code.

---

## License

**Proprietary.** Copyright © ChatBox. All rights reserved.

This source is provided for internal use only. No part of this repository may
be copied, redistributed, or used outside the organisation without written
permission.
