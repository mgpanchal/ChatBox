# Implementation status

Snapshot of what's *actually working* vs *placeholder* as of **2026-05-10**. Update this file whenever a row changes state — it is the single source of truth for "is X built yet?"

## Legend

- ✅ done — wired end to end
- 🟡 partial — exists but incomplete (see notes)
- ⛔ stub — UI/shape only, no real behavior
- ❌ not started

## Headline

Most of the MVP messaging system is live. Web app is the active surface. Mobile is parked. Big remaining items are announcements + ACK, push notifications, analytics dashboard, and a few admin niceties (force-logout-all, deactivate-from-UI).

## API (`apps/api`) — NestJS 10 + Prisma 5 + Postgres (Neon SG)

| Module / feature | State | Notes |
|---|---|---|
| Bootstrap, `GET /health` | ✅ | Listens on `PORT` (4000) with global `/v1` prefix |
| Auth — OTP issue + verify | ✅ | bcrypt-hashed codes, 30s resend cooldown, 5 wrong-attempts cap, **5 issues/hour per number** rate cap, **per-IP throttle** via `@nestjs/throttler` |
| Auth — JWT + refresh tokens | ✅ | Access TTL configurable (1440 min in dev), opaque refresh, `Session` table with revoke |
| Auth — Devices | ✅ | Device limit env-gated (default 50 in dev), `pushToken` column ready for FCM/APNs |
| Auth — Logout / refresh / sessions | ✅ | Per-session revoke; **no atomic "revoke all"** — pending |
| Users — `/me`, `/users` directory | ✅ | Returns `photoUrls` (4 WebP variants) on every shape |
| Users — `/me/photo` upload + remove | ✅ | sharp-based 4-variant pipeline (64/128/256/512 WebP) |
| Users — `/me/devices` | ✅ | Lists active sessions/devices |
| Conversations — DM, group, announcement | ✅ | `findOrCreateDirect`, `addMembers`, `removeMember`, `leave` |
| Conversations — sensitivity classes | ✅ | `public`/`internal`/`confidential`/`restricted` enum on Conversation |
| Conversations — list, get, members | ✅ | List endpoint includes `otherPhotoUrls` for DM rendering |
| Messages — send, edit, delete | ✅ | Edit window 15 min; soft-delete for everyone |
| Messages — reactions | ✅ | Toggle endpoint; realtime broadcast |
| Messages — replies / quotes | ✅ | `replyToMessageId` + preview |
| Messages — @user + @team mentions | ✅ | Team mentions trigger audience restriction; suppressed in DMs |
| Messages — audience filtering | ✅ | `MessageAudienceUser` + `MessageAudienceTeam` join tables; split broadcast (full to audience, redacted to others) |
| Search — Postgres FTS | ✅ | GIN index on `to_tsvector('english', body)`, `websearch_to_tsquery`, **cursor pagination** (`?before=...&limit=...`), parameterized `Prisma.sql` (no Unsafe) |
| Storage — local + S3 driver | ✅ | Pluggable via `STORAGE_DRIVER` env; signed URLs via JWT for local |
| Storage — image pipeline | ✅ | Avatar (4 sizes, WebP) and attachment (thumb 200, preview 1280, original) |
| Uploads — `/uploads`, `/uploads/:id/download` | ✅ | **Strict MIME allowlist + magic-byte sniffing** (jpeg/png/gif/webp/pdf/zip verified) + forbidden-extension blocklist |
| Realtime — Socket.IO gateway | ✅ | JWT in `socket.handshake.auth` only (query-param path removed); `pingInterval=15s, pingTimeout=10s` for fast stale-presence detection |
| Realtime — events | ✅ | `message:new`, `message:receipt`, `message:reaction`, `message:edited`, `message:deleted`, `presence`, `typing` |
| Realtime — presence + last-seen | ✅ | In-memory map; emits on connect/disconnect |
| Realtime — receipts (delivered + read) | ✅ | Per-message receipts; "read up to messageId" bulk path |
| DLP scanner | ✅ | Card (Luhn), Aadhaar, PAN, IFSC, IBAN, email, private key block; results stored as `flaggedReasons` JSON |
| Admin — invites (create / bulk / list / revoke) | ✅ | CSV bulk endpoint exists; per-row error reporting |
| Admin — users (list / status / role) | ✅ | `adminSetUserStatus`, `adminSetAdmin` |
| Admin — channels (list / create) | ✅ | Sensitivity-aware, members can be admin-assigned |
| Admin — flagged messages tab | ✅ | `/admin/flagged` returns rows where `flaggedReasons IS NOT NULL`; rendered in admin UI |
| Admin — audit log | ✅ | All auth, message, admin actions logged |
| Admin — stats endpoint | ✅ | Counts only — no charts on the FE side |
| Validation | ✅ | Zod schemas via `ZodValidationPipe`, scoped to `@Body(...)` |
| Throttling | ✅ | `@nestjs/throttler` wired globally; OTP at 10/min, send at 60/min, search at 30/min |
| Tests | ❌ | No framework installed |

## Web (`apps/web`) — Next.js 14 App Router

| Page / feature | State | Notes |
|---|---|---|
| `/login` (mobile-number) | ✅ | E.164 input, dev-mode shows OTP code in response |
| `/login/otp` | ✅ | 6-cell OTP input, resend with countdown |
| `/(app)/layout.tsx` (rail) | ✅ | Subscribes to `meStore`; avatar updates cross-tab via BroadcastChannel |
| `/(app)/chat` (sidebar) | ✅ | Sections: Pinned, Channels, Announcements, DMs; per-row unread badge; presence dot; **cached in IDB**; prefetches top 12 chats + on hover |
| `/(app)/chat/[id]` | ✅ | Bubbles, ticks, date separators, sender runs, avatar coloring (A–Z), inline `@mention` highlight in composer, audience pill, time inline at end of body, typing indicator inline at thread bottom |
| `/(app)/chat/[id]` — search overlay | ✅ | In-conversation FTS w/ jump-to-message |
| `/(app)/people` | ✅ | Department filter chips + name search; **cached via directoryStore** |
| `/(app)/activity` | ✅ | Mentions + announcements + unread; uses cached convo list |
| `/(app)/admin` | ✅ | Tabs: overview, invites, users, channels, **flagged (wired)**, audit |
| `/(app)/you` | ✅ | Profile + photo crop/upload, devices list, sign-out clears all caches |
| Caching layer | ✅ | L1 LRU Map (cap 50) + L2 IndexedDB (debounced 250ms write-through, 200-msg-per-chat trim, 30s freshness window) + BroadcastChannel cross-tab + `navigator.storage.persist()` |
| Stores | ✅ | `meStore`, `conversationCache`, `conversationListStore`, `directoryStore`, `teamsStore` — all hydrate from IDB on app start |
| Service worker (PWA) | ✅ | Branded notifications, manifest |
| Tests | ❌ | None |
| Production build | 🟡 | Last full build untested in this session |

## Mobile (`apps/mobile`)

| Feature | State | Notes |
|---|---|---|
| Expo + Router skeleton | ✅ | Expo Router 3.5 |
| Auth UI | 🟡 | Phone + OTP screens exist, no working backend wire-up |
| Chat UI | 🟡 | Mock-only; not wired to real API |
| Status | ⛔ | **Parked.** Pivoted to web after Expo monorepo `EXPO_ROUTER_APP_ROOT` issues |

## Pending high-value items

| # | Feature | Why it matters | Rough scope |
|---|---|---|---|
| Push notifications | FCM / APNs gateway, deviceToken store, send-on-mention/DM | Mobile doorway + missed-message reach | 5 days |
| Announcements composer | Schema supports `kind=announcement`; need create UI + read-ACK | MVP roadmap item 13–14 | 3 days |
| Analytics dashboard | Stats endpoints exist, no charts | MVP roadmap item 15 | 3 days |
| User activate/deactivate UI | API ready, no admin button | MVP roadmap item 20 | 0.5 day |
| Force-logout-all-devices | Per-device works; need single endpoint + button | MVP roadmap item 21 | 0.5 day |
| Reports & moderation flow | Flagged tab shows DLP hits; no resolve/appeal | MVP roadmap item 22 | 2 days |
| Mobile app revival | Solve Expo monorepo setup; wire to real API | Whole mobile half of product | 1–2 weeks |
| Delta sync (`?since=msgId`) | Server returns only new messages on reconnect | Caps reconnect cost; not yet needed at current scale | 1 day |
| Virtualized message list | Long threads (1000+) get janky | Only matters for power channels | 1 day |

## Recommended next milestone

**Resume the mobile app (iOS + Android) on Expo / React Native.** Per [decisions.md](./decisions.md#2026-05-10--mobile-work-resumes-on-the-original-react-native--expo-plan) we ship a real native app, not a WebView wrapper.

### Mobile rebuild — phased plan

| Phase | Scope | Estimated time |
|---|---|---|
| **0 — Bootstrap** | Verify Expo dev tools on Windows, run app on phone via Expo Go, confirm monorepo metro config still works, fix any deps drift | 1–2 days |
| **1 — Foundation** | `apps/mobile/src/api.ts` ported from web, AsyncStorage-backed token store, login + OTP wired to real API, JWT refresh interceptor, route-guarded tabs | 4–7 days |
| **2 — Realtime + core data** | Conversation list (FlatList), socket.io-client wired with JWT handshake, presence + typing + receipts, send message, basic chat thread | 1 week |
| **3 — Messaging UX parity** | Bubbles + ticks + sender colors, date separators, sender runs, A–Z avatar palette, reactions, replies, edits, deletes, audience pill, sensitivity badge, watermark, search, infinite scroll via FlatList inverted + onEndReached | 2–3 weeks |
| **4 — Native polish** | `expo-notifications` push (FCM + APNs), `expo-image-picker` + crop, camera capture, file attachments, native back button (Android), splash screen, app icon, haptics on key actions | 1–2 weeks |
| **5 — Distribution** | EAS Build setup, Apple Developer Program enrolment ($99/yr), Google Play Developer ($25 one-time), TestFlight beta, Play Internal Track, internal-testing distribution to ~5 employees | 3–5 days |

**Total realistic effort:** 6–9 weeks of focused work for a single dev.

### What stays untouched on the web side

Web app is mature. While mobile is being built, web should only get **bugfixes** and **shared-API changes** (so the API doesn't drift from what the new mobile client expects). New web features (announcements composer, push notifs UI, force-logout-all UI, etc.) wait until mobile catches up — otherwise the gap between platforms widens.

### Deliverable per phase

- Phase 0 → app boots on phone via Expo Go.
- Phase 1 → login screen sends a real OTP and tokens are persisted.
- Phase 2 → list + open + send + receive messages on real conversations.
- Phase 3 → feels like the web app, in your hand.
- Phase 4 → push notification arrives when someone @mentions you with the app closed.
- Phase 5 → APK + IPA in test track, installable on any team member's phone.

When the mobile app reaches Phase 5, this section gets rewritten — likely to "Announcements composer + push integration on mobile" as the next milestone.
