# Conventions

Patterns and rules to follow in this repo. Some are encoded in code; others are explicit user/product preferences. Add new entries when a convention is established or the user gives feedback.

## Hard "do not do" rules

These come from the product brief — **do not implement** any of these without the user explicitly reopening the decision:

- ❌ Public sign-up / self-registration. Signup is invite-only, always.
- ❌ Voice or video calling. Out of product scope, not "later."
- ❌ Email or SSO login. Mobile number + OTP is the only login path.
- ❌ Signal-style end-to-end encryption in MVP. Enterprise-managed security wins because of admin/audit/search/retention/analytics needs.
- ❌ Cross-app imports (`apps/web` reaching into `apps/api/src/...` or vice versa). Communicate via HTTP / WebSocket only.
- ❌ Storing private message content in analytics. Metadata + counters only.
- ❌ Adding new tables that aren't listed in [data-model.md](./data-model.md) without first proposing it in [decisions.md](./decisions.md).

## Code style

- TypeScript everywhere. No `.js` source files.
- Prettier is the formatter; do not hand-format. Run `npm.cmd run format` if files drift.
- ESLint per app. Don't silently disable rules — fix the underlying issue.
- Default to **no comments**. Only add a comment when the *why* would not be obvious from a clean read of the code.

## TypeScript & types

- Domain types live in `@chatbox/types`. If you need a user/role/conversation/message/invite type, **import — don't redefine**.
- App-local types go next to the code that owns them. Promote to `@chatbox/types` only when a second app needs them.
- Validation schemas live in `@chatbox/validation` (Zod). Keep them runtime-only; derive TS types via `z.infer`.

## Folder rules

- New backend feature → folder under `apps/api/src/modules/<feature>/` with `*.module.ts`, `*.controller.ts`, `*.service.ts`. Wire it into `AppModule.imports`.
- New web route → folder under `apps/web/app/<route>/page.tsx` (App Router conventions).
- New shared utility used by 2+ apps → new package under `packages/<name>/` with its own `package.json`, `tsconfig.json`, `src/index.ts`. Update [stack.md](./stack.md) and [INDEX.md](./INDEX.md) referencers in the same change.

## Naming

- Packages are scoped `@chatbox/<name>`.
- Files: kebab-case. React components: PascalCase only when the file *is* the component.
- Roles, statuses, kinds: lowercase snake/kebab strings as already used in `@chatbox/types` (`super_admin`, `direct`, `announcement`).
- DB tables: plural snake_case. Foreign keys: `<entity>_id`. (More in [data-model.md](./data-model.md#naming-rules).)

## React / RN versions

- React + React-DOM in `apps/web` must stay aligned with each other and with React in `apps/mobile` (`18.2.0`, dictated by Expo 51 / RN 0.74). Drifting versions has already broken a build — see [status.md](./status.md#known-issues).

## Commits & PRs

- Convention not yet locked in — repo has no commit history to mimic. Recommend **Conventional Commits** (`feat:`, `fix:`, `chore:`, `docs:`); confirm with user before declaring it a rule here.

## User preferences (feedback log)

Each entry: **rule** + *why* + *when it applies*. Add to it as feedback comes in.

- **All project memory + docs live under `chatbox/.claude/`.** *Why:* memory should travel with the repo, be visible to teammates, and survive machine moves. *When:* every time you would consider writing to `C:\Users\mgpan\.claude\projects\...` for this project — don't; write here instead.

- **Prefer conservative enterprise architecture over cutting-edge experiments.** *Why:* this is an internal tool that needs admin control, audit, retention, and predictable behavior — not a playground. *When:* picking patterns or libraries — choose the boring, well-supported option unless the user explicitly asks otherwise.

- **Keep mobile and web UIs separate.** *Why:* React Native for web is not the chosen path; web admin UX needs Next.js. *When:* when tempted to share UI code between `apps/web` and `apps/mobile`, share types/validation/config instead, and a future shared API client — never UI components.

- **Be terse. No long explanations, no over-justification, no lectures.** *Why:* user explicitly said "dooooooooo not explain so much just remember" on 2026-05-09. *How to apply:* default to one-liners, tables, and direct answers. Save reasoning to memory files instead of restating it every turn. If a deep dive is genuinely needed, ask first.
