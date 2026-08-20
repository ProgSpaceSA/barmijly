@../AGENTS.md

# Backend — NestJS Agent Guide

## File map

```
src/
├── prisma/prisma.service.ts     # Global Prisma client (adapter-pg)
├── auth/
│   ├── guards/                  # JwtAuthGuard, RolesGuard
│   ├── decorators/              # @CurrentUser, @Roles, @Public
│   └── strategies/              # jwt.strategy
├── tickets/                     # Core workflow — start here for ticket work
│   ├── tickets.service.ts       # Status transitions + RBAC filtering
│   ├── tickets.controller.ts    # 14 ticket endpoints
│   └── dto/                     # Request validation
├── comments/                    # PUBLIC / INTERNAL visibility
├── notifications/               # In-app notifications
├── email/                       # Nodemailer (non-blocking on SMTP failure)
├── audit/                       # AuditLog on entity changes
└── reports/                     # Dashboard stats, overdue, trends
```

## Commands

```bash
npm run start:dev                          # port 3001
npx prisma migrate dev --name <name>
npx prisma generate
npx prisma studio
```

Swagger: `http://localhost:3001/api/docs`

## Auth pattern

```typescript
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.PROJECT_MANAGER, UserRole.PROGRAMMING_HEAD)
```

Service layer must also enforce company/system scoping — controller `@Roles` alone is not enough.

## Ticket side effects (required on every transition)

1. Validate status allows transition
2. `TicketStatusHistory` record
3. `AuditService.log()`
4. `NotificationsService` for affected users
5. `EmailService` when user-facing

## Skills (load before coding)

- Ticket flow: `barmijly-ticket-workflow`
- New endpoint: `barmijly-api-sync`
- Schema change: `barmijly-prisma-migrate`
- Patterns: `../.cursor/skills/barmijly-patterns/reference.md`

## Key references

- API contract: `GUIDE.md`
- Prisma schema: `prisma/schema.prisma`
- Config: `prisma.config.ts` (Prisma 7 CLI)

## Environment

Copy `.env` from GUIDE.md. Never commit it.
