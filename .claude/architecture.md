# Architecture

## Folder layout

```
chatbox/
├── apps/
│   ├── api/        # NestJS — REST + (future) realtime gateway
│   ├── web/        # Next.js App Router — employee web + admin dashboard
│   └── mobile/     # Expo / React Native — employee mobile app
├── packages/
│   ├── types/      # Shared TS domain types (no runtime)
│   ├── validation/ # Shared Zod schemas
│   └── config/     # Shared constants (appConfig)
├── turbo.json
├── package.json    # workspaces + root scripts
├── CLAUDE.md       # entry point for Claude
└── .claude/        # this directory — all project memory
```

## Key product split

- **Mobile:** React Native + Expo only — iOS + Android. Do **not** use React Native for web.
- **Web + admin:** Next.js handles everything in the browser, including the admin dashboard. Web and admin are **one Next.js app at first**, with route segments `/chat` and `/admin`. Splitting into two apps is allowed later if admin grows complex.
- **Backend:** Single NestJS app exposes REST + (future) WebSocket gateway. No microservices for MVP.

Why one Next.js app for web+admin: tables, file handling, analytics dashboards, and desktop UX are easier in Next than in React Native; one app keeps auth/session reuse trivial.

## Dependency direction

```
apps/api  ─┐
apps/web  ─┼──► packages/types, packages/validation, packages/config
apps/mobile─┘
```

- Apps depend on packages. Packages do **not** depend on apps.
- No app imports another app's source. Cross-app communication is HTTP / WebSocket only.
- Workspace dep version is `*`; npm resolves to the local workspace.

## Runtime topology (planned)

```
┌──────────────┐     ┌──────────────┐
│ web (3000)   │     │ mobile (Expo)│
└──────┬───────┘     └──────┬───────┘
       │  HTTPS + WebSocket │
       └─────────┬──────────┘
                 ▼
         ┌────────────────┐
         │  api (4000)    │  NestJS
         │  - REST        │
         │  - WS gateway  │  ← not built yet
         └────────┬───────┘
                  │
        ┌─────────┼─────────┐
        ▼         ▼         ▼
     Postgres  Redis     Object
     (Prisma) (BullMQ)   storage
                         (S3/R2/MinIO)
```

All three storage layers are **planned, not installed** — see [stack.md](./stack.md#planned-not-installed).

## Auth model

- Mobile number + OTP only. No passwords, no SSO, no email login.
- `mobileNumberSchema` in `@chatbox/validation` enforces `+?[1-9]\d{7,15}`.
- Invite-only registration: a `mobileNumber` cannot register unless an active `Invite` exists for it.
- Six roles map to a permission set via `roles` ↔ `permissions` join (`role_permissions`). Authorization is permission-checked, not role-checked, so adding/removing a permission doesn't require code changes.
- Sessions live server-side (`sessions` table) so admin can force-logout. Client holds short-lived JWT access token + opaque refresh token.

## Data model

The MVP entity list and analytics event list live in [data-model.md](./data-model.md). Read that file before adding new tables — it locks in naming and relationships.

## Realtime

- NestJS WebSocket gateway will live in `apps/api/src/modules/realtime/` (not built).
- Client-side: web uses `socket.io-client`; mobile uses the same. Connection is authenticated by JWT on handshake.
- Server publishes message + receipt + presence events; clients subscribe per conversation.

## CORS

`apps/api/src/main.ts` enables CORS with `origin: true, credentials: true` — permissive, suitable for dev. Tighten to an explicit allowlist before any non-local deploy and record the change in [decisions.md](./decisions.md).

## Conventions

See [conventions.md](./conventions.md). For known gaps and stubs, see [status.md](./status.md).
