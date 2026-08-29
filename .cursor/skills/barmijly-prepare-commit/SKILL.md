---
name: barmijly-prepare-commit
description: Prepares Barmijly changes so the Husky pre-commit hook (lint-staged ESLint) will pass. Runs that same lint, fixes errors, and re-runs until clean. Use when the user asks to prepare for commit, make the commit ready, or fix pre-commit / lint-staged / husky failures; run before barmijly-commit.
---

# Prepare for commit

Do **not** commit. Make the tree pass `.husky/pre-commit` (`npx lint-staged`). Then stop and tell the user it is ready (or hand off to `barmijly-commit` if they already asked to commit).

Pre-commit is **ESLint on staged files only** (`lint-staged.config.mjs`, `--quiet`). It does not run tests. Pre-push is `npm run push:check` (tests + build) — out of scope unless the user asked for push-ready.

## Steps

1. `git status` + `git diff --name-only` + `git diff --cached --name-only`. Collect `backend` / `frontend` `*.{ts,tsx,js,jsx,mjs}` that will be in the commit (staged, or dirty if they have not staged yet). Skip `.env`, `node_modules`, `.next`, `dist`, `uploads`.
2. Lint from the **package directory** (avoids the Next “pages directory” noise when cwd is the repo root):

```bash
# backend — only the changed files
cd backend && npx eslint --quiet <files>

# frontend — only the changed files
cd frontend && npx eslint --quiet <files>
```

3. Fix every **error**. Re-run the same commands until exit 0.
4. If files are staged, also run `npx lint-staged` from the repo root — that is the hook. If it fails, fix and repeat. A backend run **KILLED** with no output is usually the other package failing in parallel; re-run backend eslint alone and treat *that* output as the real errors.
5. If you touched `*.spec.ts` / `*.test.tsx`, run **those files** (`cd backend && npm test -- <file>` / `cd frontend && npx vitest run <file>`). Not the full suite.
6. Report: hook-clean or what is still blocking. Do not `git add` unless the user asked to commit next.

`--quiet` ignores warnings. Do not churn on prettier/unsafe-* warns.

## Fix recipes (this repo)

| Failure | Fix |
|---------|-----|
| `react-hooks/refs` — `ref.current = …` during render | Assign in `useEffect(() => { ref.current = value })`. If the callback sits after an early return, hoist it above all hooks/returns first (same pattern as `TestCaseDetail`). |
| `parserOptions.project` / file not in any project | Add the glob to `backend/tsconfig.eslint.json` `include` (scripts live under `prisma/**/*.ts`; keep `src`, `test`, `prisma.config.ts`). |
| `Property 'x' does not exist` on a mutation `Row` type | Widen that type in the hook (the mutate `onSuccess` arg), not a cast at the call site. |
| `@next/next/no-html-link-for-pages` / “Pages directory cannot be found” | Lint with cwd `frontend/`. Tests already turn the rule off. Do not invent a `pages/` folder. |
| Backend eslint **KILLED** | Ignore the empty kill; lint the backend file list by itself. |

Do not `--no-verify`. Do not disable the failing rule unless it is a false positive that already has a repo exception.
