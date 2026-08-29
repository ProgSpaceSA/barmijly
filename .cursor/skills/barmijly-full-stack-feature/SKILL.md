---
name: barmijly-full-stack-feature
description: Implements end-to-end features across Barmijly NestJS backend and Next.js frontend. Use when adding new modules, CRUD features, pages, or API integrations that span both backend/ and frontend/. Enforces MEETINGS_PLAN and feature-standards quality bar.
---

# Barmijly Full-Stack Feature Development

## Quality bar (non-negotiable)

Read and satisfy [`.cursor/rules/feature-standards.mdc`](../../rules/feature-standards.mdc) before marking any feature done:

- Fully **responsive** (~360px and `lg`)
- **All actions work** (every endpoint + UI button verified)
- **Tests** on services and UI (`*.spec.ts`, `*.test.tsx`)
- **No UX glitches** — skeletons, empty states, error toasts, loading/disabled on submit
- **RBAC** enforced in service layer, not only `@Roles`
- **Ctrl+K** shortcuts for frequent list/create destinations (`CommandPalette`)

Agents **may update** `feature-standards.mdc` when the user sets a new recurring expectation (e.g. always test dark mode).

## Feature plans

| Feature | Plan | Domain rule |
|---------|------|-------------|
| Meetings & requirements | [`MEETINGS_PLAN.md`](../../../MEETINGS_PLAN.md) | `meetings-domain.mdc` |
| Test suites & bugs | `TEST_SUITES_PLAN.md` (if present) | `testing-domain.mdc` |

When a plan exists: **execute phases in order**; check off items; do not skip audit/history/RBAC steps.

## Workflow

### 1. Requirements

- Read feature `*_PLAN.md` and matching `*-domain.mdc`
- Check `req.md` for business rules (§16 permissions, §21 non-negotiables)
- Identify roles and scoping

### 2. Backend (NestJS)

```
backend/src/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts
├── <feature>.service.ts
├── <feature>.access.ts      # if scoped like tickets/testing/meetings
└── dto/
```

Steps:

1. Prisma migration if needed (`barmijly-prisma-migrate`)
2. Register module in `app.module.ts`
3. `@Roles()` + **service-level scoping** (`AccessService` or feature access service)
4. Swagger decorators
5. `AuditService.log` on mutations; status history table if entity has status enum
6. **`*.spec.ts`** — 403 for wrong role, scope leak, guard paths

### 3. Frontend (Next.js)

```
frontend/src/
├── hooks/use<Feature>.ts
├── app/<feature>/page.tsx
├── app/<feature>/[id]/page.tsx
└── components/<feature>/
```

Steps:

1. React Query hooks — sync with API (`barmijly-api-sync`)
2. Arabic labels in `constants.ts`; RTL (`rtl-arabic-ui.mdc`)
3. Role-gated actions (`usePermissions`)
4. Sidebar nav when user-facing
5. Ctrl+K quick links in `CommandPalette.tsx` for list and/or create when they are frequent destinations (same action gate as the sidebar; open create in the existing dialog)
6. Skeleton + empty state + error handling
7. **`*.test.tsx`** on pages and complex components
8. Verify **360px** and **`lg`**

### 4. Verify (ship gate)

- [ ] Swagger: JWT + happy path + 403 wrong role
- [ ] Every UI action completes or shows error toast
- [ ] `npm run check` (or backend + frontend test/build)
- [ ] `to_migrate.md` if deploy order / migration needed
- [ ] `.cursor/uncommitted.md` one-line feature note if uncommitted

## Related skills

- `barmijly-prisma-migrate` — schema
- `barmijly-api-sync` — hooks ↔ controllers
- `barmijly-patterns` — code style
- `barmijly-qa-testing` — manual QA accounts

## API

- Dev backend: port 3001, Swagger `/api/docs`
- Frontend: `src/lib/api.ts`, token in `localStorage` key `token`
