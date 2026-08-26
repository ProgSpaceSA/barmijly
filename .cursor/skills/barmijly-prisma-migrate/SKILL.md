---
name: barmijly-prisma-migrate
description: Creates and applies Prisma schema changes and migrations for Barmijly PostgreSQL database. Use when modifying schema.prisma, adding models, changing enums, or running database migrations.
paths: backend/prisma/**,backend/prisma.config.ts
---

# Barmijly Prisma Migrations

## Setup

Prisma 7 with driver adapter. Config in `backend/prisma.config.ts`.
Schema: `backend/prisma/schema.prisma`

## Workflow

### 1. Edit schema

Follow conventions in `.cursor/rules/prisma-schema.mdc`:
- UUID primary keys
- `createdAt` / `updatedAt` on all models
- Both sides of relations
- `@@index` on query fields

### 2. Create migration

```bash
cd backend
npx prisma migrate dev --name descriptive_snake_name
npx prisma generate
```

### 3. Sync frontend

If enums changed, update `frontend/src/lib/constants.ts` labels/colors.

### 4. Update backend code

- Regenerated client types in services/DTOs
- Add seed data if needed for QA scenarios

## Production deploy

```bash
cd backend
npx prisma migrate deploy
```

After creating a migration (or any schema/data change that needs a sequenced cutover), append a checkbox to repo-root `to_migrate.md` (rule `to-migrate`) — including backfills and deploy-order notes for backward compatibility.

## Prisma client usage

Runtime uses `@prisma/adapter-pg`:

```typescript
// backend/src/prisma/prisma.service.ts
const adapter = new PrismaPg({ connectionString });
new PrismaClient({ adapter });
```

## Common commands

| Command | Purpose |
|---------|---------|
| `npx prisma studio` | Visual DB browser |
| `npx prisma migrate status` | Check pending migrations |
| `npx prisma validate` | Validate schema syntax |
| `npx prisma format` | Format schema file |

## Enum sync checklist

When adding/changing an enum:

```
- [ ] schema.prisma enum definition
- [ ] Migration applied
- [ ] Backend DTOs using enum
- [ ] frontend/src/lib/constants.ts labels
- [ ] Any switch/if chains in tickets.service.ts
```

## Never

- Manually edit production database without a migration
- Remove enum values without checking existing data
- Skip `prisma generate` after schema changes
