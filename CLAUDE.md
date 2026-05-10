# Chatbox — Claude entry point

Internal company messaging platform. Turborepo monorepo (web + mobile + api + shared packages).

## Read this first

All project memory and documentation lives in `.claude/` at the repo root.

**Start with [`.claude/INDEX.md`](./.claude/INDEX.md)** — it maps every file in that directory and tells you which one to open for what.

## Single-source rule

- Do **not** create memory or notes outside `.claude/`.
- Do **not** scatter docs into other folders.
- Do **not** write to user-level memory at `C:\Users\mgpan\.claude\projects\...` for this project — everything lives in the repo so it travels with the code.

## Quick reminders

- Windows + PowerShell. Use `npm.cmd` (not `npm`) when execution policy blocks the shim.
- Package manager: npm 11.5.0, npm workspaces + Turborepo.
- Default ports: web `3000`, api `4000`.
