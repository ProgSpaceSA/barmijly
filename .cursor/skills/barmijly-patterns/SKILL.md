---
name: barmijly-patterns
description: Copy-paste code patterns from the Barmijly codebase for NestJS endpoints, React Query hooks, RBAC, and ticket transitions. Use when implementing new features or unsure how this project structures code.
---

# Barmijly Code Patterns

Read [reference.md](reference.md) for concrete examples from this repo.

## When to use

- Adding a new API endpoint
- Adding a frontend hook or page
- Implementing ticket status transitions
- Adding Arabic UI labels

## Quick file map

| Task | Start here |
|------|------------|
| New backend module | `backend/src/reports/` (small CRUD example) |
| Ticket logic | `backend/src/tickets/tickets.service.ts` |
| Frontend hooks | `frontend/src/hooks/useTickets.ts` |
| Arabic labels | `frontend/src/lib/constants.ts` |
| Role-gated UI | `frontend/src/components/layout/Sidebar.tsx` |
