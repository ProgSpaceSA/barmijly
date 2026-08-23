# برمجلي (Barmijly) — Agent Guide

Internal ticket management system for programming change requests across group companies.

## Repository layout

| Path | Stack | Port |
|------|-------|------|
| `backend/` | NestJS 11, Prisma 7, PostgreSQL | 3001 |
| `frontend/` | Next.js 16, React 19, Tailwind 4, shadcn/ui | 3000 |
| `req.md` | Arabic product requirements (source of truth) | — |
| `backend/GUIDE.md` | API reference, roles, ticket flow | — |
| `QA_TESTING.md` | QA accounts and test scenarios | — |

## req.md section index

| Section | Topic | Read when |
|---------|-------|-----------|
| §3 | Workflow overview | Any ticket feature |
| §4 | Ticket statuses | Status transitions |
| §5–§7 | Fields, types, priorities | Forms, validation |
| §8–§9 | Approval & assignment | Approve/assign endpoints |
| §11 | Email & notifications | Notification work |
| §12–§13 | Comments & attachments | Comments, uploads |
| §14–§15 | Reports & dashboards | Reports page |
| §16 | Permissions | RBAC, scoping |
| §17 | UI / branding / RTL | Frontend design |
| §20 | Extra features | Templates, export, linked tickets |
| §21 | Non-negotiable rules | Always — before shipping |

## Before writing code

1. Read the relevant `req.md` section from the index above.
2. Read `backend/GUIDE.md` for API endpoints and status transitions.
3. For Next.js changes, read `node_modules/next/dist/docs/` — this project uses Next.js 16 with breaking changes.
4. For Prisma changes, follow schema conventions and run migrations from `backend/`.
5. For code patterns, read `.cursor/skills/barmijly-patterns/reference.md`.
6. Backend endpoint changes must sync frontend hooks — see `barmijly-api-sync` skill.

## Core business rules

- No ticket enters development without **PROGRAMMING_HEAD** approval.
- Tickets cannot be deleted — only archived.
- Internal comments are hidden from `TICKET_REQUESTER`.
- Users see only systems/companies they are assigned to (except programming team roles).
- Final priority is set by programming leadership, not the requester.
- Every status change must be auditable (`TicketStatusHistory`, `AuditLog`).

## Ticket status flow

```
DRAFT → NEW → AWAITING_APPROVAL → APPROVED → SCHEDULED → IN_PROGRESS
                                ↘ REJECTED
                                ↘ AWAITING_INFO → NEW
                              AWAITING_TESTING → AWAITING_OWNER_APPROVAL → COMPLETED → CLOSED
```

## Roles

`TICKET_REQUESTER` · `SYSTEM_OWNER` · `PROGRAMMING_HEAD` · `PROJECT_MANAGER` · `DEVELOPER` · `QA` · `SENIOR_MANAGEMENT`

## Development commands

```bash
# Backend
cd backend && npm run start:dev
npx prisma migrate dev --name <name>
npx prisma generate

# Frontend
cd frontend && npm run dev
```

## Tests

```bash
cd backend  && npm test        # jest, *.spec.ts next to the source
cd frontend && npm test        # vitest + RTL, *.test.tsx next to the component
```

Git hooks (Husky) and GitHub Actions run lint, tests, and build before a push lands. After clone, `npm install` at the repo root enables the pre-push hook. `npm run check` runs the same suite locally.

New or changed code gets a spec in the same commit. Backend services are tested with
`Test.createTestingModule` and mocked `PrismaService` — no database required. Cover the
role gate and the status guard, not just the happy path.

## Agent configuration

| Layer | Path | Loads when |
|-------|------|------------|
| Shared manual | `AGENTS.md` | Every agent (Cursor, Copilot, Codex) |
| Claude import | `CLAUDE.md` → `@AGENTS.md` | Claude Code every session |
| Always-on rules | `.cursor/rules/*alwaysApply*` | Every Cursor chat |
| File-scoped rules | `.cursor/rules/*.mdc` + `globs` | Matching files in context |
| Skills | `.cursor/skills/*/SKILL.md` | On demand (name + description always visible) |
| Claude skills | `.claude/skills/` | Junction to `.cursor/skills/` |
| Hooks | `.cursor/hooks.json` | After edits, before secret reads/shell |
| MCP | `.cursor/mcp.json` | Postgres via `backend/.env` `DATABASE_URL` |
| Ignore | `.cursorignore` | Keep `node_modules` / build out of context |

Skills are progressive: description first, `SKILL.md` when relevant, `reference.md` only if needed.

If Claude Code does not see skills, from repo root (Windows):

```powershell
cmd /c mklink /J .claude\skills .cursor\skills
```

### MCP

Requires `DATABASE_URL` in `backend/.env`. Enable **barmijly-postgres** in Cursor Settings → MCP.

## UI & localization

- Arabic RTL is the default (`lang="ar" dir="rtl"`).
- Layouts are mobile-first (phone → tablet → desktop).
- User-facing labels live in `frontend/src/lib/constants.ts`.
- Brand colors: Primary `#4F46E5`, Secondary `#6366F1`, Accent `#8B5CF6`.
- Dark mode is supported; default theme is dark.

## What not to do

- Do not commit `.env` files or secrets.
- Do not skip role checks on new endpoints.
- Do not hard-delete tickets or bypass approval workflow.
- Do not add English-only UI without Arabic labels in `constants.ts`.
- Do not create markdown docs unless explicitly requested.
