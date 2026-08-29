---
name: barmijly-qa-testing
description: Runs QA test scenarios for Barmijly ticket system using prepared test accounts and tickets. Use when testing ticket flows, verifying role permissions, QA validation, or regression testing.
---

# Barmijly QA Testing

## Reference

Full guide: `QA_TESTING.md`

## Test environment

- Local: http://localhost:3000 (API: http://localhost:3001/api/docs)
- Production: https://barmijly.ai
- Password (all active seed accounts): `asdfasdf0!`
- Emails: `anas.hagras1999+{prefix}{scope}@gmail.com` — matrix in `backend/prisma/seed-matrix.ts`

## Daily-driver accounts (Company1)

| Role | Email |
|------|-------|
| Requester | `anas.hagras1999+rc1@gmail.com` |
| System Owner (company) | `anas.hagras1999+oc1@gmail.com` |
| System Owner (Project1) | `anas.hagras1999+op1@gmail.com` |
| Programming Head | `anas.hagras1999+hc1@gmail.com` |
| Programming Head (org) | `anas.hagras1999+hall@gmail.com` |
| Project Manager | `anas.hagras1999+pmc1@gmail.com` |
| Developer | `anas.hagras1999+dc1@gmail.com` |
| Developer (Project1 only) | `anas.hagras1999+dp1@gmail.com` |
| QA | `anas.hagras1999+qac1@gmail.com` |
| Senior Management | `anas.hagras1999+sc1@gmail.com` |

Seeded Project1 tickets use **SystemOwnerP1** (`+op1`) as `systemOwnerId`.

## Pre-seeded tickets

Titles `[C{company}/P{project}][{STATUS}] …`. Projects 1–3 have every status; others a compact set. Meetings, requirements, and test suites are **not** seeded.

## Core test: full lifecycle

```
1. Requester → create ticket at /tickets/new → DRAFT
2. Requester → submit → NEW
3. Head → approve → APPROVED
4. PM → assign developer + schedule → SCHEDULED
5. Lead developer → start → IN_PROGRESS
6. Lead developer → submit for testing → AWAITING_TESTING
7. QA → approve completion → AWAITING_OWNER_APPROVAL
8. System owner (or requester) → approve completion → COMPLETED
9. PM → close with notes → CLOSED
```

Head approve does **not** skip to SCHEDULED. QA approve does **not** skip to COMPLETED.

## Permission checks

- [ ] Requester cannot see internal comments (nor can SYSTEM_OWNER)
- [ ] DeveloperP1 sees Project1 only — not Project2 in Company1
- [ ] SystemOwnerC1 sees Company1 tickets only
- [ ] Requester: no `/meetings`, `/requirements`, `/test-suites`, `/bugs`
- [ ] SYSTEM_OWNER reads pinned requirements only; cannot create/capture/promote
- [ ] Promote (requirement or bug) creates DRAFT — never bypasses PROGRAMMING_HEAD
- [ ] Senior management: reports + meetings; no ticket mutations beyond their actions
- [ ] 401 redirects to /login on expired token

## After code changes

1. Identify affected workflow step(s)
2. Re-run minimal scenario covering those steps
3. Verify notifications appear for involved users
4. Check RTL layout on changed pages
