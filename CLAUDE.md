@AGENTS.md

Claude Code loads this file every session. Keep it thin.

- Skills: `.claude/skills/` (junction to `.cursor/skills/`) — invoke with `/skill-name` or they auto-apply
- Nested guides: `backend/AGENTS.md`, `frontend/AGENTS.md`
- Hooks: `.cursor/hooks.json` — Cursor-only, but follow the same standards when editing this repo

## Cursor rules apply to Claude Code too

`.cursor/rules/*.mdc` are **binding here**, not Cursor-only. The six with
`alwaysApply: true` are imported below so they load every session:

@.cursor/rules/project-overview.mdc
@.cursor/rules/coding-standards.mdc
@.cursor/rules/session-tracking.mdc
@.cursor/rules/to-migrate.mdc
@.cursor/rules/agent-toolkit.mdc
@.cursor/rules/feature-standards.mdc

The rest are scoped by glob — **read the matching rule before editing files it covers**:

| Rule | Read before touching |
|------|----------------------|
| `.cursor/rules/backend-nestjs.mdc` | `backend/**/*.ts` |
| `.cursor/rules/frontend-nextjs.mdc` | `frontend/**/*.{ts,tsx}` |
| `.cursor/rules/prisma-schema.mdc` | `backend/**/*.prisma` |
| `.cursor/rules/rtl-arabic-ui.mdc` | `frontend/**/*.{tsx,css}` |
| `.cursor/rules/responsive-ui.mdc` | `frontend/**/*.{tsx,css}` |
| `.cursor/rules/ticket-domain.mdc` | `backend/src/tickets/**`, `frontend/src/**/ticket*`, `useTickets.ts` |
| `.cursor/rules/testing-domain.mdc` | `backend/src/testing/**`, `backend/src/bugs/**`, `frontend/src/components/testing/**`, test-suite/bugs routes, `useTest*.ts`, `useBugs.ts` |
| `.cursor/rules/meetings-domain.mdc` | `backend/src/meetings/**`, `backend/src/requirements/**`, meetings/requirements UI, `MEETINGS_PLAN.md` |
| `.cursor/rules/feature-standards.mdc` | Every user-facing feature (always on) |
| `.cursor/rules/api-sync.mdc` | `*.controller.ts`, `frontend/src/hooks/**`, `frontend/src/lib/**` |
| `.cursor/rules/testing.mdc` | `backend/**/*.spec.ts`, `frontend/**/*.test.tsx`, `backend/test/**`, `QA_TESTING.md` |

New `.mdc` files may appear — re-check `.cursor/rules/` rather than trusting this table.
