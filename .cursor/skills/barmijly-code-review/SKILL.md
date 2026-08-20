---
name: barmijly-code-review
description: Reviews Barmijly code changes for correctness, RBAC, ticket workflow integrity, and project conventions. Use when reviewing pull requests, examining diffs, or when the user asks for a code review.
---

# Barmijly Code Review

## Priority checks

### 1. Security & RBAC
- [ ] New endpoints have `@UseGuards(JwtAuthGuard, RolesGuard)` unless `@Public()`
- [ ] `@Roles()` matches business requirements in `req.md` §16
- [ ] Service layer enforces company/system scoping (not just controller)
- [ ] No secrets or `.env` values in code

### 2. Ticket integrity
- [ ] Status transitions validated against allowed states
- [ ] Approval required before execution states
- [ ] StatusHistory + AuditLog written on changes
- [ ] Notifications sent to affected users
- [ ] Internal comments not leaked to requesters

### 3. Data layer
- [ ] Prisma migration included for schema changes
- [ ] Enums synced with `constants.ts`
- [ ] Indexes on filtered fields
- [ ] Relations have both sides defined

### 4. Frontend
- [ ] Arabic labels in `constants.ts`, not hardcoded English
- [ ] Role-gated UI matches backend permissions
- [ ] RTL layout not broken
- [ ] React Query invalidation after mutations
- [ ] Loading/error/empty states handled

### 5. Code quality
- [ ] Minimal diff scope
- [ ] Follows existing module/hook patterns
- [ ] No unnecessary `any` types
- [ ] DTOs validated with class-validator / Zod

## Feedback format

- **Critical**: Must fix — security, data loss, workflow bypass
- **Suggestion**: Should fix — convention drift, missing edge case
- **Nice to have**: Optional polish

## Key references

- `req.md` — business rules
- `backend/GUIDE.md` — API contract
- `.cursor/rules/` — coding standards
