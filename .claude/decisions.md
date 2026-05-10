# Decisions

Architectural and product decisions made for Chatbox, with the reasoning. Append-only log — do not silently rewrite history. If a decision is later reversed, add a new entry that supersedes the old one (and link them).

## Format

```
### YYYY-MM-DD — <short title>
**Decision:** what was decided.
**Why:** the reason / tradeoff considered.
**Status:** active | superseded by <link>.
```

---

### 2026-05-09 — Memory and docs live in repo, not user-home

**Decision:** All project memory and documentation lives under `chatbox/.claude/`. Do **not** write to `C:\Users\mgpan\.claude\projects\<chatbox>\memory\`.
**Why:** The user wants memory to travel with the repo, be visible to teammates, and survive machine moves. User-home memory hides context from collaborators and gets out of sync with code.
**Status:** active.

---

### 2026-05-09 — Mobile = React Native; Web + Admin = Next.js

**Decision:** React Native + Expo is **only** for iOS / Android. The web app and admin dashboard are built in Next.js (App Router), in the same Next.js app at first with `/chat` and `/admin` route segments.
**Why:** React Native for web is awkward for the things admin needs — tables, file handling, analytics dashboards, desktop UX. Sharing one Next app for chat + admin keeps auth/session reuse trivial. Splitting admin into its own app remains an option later.
**Status:** active.

---

### 2026-05-09 — Enterprise-managed security, not Signal-style E2EE

**Decision:** MVP uses **enterprise-managed security** (HTTPS/TLS, encrypted storage where needed, signed media URLs, RBAC, audit logs). Full end-to-end encryption is **not** implemented for MVP.
**Why:** The company needs admin control, audit logs, message search, retention policy, exports, moderation, and analytics. Those are fundamentally incompatible with full E2EE. True E2EE remains an option to revisit only if company policy demands it.
**Status:** active.

---

### 2026-05-09 — Voice / video calling is out of scope

**Decision:** No voice or video calling. Not even on the "later" list.
**Why:** Product is a text-first internal messenger; calls are explicitly excluded from the brief.
**Status:** active.

---

### 2026-05-09 — Login is mobile number + OTP only

**Decision:** The only authentication path is mobile number + OTP. No passwords, email, or SSO.
**Why:** Matches the company's onboarding (admin issues invite to a mobile number) and removes a class of credential management problems. Invite-only means there's no reason to expose other login surfaces.
**Status:** active.

---

### 2026-05-09 — Signup is invite-only, no public registration

**Decision:** No public sign-up endpoint, anywhere. A mobile number can register only if an active `Invite` exists for it.
**Why:** Internal-only product for ~5,000 employees. Public sign-up would be a security and compliance liability.
**Status:** active.

---

### 2026-05-09 — Default backend stack: Postgres + Prisma + Redis/BullMQ + S3-compatible storage

**Decision:** When the backend grows beyond stubs, the default picks are: PostgreSQL (DB) + Prisma (ORM) + Redis with BullMQ (cache + queues) + an S3-compatible object store (S3 / Cloudflare R2 / MinIO) for attachments. Specific S3-compatible vendor TBD before uploads are built.
**Why:** Each is the boring, well-documented choice for its slot, fits a relational data model, and is what the user proposed in the brief.
**Status:** active. (Vendor pick for object storage still open.)

---

### 2026-05-09 — Permissions, not roles, are checked in code

**Decision:** Authorization checks are written against **permissions** (`manage_users`, `send_invites`, …), not roles (`company_admin`, …). Roles map to permission sets via a `role_permissions` join table.
**Why:** Adding/removing a permission for a role becomes a data change, not a code change. Future custom roles or per-tenant permission tweaks are then trivial.
**Status:** active.

---

### 2026-05-09 — Consumer-grade messaging feature parity

**Decision:** MVP messaging includes the full consumer-grade feature set: sent/delivered/read ticks (✓ / ✓✓ / blue ✓✓), online presence dot, last seen, typing indicators, emoji reactions, reply/quote, edit (15-min window), delete (for me / for everyone, soft only), @mentions with autocomplete, group per-recipient read counts, profile photos. **Excluded:** voice notes, voice/video calls, stories — already locked out by prior decisions.
**Why:** user explicitly requested consumer-messenger feature parity. Overrides my earlier recommendation to defer presence/typing.
**Diverges from consumer apps on security:** read receipts and last seen are NOT user-toggleable in Internal/Confidential/Restricted channels — they are the audit trail. Admin-toggleable per channel only.
**Status:** active. Supersedes the earlier "skip presence and typing for MVP" recommendation.

---

### 2026-05-10 — Mobile work resumes on the original React Native + Expo plan

**Decision:** The mobile app stays on **React Native + Expo + Expo Router**. Do not pivot to Capacitor, PWA-as-app, WebView wrapper, TWA, or any other shortcut. Apple App Store + Google Play distribution via **EAS Build**.

**Why:**
- The 2026-05-09 mobile decision is still right. Web UX patterns (CSS variables, absolute positioning of thread overlays, IndexedDB, BroadcastChannel) don't translate well into a phone-shaped device anyway; native primitives (FlatList, SafeAreaView, KeyboardAvoidingView, native back, native push) are the right fit.
- Earlier this year we paused mobile due to an Expo monorepo issue (`EXPO_ROUTER_APP_ROOT` + workspace symlinks) and put energy into web. The web is now mature; resuming mobile is the next logical milestone.
- The user explicitly rejected Capacitor and PWA-APK shortcuts as "college-level" — we ship a real native app or we don't ship.
- Mobile UI must be rebuilt from scratch in RN primitives. The web's `<div style={…}>` components do not transfer. Every messaging behavior we implemented for web (bubbles, mentions, audience pill, infinite scroll, mirror composer, jumbo emoji, markdown-lite, read-more, etc.) needs an RN equivalent.

**Status:** active. Supersedes the implicit "mobile parked" state recorded in earlier `status.md` snapshots.

**How to apply:** When making mobile-side decisions, default to native APIs: `expo-sqlite` for persistence (not IndexedDB), `expo-notifications` for push (not service workers), `FlatList` for infinite scroll (not scrollTop math), `react-native-reanimated` for animations, `expo-image-picker` for attachments. Share types via `@chatbox/types` and validation via `@chatbox/validation` only — never import web app code.

---

*(Add the next decision here when one is made — e.g. choice of object-storage vendor, navigation library for mobile, hosting target, retention policy.)*
