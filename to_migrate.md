# To migrate

- [ ] `cd backend && npx prisma migrate deploy` — Apply the meetings and requirements migration
- [ ] Deploy order: DB migrate → backend → frontend — `TicketComment.ticketId` becomes nullable and the new pages call `/meetings` and `/requirements`
- [ ] `cd backend && npx prisma migrate deploy` — Add `TicketTask.order` / `isBlocking`; the migration backfills `order` from `createdAt`
- [ ] Deploy order: DB migrate → backend → frontend — the task list sorts on `order` and reads `blockedBy` from `POST /tasks/:id/reorder`
