# Project overview

## What Chatbox is

An **internal company messaging platform** — invite-only chat for employees on iOS, Android, and web. **Enterprise-managed**, not a public/SaaS chat product, not a consumer-messenger clone.

- Audience: company employees only.
- Scale target: ~5,000 users.
- Login: **mobile number + OTP**.
- Signup: **invite-only** (no public sign-up endpoint anywhere).
- Admin: full management of users, invites, roles, groups, announcements, analytics.

## Security posture

- **Enterprise-managed security**, not Signal-style end-to-end encryption.
- The company needs admin control, audit logs, search, retention, reports, analytics — these are incompatible with full E2EE.
- Baseline controls: HTTPS/TLS in transit, encrypted storage where needed, signed/short-lived media URLs, RBAC, audit logs.
- True E2EE may be added later **only if company policy requires it**. Do not preemptively implement it.

## Hard exclusions (do not build unless reopened)

- ❌ Public sign-up / self-registration of any kind.
- ❌ Voice or video calling (out of scope for the product, not a "later" item).
- ❌ Email or SSO login — the only login path is mobile number + OTP.
- ❌ Federation with external chat tools.
- ❌ Signal-style E2EE in MVP (see security posture).

## MVP feature roadmap

Numbering is for reference only — order of execution is decided per-milestone (see [status.md](./status.md)).

1. Mobile-number + OTP login
2. Invite-only signup
3. Admin-created employee records
4. Admin user management
5. Bulk user import (CSV / XLSX)
6. Invite status tracking
7. Resend / revoke / expire invites
8. Role-based access control (RBAC)
9. Employee directory
10. Direct messages
11. Group chats — with full consumer-messenger feature parity: sent/delivered/read ticks (✓ / ✓✓ / blue ✓✓), online dot + last seen, typing indicator, reactions, reply/quote, edit (15-min window), delete (soft, "for me" / "for everyone"), @mentions, group per-recipient read counts, profile photos. Read receipts + last seen are mandatory in Internal/Confidential/Restricted (audit trail), not user-toggleable.
12. Department / team / project / location groups
13. Company announcements
14. Announcement read acknowledgments
15. Basic analytics dashboard
16. Audit logs
17. File / image sharing
18. Message search
19. Push notifications
20. User activation / deactivation
21. Force logout / session management
22. Reports and moderation

## Roles

`super_admin`, `company_admin`, `department_admin`, `group_admin`, `employee`, `auditor`.

Source of truth for the type: [`packages/types/src/index.ts`](../packages/types/src/index.ts).

## Permissions (planned)

`manage_users`, `send_invites`, `manage_groups`, `send_announcements`, `view_analytics`, `view_audit_logs`, `export_data`, `manage_retention`, `moderate_reports`.

Permissions attach to roles via a join table — not hard-coded in app code. See [data-model.md](./data-model.md).

## Invite / signup rules (business invariants)

- Only invited mobile numbers can register.
- One mobile number = one employee account. No re-use across deactivated accounts unless explicitly allowed.
- Invites expire after a configured period (configurable per-tenant; concrete value TBD).
- Revoked invites cannot be used.
- Deactivated users cannot log in.
- Admin can force-logout any user's sessions.
- Role and group membership is admin-controlled — users cannot self-assign.
- After signup, login is always mobile number + OTP (no password).

These are **business invariants**, not implementation hints. Whatever stack we use, these must hold.

## Analytics philosophy

- Track usage and metadata, never private message content.
- Default chart set lives in [data-model.md](./data-model.md#analytics-events).
- Build analytics on dedicated tables first; consider PostHog / Metabase only if the in-house set proves insufficient.

## Where the project is today

Skeleton stage — see [status.md](./status.md). Tooling and folder shape exist; auth, persistence, realtime, messaging logic are all unbuilt.
