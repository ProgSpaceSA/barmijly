# Barmijli Backend — Developer Guide

## Overview

NestJS REST API for the **برمجلي (Barmijli)** internal ticket management system.  
Handles the full lifecycle of programming-change requests across group companies.

- **Runtime**: Node.js 24 / NestJS 11
- **Database**: PostgreSQL via Prisma 7 (pg adapter)
- **Auth**: JWT (passport-jwt) + bcrypt
- **Docs**: Swagger at `/api/docs`
- **Port**: 3001

---

## Project Structure

```
src/
├── prisma/           # PrismaService (global DB client)
├── auth/             # Login, JWT strategy, guards, decorators
│   ├── decorators/   # @CurrentUser, @Roles, @Public
│   ├── guards/       # JwtAuthGuard, RolesGuard
│   ├── strategies/   # jwt.strategy, local.strategy
│   └── dto/
├── users/            # User CRUD + system assignments
├── companies/        # Company management
├── departments/      # Department management
├── systems/          # System management + user-system access
├── tickets/          # Core ticket workflow (14 endpoints)
│   └── dto/          # create, update, approve, assign, filter, close
├── comments/         # Public & internal comments — tickets and requirements
├── meetings/         # Meetings, attendees, systems, ordered minutes, capture
│   └── dto/          # meeting, points, attendees, systems, capture
├── requirements/     # The backlog + promote-to-DRAFT-ticket
│   └── dto/          # create, update, status, promote, filter
├── attachments/      # File upload (multer) + delete
├── notifications/    # In-app notifications
├── email/            # Nodemailer service (invitations, status updates)
├── invitations/      # Email invitation flow (send, resend, revoke)
├── audit/            # Audit log service (auto-called on ticket actions)
├── reports/          # Dashboard stats, developer stats, overdue, trend
├── app.module.ts
└── main.ts
```

---

## Setup

### 1. Prerequisites

- Node.js 20+
- PostgreSQL running locally
- Redis (optional — reserved for future background jobs)

### 2. Environment

Copy and fill in `.env`:

```env
DATABASE_URL="postgresql://barmijly:barmijly2024@localhost:5432/barmijly"

JWT_SECRET="change-this-in-production"
JWT_EXPIRES_IN="7d"

MAIL_ENABLED=false                     # local/QA: keep false. Production: true (case-insensitive)
MAIL_HOST="smtp.gmail.com"
MAIL_PORT=587
MAIL_USER="your@gmail.com"
MAIL_PASS="your-app-password"
MAIL_FROM="noreply@barmijly.ai"

UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=10485760   # 10 MB

REDIS_URL="redis://localhost:6379"

# Daily summary email (see "Daily Digest" below)
DAILY_DIGEST_TIME="09:00"              # HH:mm, defaults to 09:00
DAILY_DIGEST_TIMEZONE="Asia/Riyadh"    # IANA zone, defaults to Asia/Riyadh
DAILY_DIGEST_DAYS="0-4"                # cron day-of-week; 0-4 = Sun–Thu (skips Fri/Sat)
DAILY_DIGEST_ENABLED=true              # set to "false" to disable the cron
DAILY_DIGEST_LOOKBACK_HOURS=24         # how far back "new activity" looks

PORT=3001
NODE_ENV="development"
FRONTEND_URL="https://barmijly.ai"
```

### 3. Install & Migrate

```bash
npm install
npx prisma migrate dev      # apply migrations
npx prisma generate         # generate client
```

### 4. Run

```bash
# Development (watch mode)
npm run start:dev

# Production build
npm run build
node dist/src/main.js
```

---

## API Reference

Base URL: `https://barmijly.ai/api`  
Swagger UI: `https://barmijly.ai/api/docs`

All endpoints (except login & set-password) require:
```
Authorization: Bearer <token>
```

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Login with email + password → JWT |
| POST | `/auth/set-password` | Set password via invitation token |
| GET | `/auth/me` | Current user profile |
| PATCH | `/auth/change-password` | Change own password |

### Users

| Method | Endpoint | Roles | Description |
|--------|----------|-------|-------------|
| GET | `/users` | Head, Manager, Senior | List all users |
| GET | `/users/developers` | Signed in | Active developers in the caller's company reach; pass `ticketId` to match the assign picker |
| GET | `/users/:id` | Head, Manager, Senior | Get user |
| POST | `/users` | Head, Manager | Create user |
| PATCH | `/users/:id` | Head, Manager | Update user |
| PATCH | `/users/:id/activate` | Head | Activate user |
| PATCH | `/users/:id/deactivate` | Head | Deactivate user |

### Companies / Departments / Systems

Standard CRUD on `/companies`, `/departments`, `/systems`.  
Each has `GET`, `POST`, `PATCH :id`, `PATCH :id/deactivate`. Systems also have `PATCH :id/activate` (Head, Senior) to turn a deactivated system back on.

### Tickets — Full Workflow

| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| POST | `/tickets` | Any | Create draft ticket |
| PATCH | `/tickets/:id` | Creator / Manager | Edit draft or awaiting-info ticket |
| PATCH | `/tickets/:id/submit` | Creator | Submit draft → NEW |
| PATCH | `/tickets/:id/approve` | Head | Approve / Reject / Request info |
| PATCH | `/tickets/:id/assign` | Manager / Head | Assign one or more developers (`developerIds`, `leadDeveloperId`) + set metadata |
| PATCH | `/tickets/:id/plan` | Manager / Head (full plan); assigned Developer (hours + difficulty only) | Update schedule / estimate without a status move |
| GET | `/tickets/:id/assignees` | Role-filtered | Active roster, lead first |
| POST | `/tickets/:id/assignees` | Manager / Head | Add a developer at any status |
| DELETE | `/tickets/:id/assignees/:developerId` | Manager / Head | Remove a developer. Refused for the lead, or anyone still holding a task |
| PATCH | `/tickets/:id/lead` | Manager / Head | Hand the lead role over |
| PATCH | `/tickets/:id/start` | **Lead** | Mark IN_PROGRESS. Refused while a prerequisite is unfinished |
| PATCH | `/tickets/:id/submit-for-testing` | **Lead** | Move to AWAITING_TESTING. Refused while any task is open |
| PATCH | `/tickets/:id/request-changes` | QA / Manager / Head | Return AWAITING_TESTING → IN_PROGRESS with a required reason; notifies ticket assignees |
| PATCH | `/tickets/:id/block` | Developer / QA / Manager / Head | Stop the ticket (BLOCKED) with a required reason, optionally naming the blocking ticket |
| PATCH | `/tickets/:id/hold` | Manager / Head / Senior | Park the ticket (ON_HOLD) with a required reason |
| PATCH | `/tickets/:id/resume` | Lead (BLOCKED) / Manager / Head | Return to the status the ticket stopped from |
| GET | `/tickets/:id/timeline` | Role-filtered | Everything that happened to the ticket, oldest first — status moves, tasks, assignment, lead handover, relations. Reads `AuditLog`, so every writer contributes without a second table |
| GET | `/tickets/:id/dependencies` | Role-filtered | `blockedBy` and `blocking`, each row carrying its relation `type` |
| POST | `/tickets/:id/dependencies` | Manager / Head | Relate two tickets: `otherTicketId`, `direction` (`blockedBy` default or `blocks`), `type` (`BLOCKS` default, `RELATES_TO`, `DUPLICATES`). Rejects self-edges; rejects cycles for `BLOCKS` only |
| DELETE | `/tickets/:id/dependencies/:otherTicketId` | Manager / Head | Remove the relation, named from either end |
| PATCH | `/tickets/:id/approve-completion` | QA / requester / system owner / Head, PM | QA passes → owner approval; requester or system owner (or leadership) accepts → COMPLETED |
| PATCH | `/tickets/:id/close` | Manager / Head | Close with closure notes |
| PATCH | `/tickets/:id/archive` | Manager / Head | Archive (soft) |
| PATCH | `/tickets/:id/reopen` | Manager / Head | Reopen closed/rejected ticket |
| POST | `/tickets/:id/duplicate` | Any | Clone ticket as new draft |
| GET | `/tickets` | Role-filtered | List tickets with filters + pagination (`status`, `statuses` comma-separated, `companyId`, `developerId`, `search`, `overdue=true`, `mine=true`, …). `mine=true` keeps tickets the caller is assigned to, or that have at least one task assigned to them. `developerId` keeps tickets with an active assignment to that developer. `statuses` keeps tickets in any of the listed statuses; `overdue=true` wins over `status` / `statuses` |
| GET | `/tickets/my-created` | Signed in | Dashboard activity queue: tickets the user filed or owns, plus the statuses their role must act on (same buckets as the daily digest) |
| GET | `/tickets/:id` | Role-filtered | Ticket detail with full history |

#### Ticket Status Flow

```
DRAFT → NEW → AWAITING_APPROVAL → APPROVED → SCHEDULED → IN_PROGRESS
                                ↘ REJECTED
                                ↘ AWAITING_INFO → NEW
                                                       ↓
                              AWAITING_TESTING → AWAITING_OWNER_APPROVAL → COMPLETED → CLOSED
                              AWAITING_TESTING → IN_PROGRESS   (request-changes — QA asks for fixes)

any active status ⇄ BLOCKED   (block / resume — involuntary, something is in the way)
any live status   ⇄ ON_HOLD   (hold / resume — a deliberate parking decision)
```

`resume` returns the ticket to the status it stopped from, read out of
`TicketStatusHistory`. Both stopped states pause the work clock, so `actualHours`
never counts time nobody was working.

#### Gates

- `start` is refused while any **`BLOCKS`** prerequisite is not COMPLETED or CLOSED. `RELATES_TO` and `DUPLICATES` are navigation aids and gate nothing.
- `submit-for-testing` is refused while the ticket has tasks in NEW or IN_PROGRESS.
- Both are bypassed only through `force-status`, which is audited.

#### Approval Decisions

- `APPROVED` — moves to approved
- `REJECTED` — moves to rejected (with reason)
- `NEEDS_INFO` — moves back to awaiting info, notifies creator
- `CONVERT_TO_PROJECT` — puts on hold for separate project handling

### Tasks

| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| GET | `/tickets/:ticketId/tasks` | Role-filtered | Tasks on a ticket, in list order |
| POST | `/tickets/:ticketId/tasks` | Manager / Head / Senior; Developer & QA for themselves | Create a task (`title`, `assignedToId`, `dueDate?`, `estimatedHours?`, `difficultyLevel?` 1–5, `isBlocking?` manager-only) — appended to the bottom of the list |
| GET | `/tasks/my` | Signed in | The caller's own tasks, soonest due first |
| PATCH | `/tasks/:id` | Assignee (status + estimate) / Manager (everything) | Update a task — developers revise hours/difficulty only; managers may also retitle, reassign, reschedule and set `isBlocking` |
| POST | `/tasks/:id/reorder` | Manager / Head / Senior (`task:manage`) | Move a task to `order` (zero-based); siblings rebalance to contiguous positions. Returns the whole list |
| DELETE | `/tasks/:id` | Manager; creator for their own untouched NEW task | Delete a task; the list closes the gap behind it |

Holding a task on a ticket makes you an active assignee on it; losing your last
task takes you back off, unless you are the lead. Task estimates roll up into
`Ticket.tasksEstimatedHours` / `tasksWeightTotal`, and `GET /tickets/:id` returns
`effectiveEstimatedHours` (the rollup, falling back to the planned figure),
`openTaskCount` and `actualHours`.

**Order and blocking.** Tasks carry a manual `order`, contiguous from 0, that
only `task:manage` may change. A task flagged `isBlocking` holds every task
below it: moving one of those out of `NEW` is refused with 400 until the blocker
reaches `COMPLETED`, so the tail of the list runs top to bottom. The rule binds
managers too — to work out of order, clear the flag or move the row above the
blocker. Every task read carries `blockedBy` (`{ id, title, order }` or `null`)
naming the nearest blocker still in the way.

### Meetings

Leadership-only (`meeting:read` / `meeting:manage`: `PROGRAMMING_HEAD`,
`PROJECT_MANAGER`, `SENIOR_MANAGEMENT`). A meeting belongs to exactly one
company and covers any number of its systems. Minutes are ordered
`MeetingPoint` rows — there is no free-text `minutes` field.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/meetings` | List — filters: `search`, `companyId`, `systemId`, `status`, `type`, `mine`, `isArchived`, `page`, `limit` |
| POST | `/meetings` | Schedule one; the organiser is seated automatically |
| GET | `/meetings/:id` | Detail — attendees, systems, ordered points, attachments |
| PATCH | `/meetings/:id` | Title, agenda, type, date, duration, location |
| POST | `/meetings/:id/hold` | SCHEDULED → HELD; stamps `heldAt` when empty |
| POST | `/meetings/:id/cancel` | SCHEDULED → CANCELLED |
| POST | `/meetings/:id/archive` | Archive — meetings are never hard-deleted |
| POST | `/meetings/:id/unarchive` | Restore |
| POST | `/meetings/:id/attendees` | Internal (`userId`) or external (`name`, `jobTitle`, `organization`) |
| DELETE | `/meetings/:id/attendees/:attendeeId` | Remove one |
| PUT | `/meetings/:id/systems` | Replace the whole `MeetingSystem` set |
| POST | `/meetings/:id/points` | Append a minutes line |
| PATCH | `/meetings/:id/points/:pointId` | Edit body, kind, who raised it |
| POST | `/meetings/:id/points/reorder` | `{ pointId, order }` — siblings rebalance to contiguous order |
| DELETE | `/meetings/:id/points/:pointId` | Delete a line; captured requirements survive, unlinked |
| POST | `/meetings/:id/points/:pointId/capture` | Create a Requirement (`source = MEETING`) from the line — needs `requirement:create` |

A cancelled or archived meeting refuses every write. Every mutation writes an
`AuditLog` row (`entity: 'Meeting' | 'MeetingPoint'`).

### Requirements

The backlog. There is **no `BACKLOG` ticket status** — an ask lives here until
leadership pins it to a system and promotes it.

`requirement:read` also reaches `DEVELOPER`, `QA` and `SYSTEM_OWNER`, but only
for requirements already pinned to a system they can see; an unpinned
requirement (`systemId: null`) is leadership-only. `TICKET_REQUESTER` gets 403
on every endpoint here.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/requirements` | List — filters: `search`, `status`, `open`, `source`, `companyId`, `systemId`, `ownerId`, `meetingId`, `mine`, `unpinned`, `isArchived`, `page`, `limit` |
| GET | `/requirements/open-count` | Sidebar badge — NEW + UNDER_REVIEW + ACCEPTED |
| POST | `/requirements` | File a standalone ask. `source = MEETING` is refused — that path is capture |
| GET | `/requirements/:id` | Detail — origin, comments (visibility-filtered), attachments, status history, linked tickets |
| PATCH | `/requirements/:id` | Triage: owner, system, priority, due date, wording (`requirement:triage`) |
| POST | `/requirements/:id/status` | Change status — writes `RequirementStatusHistory`. `CONVERTED` is refused; promote owns it |
| POST | `/requirements/:id/promote` | Create the linked ticket (`requirement:promote`) |
| POST | `/requirements/:id/archive` | Archive — never hard-deleted |
| POST | `/requirements/:id/unarchive` | Restore |
| POST | `/requirements/:id/comments` | Same thread as tickets — see Comments below |

**Promote** refuses a requirement with no `systemId`, one that is archived, and
one already DECLINED. The ticket it creates lands at **DRAFT** and goes through
DRAFT → NEW → AWAITING_APPROVAL like any other, so `PROGRAMMING_HEAD` approval
is still the only door into development (req.md §8, §21). The requirement moves
to `CONVERTED`, `Ticket.requirementId` is set, and both sides get an audit row.

### Comments

One thread implementation, two parents: a ticket or a requirement. Exactly one
of `TicketComment.ticketId` / `requirementId` is ever set.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tickets/:ticketId/comments` | Add comment (PUBLIC or INTERNAL) |
| PATCH | `/tickets/:ticketId/comments/:id` | Edit own comment; sending `mentions` replaces the mention list |
| DELETE | `/tickets/:ticketId/comments/:id` | Delete own comment — authors only, no override |
| POST | `/requirements/:requirementId/comments` | Same, on a requirement |
| PATCH | `/requirements/:requirementId/comments/:id` | Edit own comment |
| DELETE | `/requirements/:requirementId/comments/:id` | Delete own comment |

`INTERNAL` comments are hidden from `TICKET_REQUESTER` and `SYSTEM_OWNER`.
Mentions are filtered against the parent's scope before they are stored, since
a mention is a read grant. Both parents notify in-app and email: a ticket
mention sends «تم ذكرك في تذكرة» with a `BRM-` chip, a requirement mention
«تم ذكرك في متطلب» with a `REQ-` chip.

Deleting a comment removes its attachments (rows and files) first — the
attachment foreign key would otherwise block the delete and strand the uploads.

### Attachments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/attachments/upload?ticketId=&commentId=` | Upload file (multipart/form-data, max 10 MB) |
| DELETE | `/attachments/:id` | Delete attachment |

Owner query params: `ticketId`, `commentId`, `taskId`, `testCaseId`, `bugId`,
`testStepId`, `suiteId`, `meetingId`, `requirementId`. Exactly one is set, and
it decides which scope check the caller has to pass.

Allowed types: images, PDF, Excel/Word, video, zip.  
Files stored at `./uploads/` and served at `/uploads/`.

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | All notifications (pass `?unreadOnly=true`); each row includes the linked ticket (code, company, system, deadline) |
| GET | `/notifications/unread-count` | Count of unread |
| PATCH | `/notifications/ticket/:ticketId/read` | Mark all unread for that ticket as read |
| PATCH | `/notifications/:id/read` | Mark one as read |
| PATCH | `/notifications/read-all` | Mark all as read |

### Daily Digest

One scheduled job (`daily-digest`) emails every active user a personal Arabic summary.
**There are no digest endpoints — the cron is the only trigger.**

It is an in-process cron registered by `DigestService.onModuleInit` ([src/digest/digest.service.ts](src/digest/digest.service.ts)),
so it starts with the API and needs no OS crontab. Nothing to install: run the
backend and the job is live. Confirm it on boot with:

```
[DigestService] Daily digest scheduled at 09:00 Asia/Riyadh on days 0-4 (cron "0 9 * * 0-4")
```

Defaults to **09:00 `Asia/Riyadh`, Sunday–Thursday** — `DAILY_DIGEST_DAYS` is the
cron day-of-week field, so `0-4` skips Friday (5) and Saturday (6). All four
variables are optional; an invalid value logs a warning and falls back rather
than failing boot.

| Variable | Default | Effect |
|----------|---------|--------|
| `DAILY_DIGEST_TIME` | `09:00` | Send time, `HH:mm` |
| `DAILY_DIGEST_TIMEZONE` | `Asia/Riyadh` | IANA zone the time is read in |
| `DAILY_DIGEST_DAYS` | `0-4` | Cron day-of-week (`0`=Sun … `6`=Sat) |
| `DAILY_DIGEST_ENABLED` | on | `"false"` registers no job at all |
| `DAILY_DIGEST_LOOKBACK_HOURS` | `24` | Window for new activity (mentions, unread comments, newly waiting tickets, newly overdue) |

Each digest contains, scoped to what that user may see:

| Section | Source |
|---------|--------|
| اجتماعاتك اليوم | Meetings the user is listed as attending whose `heldAt` falls on today's calendar date in the digest timezone. Cancelled and archived meetings are omitted. Attendee membership is the gate — not ticket/company scope. |
| بانتظار إجراءك | Tickets that *entered* a status that role can move, in the lookback window. The chip is the full queue. |
| تمت الإشارة إليك | Comments from the lookback window mentioning the user |
| تعليقات لم تقرأها | Unread `COMMENT_ADDED` notifications from the lookback window, grouped by ticket |
| أخطاء على تذاكرك | Bugs filed or linked to your assigned tickets in the lookback window (includes read in-app notifications) |
| مهامك المفتوحة | Open tasks assigned to the user that were created in the window, or are due within 3 days |
| تجاوزت الموعد اليوم | Tickets whose deadline fell in the lookback window (not the whole overdue backlog) |
| مواعيد قريبة | `estimatedDeadline` within the next 3 days — these may repeat until the date passes |

The email lists at most 8 rows per section and says so: **لا تظهر كل التذاكر في هذا البريد — افتح لوحة التحكم لعرض الكل.** A long overdue pile or an unchanged action queue does not get re-listed every morning; open the dashboard for the full set.

Users with nothing in any *activity* section are skipped — no empty emails. Ticket visibility
comes from `AccessService.ticketScope`, the same rule the ticket list uses, and
`INTERNAL` comments are gated on `ticket:read-internal`.

### Invitations

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/invitations` | List all invitations |
| POST | `/invitations` | Invite new user (creates account + sends email) |
| PATCH | `/invitations/:id/resend` | Resend invitation email |
| PATCH | `/invitations/:id/revoke` | Revoke invitation |

**Invitation flow**: POST → user account created (no password) → email sent with link → user clicks link → POST `/auth/set-password` with token → account active.

### Reports

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/reports/dashboard` | Open, in-progress, overdue, critical counts + breakdowns |
| GET | `/reports/developers` | Per-developer: assigned, completed, overdue, completion rate |
| GET | `/reports/systems` | Per-system ticket counts |
| GET | `/reports/companies` | Per-company counts |
| GET | `/reports/overdue` | All overdue tickets with assignments |
| GET | `/reports/trend?months=6` | Monthly created vs closed trend (empty months filled with zeros) |

All reports accept `?companyId=` to scope by company.  
Accessible to: `PROGRAMMING_HEAD`, `PROJECT_MANAGER`, `SENIOR_MANAGEMENT`.

---

## Roles & Permissions

| Role | Key Permissions |
|------|----------------|
| `TICKET_REQUESTER` | Create/submit own tickets, view own tickets, add public comments — no meetings, no requirements |
| `SYSTEM_OWNER` | View company tickets, add comments, read requirements pinned to their systems |
| `PROGRAMMING_HEAD` | Approve/reject tickets, manage users and roles, invitations, signup requests, org structure, full reports, meetings and requirements |
| `PROJECT_MANAGER` | Assign tickets, close/reopen/archive, tasks, full reports, meetings and requirements — no user, invitation, signup or org-structure administration |
| `DEVELOPER` | View assigned tickets, start work, submit for testing, read scoped requirements |
| `QA` | Approve completion after testing, read scoped requirements |
| `SENIOR_MANAGEMENT` | Co-admin: users, invitations, signup requests, org structure, full reports, meetings and requirements |

---

## Database Models

| Model | Purpose |
|-------|---------|
| `User` | System users with role + company |
| `Company` | Group companies |
| `Department` | Departments within companies |
| `System` | Software systems that tickets are raised against |
| `UserSystem` | Many-to-many: which users can access which systems |
| `Ticket` | Core ticket with all metadata |
| `TicketComment` | Public and internal comments |
| `TicketAttachment` | Files attached to tickets or comments |
| `TicketStatusHistory` | Full audit trail of status changes |
| `TicketAssignment` | Developer assignments with estimates |
| `TicketApproval` | Approval decisions with notes |
| `TicketTemplate` | Reusable ticket templates |
| `EmailInvitation` | Invitation tokens with expiry |
| `Notification` | In-app notifications — carries `ticketId` or `requirementId` |
| `AuditLog` | General audit log for all entity changes |
| `Meeting` | One meeting: company, organiser, type, status, when and where |
| `MeetingAttendee` | Who was in the room — an account, or a named external guest |
| `MeetingSystem` | Which systems the meeting covered |
| `MeetingPoint` | One numbered minutes line (`order`, `kind`, `body`) |
| `Requirement` | A tracked ask — the backlog; promoted into a DRAFT ticket |
| `RequirementStatusHistory` | Full audit trail of requirement status changes |

---

## Prisma (v7)

Prisma 7 uses a `prisma.config.ts` at the project root for CLI operations (migrations, generate).  
The runtime client is initialized with the `@prisma/adapter-pg` driver adapter:

```typescript
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
new PrismaClient({ adapter });
```

### Common Commands

```bash
npx prisma migrate dev --name <name>   # create + apply migration
npx prisma migrate deploy              # apply in production
npx prisma generate                    # regenerate client after schema change
npx prisma studio                      # visual DB browser
```

---

## Email Service

Uses Nodemailer. Configure SMTP in `.env`.  
For Gmail: use an **App Password** (not your main password).  
Emails sent for: invitations, status updates, mentions, assignments, daily digest.  
`MAIL_ENABLED` is case-insensitive. Outside `NODE_ENV=production`, mail stays off unless `MAIL_ENABLED=true`.  
Jest / e2e never hit SMTP. If SMTP fails, errors are logged but do not crash the app.

---

## File Uploads

- Stored in `UPLOAD_DIR` (default `./uploads/`)
- Served statically at `/uploads/` via NestJS ServeStaticModule and nginx
- Filename: UUID + original extension (prevents collisions)
- Max size: 10 MB (configurable via `MAX_FILE_SIZE`)

---

## Production Deployment

```bash
# Build
npm run build

# Run (use PM2 in production)
pm2 start dist/src/main.js --name barmijly-api

# Or with environment file
pm2 start dist/src/main.js --name barmijly-api --env production
```

Nginx proxies `/api/` → `localhost:3001`.  
SSL is managed by Certbot (auto-renews).
