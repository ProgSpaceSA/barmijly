---
name: barmijly-ticket-workflow
description: Implements or modifies Barmijly ticket lifecycle transitions, status rules, approvals, assignments, and notifications. Use when working on tickets, status changes, approval flow, ticket endpoints, or ticket UI actions.
paths: backend/src/tickets/**,backend/src/comments/**,frontend/src/hooks/useTickets.ts,frontend/src/app/tickets/**
---

# Barmijly Ticket Workflow

## Before starting

1. Read `req.md` §3–§9 (workflow, statuses, approval, assignment)
2. Read `backend/GUIDE.md` → Ticket Status Flow + Tickets endpoints
3. Inspect `backend/src/tickets/tickets.service.ts` for existing transitions

## Implementation checklist

When adding or changing a ticket action:

```
- [ ] Validate actor role (@Roles on controller + service ownership check)
- [ ] Validate current TicketStatus allows transition
- [ ] Update ticket fields in Prisma transaction
- [ ] Create TicketStatusHistory entry
- [ ] Call AuditService.log()
- [ ] Create Notification records for affected users
- [ ] Send EmailService notification if user-facing
- [ ] Add/update DTO with class-validator rules
- [ ] Add Swagger docs on controller method
- [ ] Add frontend action button (role-gated) + hook mutation
- [ ] Add Arabic label if new status/type in constants.ts
```

## Status reference

```
DRAFT → submit → NEW
NEW → approve → AWAITING_APPROVAL → APPROVED | REJECTED | AWAITING_INFO
APPROVED → assign → SCHEDULED (with developer metadata)
SCHEDULED/APPROVED → start → IN_PROGRESS
IN_PROGRESS → submit-for-testing → AWAITING_TESTING
AWAITING_TESTING → approve-completion → AWAITING_OWNER_APPROVAL
AWAITING_OWNER_APPROVAL → approve-completion → COMPLETED
COMPLETED → close → CLOSED
```

## Key files

| Layer | Path |
|-------|------|
| Service | `backend/src/tickets/tickets.service.ts` |
| Controller | `backend/src/tickets/tickets.controller.ts` |
| DTOs | `backend/src/tickets/dto/` |
| Frontend hook | `frontend/src/hooks/useTickets.ts` |
| Detail page | `frontend/src/app/tickets/[id]/page.tsx` |
| Labels | `frontend/src/lib/constants.ts` |

## Common mistakes

- Allowing IN_PROGRESS without prior approval
- Forgetting INTERNAL comment visibility on new comment features
- Missing notification to ticket creator on status change
- Using requester's suggested priority as final priority (must be set on assign)
