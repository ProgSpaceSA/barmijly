# To migrate

- [ ] `cd backend && npx prisma migrate deploy` — Apply the meetings and requirements migration
- [ ] Deploy order: DB migrate → backend → frontend — `TicketComment.ticketId` becomes nullable and the new pages call `/meetings` and `/requirements`
