---
name: barmijly-full-stack-feature
description: Implements end-to-end features across Barmijly NestJS backend and Next.js frontend. Use when adding new modules, CRUD features, pages, or API integrations that span both backend/ and frontend/.
---

# Barmijly Full-Stack Feature Development

## Workflow

### 1. Requirements

- Check `req.md` for the feature spec
- Identify affected roles and permission matrix (§16)

### 2. Backend (NestJS)

```
backend/src/<feature>/
├── <feature>.module.ts
├── <feature>.controller.ts
├── <feature>.service.ts
└── dto/
    ├── create-<feature>.dto.ts
    └── update-<feature>.dto.ts
```

Steps:
1. Add Prisma model/migration if needed (see `barmijly-prisma-migrate` skill)
2. Create module, register in `app.module.ts`
3. Add RBAC with `@Roles()` + service-level scoping
4. Document in Swagger
5. Wire audit logging if entity is business-critical

### 3. Frontend (Next.js)

```
frontend/src/
├── hooks/use<Feature>.ts      # React Query hooks
├── app/<feature>/page.tsx     # List page
└── app/<feature>/[id]/page.tsx # Detail (if needed)
```

Steps:
1. Create React Query hook calling `api` from `src/lib/api.ts`
2. Build page with shadcn/ui components
3. Add Arabic labels to `constants.ts`
4. Gate UI actions by user role from auth context
5. Add sidebar nav entry in `Sidebar.tsx` if user-facing

### 4. Verify

- [ ] Swagger endpoint works with JWT
- [ ] Unauthorized role gets 403
- [ ] Frontend renders in RTL
- [ ] Loading and empty states handled
- [ ] Error toasts on API failure

## API base URL

- Dev: `NEXT_PUBLIC_API_URL` or defaults to `https://barmijly.ai/api`
- Backend port: 3001

## Auth pattern (frontend)

Token stored in `localStorage` key `token`. User object in `localStorage` key `user`.
