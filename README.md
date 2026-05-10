<div align="center">

# ChatBox

**Enterprise-grade internal messaging platform for iOS, Android, and the web.**

Invite-only, admin-managed, built for organisations that need
real-time team communication with full audit, retention, and access control.

[![Node](https://img.shields.io/badge/node-%E2%89%A520-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Expo](https://img.shields.io/badge/Expo-SDK%2054-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![License](https://img.shields.io/badge/license-Proprietary-red.svg)](#license)

</div>

---

## Overview

ChatBox is a private, invite-only chat platform built for enterprises that need
the responsiveness of a modern consumer messenger combined with the controls of
an internal corporate tool.

The product targets organisations of up to ~5,000 employees and is designed
around three principles:

1. **Admin-managed, not user-driven** — accounts, roles, channels, retention,
   and audit are owned by the company.
2. **Mobile-first parity** — the iOS/Android app and the web app are at
   feature parity, both sharing the same realtime backbone.
3. **Audit-friendly by design** — read receipts, last-seen, message edits,
   and deletions are recorded as a tamper-evident audit trail in
   Internal/Confidential/Restricted channels.

> ChatBox is **not** a public/SaaS messenger and does **not** ship with
> end-to-end encryption. The threat model is "trusted internal platform with
> strong access controls," not "untrusted server."

---

## Highlights

| Pillar               | Capabilities                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Messaging**        | Direct messages, group chats, broadcast announcement channels, replies, edits (15-min window), soft delete (for me / for everyone), forwarding             |
| **Realtime**         | Sent/delivered/read ticks, online presence dot, last-seen, typing indicators, per-recipient read receipts, instant cross-device sync via Socket.IO         |
| **Rich content**     | Image / file attachments with signed download URLs, image lightbox, jumbo emoji, markdown-lite (`*bold*` `_italic_` `~strike~` `` `code` ``), @mentions   |
| **Identity & RBAC**  | Mobile-number + OTP login, six built-in roles, permission-based authorization (data-driven, not hard-coded), force-logout, per-user device limit          |
| **Tenancy**          | Multi-tenant data model with tenant-scoped suppressions, invites, and audit logs                                                                            |
| **Privacy levels**   | Public / Internal / Confidential / Restricted channels with audience-scoped redaction and watermarked surfaces                                              |
| **Admin console**    | User management, bulk CSV/XLSX import, invite lifecycle, channel governance, flagged-message queue, audit log viewer, basic analytics                       |
| **Offline & PWA**    | Cached conversation list and threads (IndexedDB on web, AsyncStorage on mobile), persistent send queue with retries, service-worker push notifications     |
| **Performance**      | LRU + persistent two-tier cache, prefetch top conversations on hover, inline thumb avatars (data-URL), inverted FlatList / windowed message rendering      |
| **Boot UX**          | Animated loading splash, hidden conversation IDs in the URL bar, deep prefetch on app start                                                                 |

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

- **One Next.js app** powers both the employee web client and the admin
  dashboard, separated by route segments. This keeps auth/session reuse trivial.
- **One NestJS app** exposes both REST and the Socket.IO gateway. No
  microservices in MVP — modules are cleanly separated and easy to extract later
  if any single concern (e.g. realtime fan-out) becomes a scaling pressure.
- **Shared TypeScript packages** (`@chatbox/types`, `@chatbox/validation`,
  `@chatbox/config`) ensure the API contract is the single source of truth for
  every client.

---

## Repository layout

```
chatbox/
├── apps/
│   ├── api/         NestJS REST API + Socket.IO gateway + Prisma
│   ├── web/         Next.js 14 (App Router) — employee web + admin dashboard
│   └── mobile/      Expo / React Native — iOS + Android
├── packages/
│   ├── types/       Shared TypeScript domain types
│   ├── validation/  Shared Zod schemas
│   └── config/      Runtime constants
├── turbo.json       Turborepo task graph
├── package.json     npm workspaces root
└── docker-compose.yml
```

Apps depend on packages. Apps **do not** depend on each other — cross-app
communication is HTTP / WebSocket only.

---

## Tech stack

| Layer            | Choice                                                 | Why                                                                          |
| ---------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Monorepo         | Turborepo + npm workspaces                             | Cached, parallel task graph; trivial cross-app refactors                     |
| Language         | TypeScript 5.5 everywhere                              | One language across web, mobile, backend, and shared packages                |
| Web              | Next.js 14 App Router, React 18                        | SSR-capable, mature ecosystem, fits the admin-dashboard table workloads      |
| Mobile           | Expo SDK 54, React Native 0.81, React 19, Expo Router  | Real native binaries via EAS Build (no WebView wrapper)                      |
| Backend          | NestJS 10, Express, Socket.IO                          | Modular DI, first-class WS gateway, easy to test                             |
| ORM              | Prisma 5                                               | Type-safe queries, migrations, good Postgres ergonomics                      |
| Database         | PostgreSQL (Neon)                                      | Relational shape fits the entity list cleanly                                |
| Auth             | JWT (short-lived access) + opaque refresh in DB        | Standard, lets admin force-logout instantly                                  |
| Cache / queues   | Redis + BullMQ (planned)                               | OTP throttling, invite expiry, push fan-out, analytics rollups               |
| Object storage   | S3 / R2 / MinIO (pluggable driver) / local             | Signed URLs for attachments; same code path locally and in prod              |
| Push             | Expo Push (FCM + APNs)                                 | Single API across iOS and Android                                            |
| Validation       | Zod (shared via `@chatbox/validation`)                 | Same schemas server-side and client-side                                     |
| Realtime         | Socket.IO with JWT handshake                           | Reconnect, rooms-per-conversation, sticky online state                       |
| Tests            | Vitest / Jest (per app)                                | TBD per workspace                                                            |

---

## Quick start

### Prerequisites

- **Node.js** ≥ 20.x
- **npm** ≥ 11.5 (`packageManager` is pinned)
- **PostgreSQL** 14+ (a local instance or a managed Postgres like Neon)
- **Redis** 6+ (optional during early dev; required once OTP rate limits and queues are wired)
- For mobile: **Expo CLI**, plus Xcode (iOS) or Android Studio (Android) for native builds. Day-to-day dev only needs Expo Go.

> **Windows users:** PowerShell may block `npm.ps1`. Use `npm.cmd` and `npx.cmd`.

### 1. Install

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

Edit `apps/api/.env`:

```dotenv
DATABASE_URL="postgresql://USER:PASS@HOST/db?sslmode=require"
DIRECT_URL="postgresql://USER:PASS@HOST/db?sslmode=require"
PORT=4000

JWT_SECRET=<64-char hex random — generate with `openssl rand -hex 32`>
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

### 3. Database

```bash
cd apps/api
npx prisma migrate dev      # apply schema migrations
npx prisma db seed          # seed roles, permissions, demo tenant
```

### 4. Run all services

From the repo root:

```bash
npm run dev
# turbo runs api, web, and mobile concurrently
```

| Service | URL                       |
| ------- | ------------------------- |
| API     | http://localhost:4000     |
| Web     | http://localhost:3000     |
| Mobile  | Open Expo Go and scan the QR printed by Metro |

Or run a single workspace:

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

ChatBox is designed as a **trusted internal platform**, not a zero-trust
messenger.

- **Transport:** HTTPS / TLS in production; CORS allowlisted to known origins.
- **Auth:** JWT access tokens (short TTL, default 15 min) + refresh tokens
  stored server-side. Sessions are revocable from the admin console (force
  logout invalidates all of a user's devices).
- **OTP:** Rate-limited per mobile number, per IP, per device. Attempts and
  cooldowns are configurable via env.
- **RBAC:** Authorization is permission-based (`role_permissions` join), so
  granting or removing a permission is a data change, not a code change.
- **Audit:** Every privileged action (force-logout, role change, channel
  visibility change, suppression edit) writes to `audit_logs`.
- **Privacy levels:** Confidential and Restricted channels keep read receipts
  and last-seen as a mandatory audit trail (not user-toggleable). Messages
  outside a viewer's audience are redacted server-side, never sent.
- **Attachments:** Stored via a pluggable storage driver. URLs are
  short-lived and signed; the local driver inlines tiny avatar thumbs as
  base64 data URLs to eliminate redundant fetches.
- **Headers:** Strict transport security, content-type sniff blocking, frame
  ancestors locked, referrer policy `strict-origin-when-cross-origin`.

End-to-end encryption is intentionally **out of scope for MVP** — full E2EE
would conflict with mandated audit, search, retention, and compliance
features. It may be added later if company policy requires it.

---

## Hard exclusions

To keep scope honest, these are **not** features and will not be built unless
the decision is reopened:

- ❌ Public sign-up / self-registration
- ❌ Voice or video calling
- ❌ Email or SSO login (mobile + OTP only)
- ❌ Federation with external chat tools
- ❌ End-to-end encryption (see security model)

---

## Screenshots

> Drop product screenshots into [`docs/screenshots/`](docs/screenshots) and
> they will render below.

| Web — chat thread          | Web — admin dashboard           | Mobile — chat thread        | Mobile — chats list        |
| -------------------------- | ------------------------------- | --------------------------- | -------------------------- |
| ![](docs/screenshots/web-chat.png) | ![](docs/screenshots/web-admin.png) | ![](docs/screenshots/mobile-chat.png) | ![](docs/screenshots/mobile-list.png) |

---

## Roadmap

The MVP feature list is tracked in [.claude/project-overview.md](.claude/project-overview.md);
delivery status is in [.claude/status.md](.claude/status.md). Highlights:

- ✅ Mobile + web feature parity for chat, presence, reactions, attachments, mentions
- ✅ Multi-tenant data model with audit logs and suppressions
- ✅ Admin console (users, invites, channels, flagged queue, audit)
- 🚧 Push notifications via Expo Push (FCM + APNs) — pending credentials
- 🚧 EAS Build pipeline for production iOS/Android binaries
- 🚧 Pin messages, announcement read-acknowledgments
- 🚧 Redis + BullMQ for OTP throttling, invite expiry, push fan-out
- 🔜 SQLite (mobile) message persistence to replace AsyncStorage blob
- 🔜 SAML/OIDC SSO option for organisations that require it

---

## Contributing

This is an internal repository. External contributions are not accepted at
this time. Internal contributors:

- Follow the conventions in [.claude/conventions.md](.claude/conventions.md).
- Record any architectural change in [.claude/decisions.md](.claude/decisions.md)
  with a date, decision, rationale, and "how to apply" note.
- Run `npm run typecheck` before opening a PR.

---

## License

**Proprietary.** Copyright © ChatBox. All rights reserved.
This source is provided for internal use only. No part of this repository may
be copied, redistributed, or used outside the organisation without written
permission.
