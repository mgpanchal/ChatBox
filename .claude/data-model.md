# Data model (MVP)

Single source of truth for the entity list and analytics event list. **Do not invent new tables casually** — if a use case needs one that's not here, propose it in [decisions.md](./decisions.md) before building.

## MVP entities

These are the tables planned for the MVP backend. Field-level columns are not finalized — they will land in the Prisma schema. Treat this list as the **set** of tables and their **purpose**, not their exact columns.

| Table | Purpose |
|---|---|
| `users` | Account row, one per mobile number. Status: `invited` / `active` / `deactivated`. |
| `employee_profiles` | HR-side data attached to a user (display name, employee_id, department, location). Separated so we can swap HR sources later. |
| `invites` | Pending/sent invitations. Status: `pending` / `sent` / `accepted` / `expired` / `revoked`. |
| `otp_codes` | One-time codes issued for login. Time-bound, single-use, rate-limited. |
| `sessions` | Server-side session rows, one per active login. Enables force-logout. |
| `devices` | Devices registered to a user (push tokens, platform, last seen). |
| `roles` | Static role names (`super_admin` … `auditor`). |
| `permissions` | Static permission slugs (`manage_users`, etc.). |
| `user_roles` | Join: which roles a user has. |
| `role_permissions` | Join: which permissions a role grants. (Permissions are checked, not roles.) |
| `departments` | Org structure unit. Drives default group membership and analytics slicing. |
| `groups` | Group chat / team / project / location group. |
| `group_members` | Join: which users belong to which group. |
| `conversations` | A chat container — `direct`, `group`, or `announcement`. |
| `conversation_members` | Join: which users belong to a conversation, with role-in-conversation if needed. |
| `messages` | Individual messages. Columns: `reply_to_message_id` (self FK, nullable), `edited_at` (nullable, set on edit within 15-min window), `deleted_at` (nullable), `deleted_for` enum (`me` / `everyone`). Soft-delete only — never hard-delete. |
| `message_attachments` | File / image attachments tied to a message. |
| `message_receipts` | Per-recipient state. Three timestamps: `sent_at` (server received from sender), `delivered_at` (recipient device acked), `read_at` (recipient opened convo). Drives ✓ / ✓✓ / blue ✓✓ ticks and announcement reads. |
| `message_reactions` | `(message_id, user_id, emoji)`, unique per user-emoji. Reactions on messages. |
| `announcements` | Admin-broadcast posts. Linked to an `announcement` conversation. |
| `announcement_reads` | Per-user ack of an announcement. Drives the read-rate metric. |
| `audit_logs` | Append-only log of admin/security-relevant actions (invite created, user deactivated, role changed, force-logout, retention change). |
| `analytics_events` | Append-only product usage events (see below). |
| `reports` | User-submitted reports of messages/users for moderation. |

## Naming rules

- Plural snake_case for table names.
- Foreign keys: `<entity>_id` (e.g. `user_id`, `conversation_id`).
- Timestamps: every table gets `created_at`; mutable rows also `updated_at`.
- Soft delete: `deleted_at` (nullable) when needed; never hard-delete messages or audit logs.
- Append-only tables (`audit_logs`, `analytics_events`, `message_receipts`, `announcement_reads`) — no `updated_at`, no updates, only inserts.

## Analytics events

Tracked via `analytics_events`. **No private message content** is ever stored in analytics — only metadata and counters.

Default events / metrics:

- Total users
- Active users today
- Weekly active users
- Monthly active users
- New users
- Invite acceptance rate
- Pending invites
- Messages sent per day
- Active groups
- Most active departments
- Announcement read rate
- File upload count
- Storage usage
- Push notification success / failure
- Login activity (success, failure, OTP retry)
- Device / platform usage
- Reported messages
- Deactivated users

Roll-ups (daily / weekly / monthly aggregates) belong in BullMQ jobs, not in the request path.

## Not stored in Postgres

- **Presence** (online / offline / last-seen timestamp): lives in **Redis** as `presence:<user_id>`. Persisted to `users.last_seen_at` only on disconnect.
- **Typing indicators**: pure Socket.IO event, never persisted.

## Indexing & retention notes

- Index every foreign key.
- `messages(conversation_id, created_at desc)` for chat scrollback.
- `audit_logs` and `analytics_events` get partition / retention strategy decisions later — capture in [decisions.md](./decisions.md) when picked.
