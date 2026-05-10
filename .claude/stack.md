# Stack

Two columns: what is **installed and in use today**, and what is **planned but not installed yet**. Move rows from Planned → In use as they get wired in (and update in the same change).

## In use today

### Top-level tooling

- **Monorepo:** Turborepo `^2.0.14` + npm workspaces (`apps/*`, `packages/*`).
- **Package manager:** npm `11.5.0`. On Windows PowerShell use **`npm.cmd`** (not `npm`) — the `.ps1` shim is blocked by execution policy on this machine.
- **Language:** TypeScript `^5.5.4` everywhere.
- **Formatter:** Prettier `^3.3.3` (`.prettierrc` at repo root).

### `apps/api` — NestJS backend

- NestJS `^10.3.10` on `@nestjs/platform-express`.
- `src/main.ts`: boots `AppModule`, enables CORS (`origin: true, credentials: true`), listens on `process.env.PORT ?? 4000`.
- Modules: `AppModule` registers only `HealthController` (`GET /health`).

### `apps/web` — Next.js (App Router)

- Next.js `^14.2.5`, React `^18.3.1`, react-dom `^18.2.0`. **Note:** these versions are misaligned in `package.json` — see [status.md](./status.md#known-issues).
- Routes: `/`, `/chat`, `/admin` (all stubs).

### `apps/mobile` — React Native + Expo

- Expo `^51.0.31`, React Native `0.74.5`, React `18.2.0`.
- Single landing screen in `App.tsx`.

### Shared packages

- **`@chatbox/types`** — domain types (users, roles, invites, conversations, messages). Pure types.
- **`@chatbox/validation`** — Zod schemas. Today only `mobileNumberSchema`, `inviteUserSchema`.
- **`@chatbox/config`** — runtime constants (`appConfig`).

All three are referenced as `*` in app dependencies (resolved via npm workspaces).

## Planned (not installed)

| Layer | Pick | Notes |
|---|---|---|
| Database | **PostgreSQL** | Relational fits the entity list cleanly |
| ORM | **Prisma** | Pairs with Postgres; migrations + typed client |
| Realtime | **WebSockets / Socket.IO** | NestJS gateway in `apps/api` |
| Cache + queues | **Redis + BullMQ** | OTP throttling, invite expiry jobs, push fan-out, analytics rollups |
| Object storage | **S3 / Cloudflare R2 / MinIO** | For file/image sharing; pick one before building uploads |
| OTP / SMS | **Twilio / AWS SNS / local SMS provider** | Provider abstraction so the choice is swappable |
| Push | **FCM (Android) + APNs (iOS) via Expo Push** | TBD |
| Analytics UI | **Custom tables first**, optional PostHog / Metabase later | Keep raw events in our DB |
| HTTP client | TBD (likely fetch + tiny wrapper, or React Query / SWR) | Decide before web/mobile start consuming the API |
| Auth tokens | JWT (short-lived access) + refresh token in DB | Standard enterprise pattern |
| Tests | Vitest or Jest (per app) | None installed yet |
| CI | TBD (GitHub Actions likely) | None configured |

When we install one of these, **delete the row from this table** and add it to the "In use today" section above.

## Dev commands (run from repo root)

```powershell
npm.cmd install            # bootstrap workspaces
npm.cmd run dev            # turbo dev — runs all apps concurrently
npm.cmd run build          # turbo build (respects ^build dep order)
npm.cmd run lint           # turbo lint
npm.cmd run typecheck      # turbo typecheck
npm.cmd run format         # prettier --write .
```

Single-app commands:

```powershell
npm.cmd run dev --workspace @chatbox/api
npm.cmd run dev --workspace @chatbox/web
npm.cmd run dev --workspace @chatbox/mobile
```

## Windows gotchas

- Use `npm.cmd`, not `npm`, in PowerShell.
- Deleting `node_modules` can fail with long-path errors thanks to nested React Native packages. Use `Remove-Item -Recurse -Force` and, if it still fails, enable Windows long-path support or delete from a shorter path. Don't ad-hoc rename.
- Avoid editing `package-lock.json` by hand; regenerate via `npm.cmd install`.
