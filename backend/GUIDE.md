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
├── comments/         # Public & internal ticket comments
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

MAIL_HOST="smtp.gmail.com"
MAIL_PORT=587
MAIL_USER="your@gmail.com"
MAIL_PASS="your-app-password"
MAIL_FROM="noreply@barmijly.ai"

UPLOAD_DIR="./uploads"
MAX_FILE_SIZE=10485760   # 10 MB

REDIS_URL="redis://localhost:6379"

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
| GET | `/users/developers` | Head, Manager | List active developers |
| GET | `/users/:id` | Head, Manager, Senior | Get user |
| POST | `/users` | Head, Manager | Create user |
| PATCH | `/users/:id` | Head, Manager | Update user |
| PATCH | `/users/:id/activate` | Head | Activate user |
| PATCH | `/users/:id/deactivate` | Head | Deactivate user |

### Companies / Departments / Systems

Standard CRUD on `/companies`, `/departments`, `/systems`.  
Each has `GET`, `POST`, `PATCH :id`, `PATCH :id/deactivate`.

### Tickets — Full Workflow

| Method | Endpoint | Who | Description |
|--------|----------|-----|-------------|
| POST | `/tickets` | Any | Create draft ticket |
| PATCH | `/tickets/:id` | Creator / Manager | Edit draft or awaiting-info ticket |
| PATCH | `/tickets/:id/submit` | Creator | Submit draft → NEW |
| PATCH | `/tickets/:id/approve` | Head | Approve / Reject / Request info |
| PATCH | `/tickets/:id/assign` | Manager / Head | Assign developer + set metadata |
| PATCH | `/tickets/:id/start` | Developer | Mark IN_PROGRESS |
| PATCH | `/tickets/:id/submit-for-testing` | Developer | Move to AWAITING_TESTING |
| PATCH | `/tickets/:id/approve-completion` | QA / Creator | QA passes → owner approval / owner approves → COMPLETED |
| PATCH | `/tickets/:id/close` | Manager / Head | Close with closure notes |
| PATCH | `/tickets/:id/archive` | Manager / Head | Archive (soft) |
| PATCH | `/tickets/:id/reopen` | Manager / Head | Reopen closed/rejected ticket |
| POST | `/tickets/:id/duplicate` | Any | Clone ticket as new draft |
| GET | `/tickets` | Role-filtered | List tickets with filters + pagination |
| GET | `/tickets/:id` | Role-filtered | Ticket detail with full history |

#### Ticket Status Flow

```
DRAFT → NEW → AWAITING_APPROVAL → APPROVED → SCHEDULED → IN_PROGRESS
                                ↘ REJECTED
                                ↘ AWAITING_INFO → NEW
                                                       ↓
                              AWAITING_TESTING → AWAITING_OWNER_APPROVAL → COMPLETED → CLOSED
```

#### Approval Decisions

- `APPROVED` — moves to approved
- `REJECTED` — moves to rejected (with reason)
- `NEEDS_INFO` — moves back to awaiting info, notifies creator
- `CONVERT_TO_PROJECT` — puts on hold for separate project handling

### Comments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/tickets/:ticketId/comments` | Add comment (PUBLIC or INTERNAL) |
| PATCH | `/tickets/:ticketId/comments/:id` | Edit own comment |
| DELETE | `/tickets/:ticketId/comments/:id` | Delete own comment (managers can delete any) |

`INTERNAL` comments are hidden from `TICKET_REQUESTER` role.

### Attachments

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/attachments/upload?ticketId=&commentId=` | Upload file (multipart/form-data, max 10 MB) |
| DELETE | `/attachments/:id` | Delete attachment |

Allowed types: images, PDF, Excel/Word, video, zip.  
Files stored at `./uploads/` and served at `/uploads/`.

### Notifications

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | All notifications (pass `?unreadOnly=true`) |
| GET | `/notifications/unread-count` | Count of unread |
| PATCH | `/notifications/:id/read` | Mark one as read |
| PATCH | `/notifications/read-all` | Mark all as read |

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
| GET | `/reports/trend?months=6` | Monthly created vs closed trend |

All reports accept `?companyId=` to scope by company.  
Accessible to: `PROGRAMMING_HEAD`, `PROJECT_MANAGER`, `SENIOR_MANAGEMENT`.

---

## Roles & Permissions

| Role | Key Permissions |
|------|----------------|
| `TICKET_REQUESTER` | Create/submit own tickets, view own tickets, add public comments |
| `SYSTEM_OWNER` | View company tickets, add comments |
| `PROGRAMMING_HEAD` | Approve/reject tickets, manage all users, full reports |
| `PROJECT_MANAGER` | Assign tickets, manage companies/systems, full reports |
| `DEVELOPER` | View assigned tickets, start work, submit for testing |
| `QA` | Approve completion after testing |
| `SENIOR_MANAGEMENT` | Read-only reports and dashboard |

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
| `Notification` | In-app notifications |
| `AuditLog` | General audit log for all entity changes |

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
Emails sent for: invitations, status updates.  
If SMTP is not configured, email errors are logged but do not crash the app.

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
