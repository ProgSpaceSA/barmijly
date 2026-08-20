@AGENTS.md

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Frontend-specific notes

- App Router lives in `src/app/`
- Shared hooks: `src/hooks/` · API client: `src/lib/api.ts`
- UI components: shadcn/ui in `src/components/ui/`
- Arabic labels: `src/lib/constants.ts`
- Default: RTL Arabic, dark theme

## Agent config (repo root)

- Rules: `../.cursor/rules/`
- Skills: `../.cursor/skills/` (Claude: `../.claude/skills/`)
- Patterns: `../.cursor/skills/barmijly-patterns/reference.md`
