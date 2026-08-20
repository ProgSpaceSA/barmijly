---
name: barmijly-debug
description: Systematic debugging workflow for Barmijly backend and frontend issues. Use when fixing bugs, 403/401 errors, ticket workflow failures, missing data, or API mismatches.
---

# Barmijly Debug Workflow

## Step 1 — Classify the problem

| Symptom | Likely layer |
|---------|--------------|
| 401 Unauthorized | JWT expired/missing — check `localStorage` token |
| 403 Forbidden | Role or ownership — check `@Roles` + service scoping |
| 400 Bad Request | Invalid status transition or DTO validation |
| Empty list | Role filter in service (`findAll` where clause) |
| UI shows wrong label | Missing entry in `constants.ts` |
| API works in Swagger but not UI | Hook path/body mismatch — run `barmijly-api-sync` |

## Step 2 — Backend investigation

```
1. Reproduce with Swagger at http://localhost:3001/api/docs
2. Read the service method (not just controller)
3. Check current TicketStatus if ticket-related
4. Check user.role and company/system scoping in where clause
5. Read Prisma query — especially OR conditions for DEVELOPER role
6. Check TicketStatusHistory for last transition
```

Key file: `backend/src/tickets/tickets.service.ts` → `findAll`, `findOne`, transition methods.

## Step 3 — Frontend investigation

```
1. Network tab — exact URL, method, body, response
2. Compare to hook in frontend/src/hooks/
3. Check useAuthStore — is user.role correct?
4. Check queryKey — is cache stale? (invalidateQueries)
5. Check RTL/layout separately from logic errors
```

## Step 4 — Database (MCP)

Use **barmijly-postgres** MCP or Prisma Studio:

```bash
cd backend && npx prisma studio
```

Useful queries:
- Ticket status: `SELECT id, title, status FROM "Ticket" WHERE id = '...'`
- User role: `SELECT email, role FROM "User" WHERE email = '...'`
- Status history: `SELECT * FROM "TicketStatusHistory" WHERE "ticketId" = '...' ORDER BY "createdAt" DESC`

## Step 5 — QA accounts

From `QA_TESTING.md` — password `QATest@2026`:

| Role | Email |
|------|-------|
| Requester | `qa.requester@barmijly.ai` |
| Head | `qa.head@barmijly.ai` |
| Developer | `qa.dev@barmijly.ai` |
| PM | `qa.pm@barmijly.ai` |

Reproduce with the **correct role** for the action.

## Ticket transition debug

```
1. What is current status? (must match allowed "from" state)
2. Who is the actor? (role + ownership)
3. Is ticket archived? (isArchived blocks most actions)
4. Read throw site in tickets.service.ts for exact error message
```

## Fix checklist

```
- [ ] Root cause identified (not symptom patched)
- [ ] Fix in correct layer (don't UI-hide a backend bug)
- [ ] api-sync verified if endpoint changed
- [ ] Arabic error message preserved or improved
- [ ] Re-tested with QA account for that role
```

## Do not

- Bypass RBAC to "make it work"
- Skip status validation
- Fix only frontend when service scoping is wrong
