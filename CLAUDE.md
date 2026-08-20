@AGENTS.md

Claude Code loads this file every session. Keep it thin.

- Skills: `.claude/skills/` (junction to `.cursor/skills/`) — invoke with `/skill-name` or they auto-apply
- Nested guides: `backend/AGENTS.md`, `frontend/AGENTS.md`
- Hooks: `.cursor/hooks.json` — Cursor-only, but follow the same standards when editing this repo

## Cursor rules apply to Claude Code too

`.cursor/rules/*.mdc` are **binding here**, not Cursor-only. The five with
`alwaysApply: true` are imported below so they load every session:

@.cursor/rules/project-overview.mdc
@.cursor/rules/coding-standards.mdc
@.cursor/rules/session-tracking.mdc
@.cursor/rules/to-migrate.mdc
@.cursor/rules/agent-toolkit.mdc

The rest are scoped by glob — **read the matching rule before editing files it covers**:

| Rule | Read before touching |
|------|----------------------|
| `.cursor/rules/backend-nestjs.mdc` | `backend/**/*.ts` |
| `.cursor/rules/frontend-nextjs.mdc` | `frontend/**/*.{ts,tsx}` |
| `.cursor/rules/prisma-schema.mdc` | `backend/**/*.prisma` |
| `.cursor/rules/rtl-arabic-ui.mdc` | `frontend/**/*.{tsx,css}` |
| `.cursor/rules/ticket-domain.mdc` | `backend/src/tickets/**`, `frontend/src/**/ticket*`, `useTickets.ts` |
| `.cursor/rules/api-sync.mdc` | `*.controller.ts`, `frontend/src/hooks/**`, `frontend/src/lib/**` |
| `.cursor/rules/testing.mdc` | `backend/**/*.spec.ts`, `backend/test/**`, `QA_TESTING.md` |

New `.mdc` files may appear — re-check `.cursor/rules/` rather than trusting this table.
