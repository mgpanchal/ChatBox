# `.claude/` index

Master map of project memory and documentation. Read entries top-down — overview first, then drill into the file matching your task.

## Files

| File | What's in it | Open it when |
|---|---|---|
| [project-overview.md](./project-overview.md) | What Chatbox is, audience, security posture, hard exclusions, MVP feature list, roles & permissions, invite/signup invariants | You need to know the *why* and the target scope |
| [stack.md](./stack.md) | Languages, frameworks, package versions; "in use today" vs "planned"; dev commands; Windows gotchas | You're about to run, build, or change tooling |
| [architecture.md](./architecture.md) | App layout, package wiring, runtime topology, auth model, mobile-vs-web split | You need to know where code goes or how apps relate |
| [data-model.md](./data-model.md) | MVP entity list, naming rules, analytics events list | Before adding a table, FK, or analytics event |
| [status.md](./status.md) | What's implemented vs stubbed today; verification status; known issues; next milestone | Before adding a feature — check if it exists, is a placeholder, or is blocked |
| [conventions.md](./conventions.md) | Coding style, "do not do" rules, naming, folder rules, user feedback log | Before writing code — match the project's patterns |
| [decisions.md](./decisions.md) | Architectural decisions with their reasoning (append-only) | When a choice looks odd — check if it was deliberate; or when making a new decision |

## Rules for this directory

- One topic per file. If a topic outgrows its file, split it and update this index.
- Keep entries in this index to **one line** — long entries belong inside the file they point to.
- When you add a new `.md` here, add a row to the table above in the same change.
- When a file's content drifts from its description, fix the description.
- Last updated: 2026-05-09.
