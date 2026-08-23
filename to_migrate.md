# To migrate

- [ ] `cd backend && npx prisma migrate deploy` — Apply pending Prisma migrations, in order: task estimation columns + difficulty CHECK, ticket/task startedAt & completedAt (backfilled from status history), TicketAssignment.isLead + one-active-lead index, `TicketStatus.BLOCKED` (enum value only — must apply before anything writes it), Ticket block/pause columns, TicketDependency + backfill from relatedTicketId, TicketDependencyType (BLOCKS / RELATES_TO / DUPLICATES)
