---
name: barmijly-commit
description: Creates git commits for Barmijly using conventional messages scoped to backend or frontend. Use when the user asks to commit, write a commit message, or stage changes.
---

# Barmijly commits

Only commit when the user explicitly asks.

## Do not commit

`.env`, `.env.*` (except `.env.example`), `backend/uploads/`, credentials, `node_modules`, `.next`, `dist`.

## Message format

```
<type>(<scope>): <why in one line>
```

Types: `feat` · `fix` · `refactor` · `chore` · `docs` · `test`

Scope: `tickets` · `auth` · `reports` · `ui` · `prisma` · `agent` (for `.cursor/` / `AGENTS.md`)

Focus on **why**, not a file list.

Examples:

- `feat(tickets): require closure notes before close`
- `fix(auth): hide internal comments from requesters`
- `chore(agent): add skill router and Cursor hooks`

## Steps

1. Run skill `barmijly-prepare-commit` first — Husky `lint-staged` must be clean (no `--no-verify` unless asked)
2. `git status` + `git diff` + `git log -5 --oneline` (match existing style)
3. Stage only relevant files
4. Commit with a HEREDOC/`-m` message (no `-i`, no `--no-verify` unless asked)
5. Do not push unless asked
6. After a successful commit, reset `.cursor/uncommitted.md` to `# Uncommitted\n\n(none)\n`
