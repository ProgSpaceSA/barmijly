---
name: barmijly-qa-testing
description: Runs QA test scenarios for Barmijly ticket system using prepared test accounts and tickets. Use when testing ticket flows, verifying role permissions, QA validation, or regression testing.
---

# Barmijly QA Testing

## Reference

Full guide: `QA_TESTING.md`

## Test environment

- URL: https://barmijly.ai
- Password (all accounts): `QATest@2026`

## Test accounts

| Role | Email |
|------|-------|
| Requester | `qa.requester@barmijly.ai` |
| System Owner | `qa.owner@barmijly.ai` |
| Programming Head | `qa.head@barmijly.ai` |
| Project Manager | `qa.pm@barmijly.ai` |
| Developer | `qa.dev@barmijly.ai` |
| QA | `qa.qa@barmijly.ai` |
| Senior Management | `qa.senior@barmijly.ai` |

All linked to **شركة اختبار QA** / **نظام اختبار QA**.

## Pre-seeded tickets

8 tickets prefixed `[QA]` covering each lifecycle stage (DRAFT through REJECTED).

## Core test: full lifecycle

```
1. Requester → create ticket at /tickets/new → DRAFT
2. Requester → submit → NEW
3. Head → approve → APPROVED
4. PM → assign developer → SCHEDULED
5. Developer → start → IN_PROGRESS
6. Developer → submit for testing → AWAITING_TESTING
7. QA → approve completion → AWAITING_OWNER_APPROVAL
8. Requester → approve → COMPLETED
9. PM → close with notes → CLOSED
```

## Permission checks

- [ ] Requester cannot see internal comments
- [ ] Developer sees only assigned/accessible tickets
- [ ] System owner sees company tickets only
- [ ] Senior management: reports only, no mutations
- [ ] 401 redirects to /login on expired token

## After code changes

1. Identify affected workflow step(s)
2. Re-run minimal scenario covering those steps
3. Verify notifications appear for involved users
4. Check RTL layout on changed pages
