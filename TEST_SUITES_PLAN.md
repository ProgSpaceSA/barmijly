# خطة التنفيذ — مجموعات الاختبار وحالات الاختبار والأخطاء

Test suites · test cases · bugs — implementation plan.

Status: **approved, not started**. Written 2026-08-25.

---

## 1. Decisions

Settled with the product owner before any code. Do not re-litigate these without
saying so explicitly.

| Question | Decision | Consequence |
|----------|----------|-------------|
| Is a bug a ticket? | **Own `Bug` entity**, plus a "promote to ticket" action that creates a linked `BUG_FIX` ticket | QA can file fast; the approval workflow only engages on promotion |
| Execution history? | **Current result per case** + `TestCaseResultHistory` audit table | No `TestRun` layer, no run picker, no per-run result rows |
| What does a suite hang off? | **One `System`** (→ `Company`), plus **many tickets** via `TestSuiteTicket` | Existing system/company scoping applies unchanged |
| Case lifecycle | **Two axes**: authoring `state` (`DRAFT`/`ACTIVE`/`ARCHIVED`) × execution `lastResult` | A draft case is not counted in pass rate |
| Who authors / who executes | Author + execute + bugs: `QA`, `PROGRAMMING_HEAD`, `PROJECT_MANAGER`, **`DEVELOPER`** (scoped to systems they can see; execute still needs a linked-ticket assignment) | `TICKET_REQUESTER` never sees the QA surface |
| Severity | New `BugSeverity` enum (impact) **and** reuse existing `Priority` (scheduling) | Two fields, two questions |
| Attachments | **Extend `TicketAttachment`** with `testCaseId`, `bugId`, and **`testStepId`** | Reuses upload endpoint; case/bug-level files stay separate from per-step screenshots |
| Step lists | **`TestStep` rows** (ordered), not `String[]` | Drag reorder, delete, optional screenshot per step — shared UI for case steps and bug repro steps |
| Pages | `/test-suites`, `/test-suites/[id]`, `/bugs`, + a section on the ticket page | No flat cross-suite case route |

### Explicitly deferred

- **No approval gate.** An open bug does **not** block a ticket moving to
  `COMPLETED`. Decided 2026-08-25 — revisit only on request.
- **No flat test-cases page.** "Cases assigned to me" is a **filter** on the
  suite workspace panel and on the suites list, not a third route.
- **No `TestRun`.** The schema is shaped so one could be added later without
  migrating existing results, but nothing is built for it.

---

## 2. Schema

File: `backend/prisma/schema.prisma`. One migration:

```bash
cd backend && npx prisma migrate dev --name test_suites_and_bugs && npx prisma generate
```

### 2.1 New enums

```prisma
/// Authoring state. Separate from TestResult on purpose: "written but not yet
/// run" and "still being drafted" are different things, and archiving a stale
/// case must not destroy its last result.
enum TestState {
  DRAFT
  ACTIVE
  ARCHIVED
}

/// Current execution result. NOT_RUN is the default for a freshly published case.
enum TestResult {
  NOT_RUN
  PASS
  FAIL
  BLOCKED
  SKIPPED
}

/// Impact, judged by whoever found it. Scheduling urgency stays in `Priority`.
enum BugSeverity {
  BLOCKER
  CRITICAL
  MAJOR
  MINOR
  TRIVIAL
}

enum BugStatus {
  OPEN
  IN_PROGRESS
  FIXED
  VERIFIED
  CLOSED
  WONT_FIX
  DUPLICATE
}
```

### 2.2 New models

```prisma
model TestSuite {
  id          String     @id @default(uuid())
  suiteNumber Int        @unique @default(autoincrement())
  title       String
  description String?
  systemId    String
  system      System     @relation(fields: [systemId], references: [id])
  companyId   String
  company     Company    @relation(fields: [companyId], references: [id])
  ownerId     String
  owner       User       @relation("SuiteOwner", fields: [ownerId], references: [id])
  state       TestState  @default(DRAFT)
  isArchived  Boolean    @default(false)
  /// Rollup over this suite's ACTIVE cases. Single writer: TestRollupService.
  lastRunAt   DateTime?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  cases         TestCase[]
  ticketLinks   TestSuiteTicket[]
  bugs          Bug[]

  @@index([systemId, state])
  @@index([companyId])
}

/// "This suite exercises that ticket." A suite covering authentication links
/// both the backend and the frontend auth tickets.
model TestSuiteTicket {
  suiteId    String
  suite      TestSuite @relation(fields: [suiteId], references: [id], onDelete: Cascade)
  ticketId   String
  ticket     Ticket    @relation(fields: [ticketId], references: [id], onDelete: Cascade)
  linkedById String
  linkedBy   User      @relation("SuiteTicketLinker", fields: [linkedById], references: [id])
  createdAt  DateTime  @default(now())

  @@id([suiteId, ticketId])
  @@index([ticketId])
}

model TestCase {
  id             String     @id @default(uuid())
  caseNumber     Int        @unique @default(autoincrement())
  suiteId        String
  suite          TestSuite  @relation(fields: [suiteId], references: [id], onDelete: Cascade)
  /// The one ticket this case is primarily about. The suite may link more.
  ticketId       String?
  ticket         Ticket?    @relation(fields: [ticketId], references: [id])
  assignedToId   String?
  assignedTo     User?      @relation("CaseAssignee", fields: [assignedToId], references: [id])
  title          String
  description    String?
  preconditions  String?
  expectedResult String
  actualResult   String?
  state          TestState  @default(DRAFT)
  lastResult     TestResult @default(NOT_RUN)
  lastRunAt      DateTime?
  lastRunById    String?
  lastRunBy      User?      @relation("CaseRunner", fields: [lastRunById], references: [id])
  /// Manual ordering inside the suite panel.
  order          Int        @default(0)
  createdAt      DateTime   @default(now())
  updatedAt      DateTime   @updatedAt

  steps          TestStep[] @relation("CaseSteps")
  bugs           Bug[]
  resultHistory  TestCaseResultHistory[]
  /// Case-level files only — step screenshots hang off TestStep.attachments.
  attachments    TicketAttachment[]

  @@index([suiteId, order])
  @@index([ticketId])
  @@index([assignedToId, lastResult])
}

/// Ordered step row — shared shape for test-case execution steps and bug repro
/// steps. Exactly one of testCaseId / bugId is set. Attachments (typically
/// screenshots) belong to the step, not the parent case/bug.
model TestStep {
  id          String   @id @default(uuid())
  testCaseId  String?
  testCase    TestCase? @relation("CaseSteps", fields: [testCaseId], references: [id], onDelete: Cascade)
  bugId       String?
  bug         Bug?     @relation("BugSteps", fields: [bugId], references: [id], onDelete: Cascade)
  order       Int      @default(0)
  body        String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  attachments TicketAttachment[]

  @@index([testCaseId, order])
  @@index([bugId, order])
}

/// Mirrors TicketStatusHistory: every result change is auditable.
model TestCaseResultHistory {
  id          String      @id @default(uuid())
  testCaseId  String
  testCase    TestCase    @relation(fields: [testCaseId], references: [id], onDelete: Cascade)
  fromResult  TestResult?
  toResult    TestResult
  changedById String
  changedBy   User        @relation("CaseResultChanger", fields: [changedById], references: [id])
  note        String?
  createdAt   DateTime    @default(now())

  @@index([testCaseId, createdAt])
}

model Bug {
  id               String      @id @default(uuid())
  bugNumber        Int         @unique @default(autoincrement())
  /// Null when the bug was filed straight from the bugs page.
  testCaseId       String?
  testCase         TestCase?   @relation(fields: [testCaseId], references: [id])
  suiteId          String?
  suite            TestSuite?  @relation(fields: [suiteId], references: [id])
  /// Denormalised on purpose: a standalone bug has no case to inherit scope
  /// from, and the list page filters on both constantly.
  systemId         String
  system           System      @relation(fields: [systemId], references: [id])
  companyId        String
  company          Company     @relation(fields: [companyId], references: [id])
  /// Set by "promote to ticket".
  ticketId         String?
  ticket           Ticket?     @relation("BugTicket", fields: [ticketId], references: [id])
  reportedById     String
  reportedBy       User        @relation("BugReporter", fields: [reportedById], references: [id])
  assignedToId     String?
  assignedTo       User?       @relation("BugAssignee", fields: [assignedToId], references: [id])
  title            String
  description      String
  expectedBehavior String?
  actualBehavior   String?
  environment      String?
  severity         BugSeverity
  priority         Priority?
  status           BugStatus   @default(OPEN)
  detectedAt       DateTime    @default(now())
  resolvedAt       DateTime?
  isArchived       Boolean     @default(false)
  createdAt        DateTime    @default(now())
  updatedAt        DateTime    @updatedAt

  steps            TestStep[]  @relation("BugSteps")
  attachments      TicketAttachment[]
  statusHistory    BugStatusHistory[]

  @@index([status, severity])
  @@index([systemId])
  @@index([assignedToId, status])
  @@index([ticketId])
  @@index([testCaseId])
}

model BugStatusHistory {
  id          String     @id @default(uuid())
  bugId       String
  bug         Bug        @relation(fields: [bugId], references: [id], onDelete: Cascade)
  fromStatus  BugStatus?
  toStatus    BugStatus
  changedById String
  changedBy   User       @relation("BugStatusChanger", fields: [changedById], references: [id])
  note        String?
  createdAt   DateTime   @default(now())

  @@index([bugId, createdAt])
}
```

### 2.3 Modified models

**`TicketAttachment`** — three more nullable FKs beside the existing
`ticketId` / `commentId` / `taskId`:

```prisma
  testCaseId   String?
  testCase     TestCase? @relation(fields: [testCaseId], references: [id], onDelete: Cascade)
  bugId        String?
  bug          Bug?      @relation(fields: [bugId], references: [id], onDelete: Cascade)
  testStepId   String?
  testStep     TestStep? @relation(fields: [testStepId], references: [id], onDelete: Cascade)
```

Upload accepts **at most one attachment per step** (replace on re-upload). Step
uploads use the same mime filter and 10 MB cap as everywhere else; images only
(`.png`, `.jpg`, `.webp`, `.gif`) for the step slot — general case/bug files
keep the existing allow-list.

**`Ticket`** — back-relations only, no column changes:

```prisma
  testCases   TestCase[]
  bugs        Bug[]             @relation("BugTicket")
  suiteLinks  TestSuiteTicket[]
```

**`System`** / **`Company`** — `testSuites TestSuite[]` and `bugs Bug[]`.

**`User`** — back-relations: `suitesOwned`, `suiteTicketLinks`, `casesAssigned`,
`casesRun`, `caseResultChanges`, `bugsReported`, `bugsAssigned`, `bugStatusChanges`.

**`NotificationType`** — add `BUG_ASSIGNED` and `TEST_CASE_FAILED`.

---

## 3. Backend

Two new modules, following the shape of `backend/src/tasks/`:

```
backend/src/testing/         suites + cases + results
  testing.module.ts
  suites.controller.ts   suites.service.ts   suites.service.spec.ts
  cases.controller.ts    cases.service.ts    cases.service.spec.ts
  testing.access.ts      testing.access.spec.ts
  test-rollup.service.ts test-rollup.service.spec.ts
  dto/

backend/src/bugs/
  bugs.module.ts
  bugs.controller.ts     bugs.service.ts     bugs.service.spec.ts
  bug-promote.ts         bug-promote.spec.ts
  dto/
```

### 3.1 Endpoints

Suites and cases — nested paths on a bare `@Controller()`, as in
`tasks.controller.ts`:

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/test-suites` | filters + pagination |
| `POST` | `/test-suites` | |
| `GET` | `/test-suites/:id` | includes cases, linked tickets, rollup counts |
| `PATCH` | `/test-suites/:id` | |
| `POST` | `/test-suites/:id/publish` | `DRAFT → ACTIVE` |
| `POST` | `/test-suites/:id/archive` | `→ ARCHIVED`. Never hard-delete |
| `POST` | `/test-suites/:id/tickets` | `{ ticketId }` |
| `DELETE` | `/test-suites/:id/tickets/:ticketId` | |
| `GET` | `/test-suites/:id/cases` | |
| `POST` | `/test-suites/:id/cases` | |
| `PATCH` | `/test-cases/:id` | |
| `POST` | `/test-cases/:id/publish` | `DRAFT → ACTIVE` |
| `POST` | `/test-cases/:id/result` | `{ result, actualResult?, note? }` → writes history + rollup |
| `POST` | `/test-cases/:id/reorder` | `{ order }` |
| `GET` | `/test-cases/:id/steps` | ordered steps + step attachments |
| `POST` | `/test-cases/:id/steps` | `{ body }` → appends at end |
| `PATCH` | `/test-steps/:id` | `{ body? }` |
| `POST` | `/test-steps/:id/reorder` | `{ order }` — rebalance siblings |
| `DELETE` | `/test-steps/:id` | cascades step attachment |
| `DELETE` | `/test-cases/:id` | `DRAFT` only; otherwise archive |
| `GET` | `/tickets/:id/testing` | suites + cases + bugs for the ticket section |

Bugs:

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/bugs` | `search`, `severity`, `status`, `assignedToId`, `mine`, `systemId`, `companyId`, `suiteId`, `hasTicket`, `from`, `to`, `page`, `limit` |
| `POST` | `/bugs` | `testCaseId` optional → standalone bug |
| `GET` | `/bugs/:id` | includes ordered repro steps |
| `PATCH` | `/bugs/:id` | |
| `GET` | `/bugs/:id/steps` | ordered repro steps + attachments |
| `POST` | `/bugs/:id/steps` | `{ body }` |
| `PATCH` | `/test-steps/:id` | shared with case steps |
| `POST` | `/test-steps/:id/reorder` | shared with case steps |
| `DELETE` | `/test-steps/:id` | shared with case steps |
| `POST` | `/bugs/:id/status` | `{ status, note? }` → writes `BugStatusHistory` |
| `POST` | `/bugs/:id/promote` | creates the linked `BUG_FIX` ticket |
| `POST` | `/bugs/:id/archive` | |

List responses use the existing envelope: `{ data, total, page, limit, totalPages }`.

### 3.2 Filters on `GET /test-suites`

`search`, `companyId`, `systemId`, `state`, `ownerId`, `mine`, `health`
(`failing` | `open-bugs` | `not-run`), `page`, `limit`.

`mine=true` on the suites list means **owned by me or has a case assigned to
me** — this is what replaces the flat case page.

### 3.3 Promote to ticket

The one place that touches the ticket workflow. `bug-promote.ts`:

1. Refuses if `bug.ticketId` is already set.
2. Creates a `Ticket` with `status: DRAFT`, `type: BUG_FIX`, `systemId` /
   `companyId` copied from the bug, `creatorId = actor.id`, and title /
   description / reason / expectedOutcome prefilled from the bug's fields.
   Repro steps are serialised into the ticket body as a numbered list
   (`1. …`, `2. …`) in step order; step screenshot URLs are appended as markdown
   image links under each step line when present.
3. Sets `bug.ticketId`.
4. Writes an `AuditLog` row on **both** entities.

The ticket then goes through the normal `DRAFT → NEW → AWAITING_APPROVAL` flow.
**No approval bypass**, and `PROGRAMMING_HEAD` approval is still required before
development — `AGENTS.md` core rules hold.

### 3.4 Access & RBAC

`testing.access.ts`, reusing the system/company scoping already in
`backend/src/tickets/` (`tickets.access.spec.ts`'s service is the model).

| Action | Roles |
|--------|-------|
| `test:read` | `QA`, `PROGRAMMING_HEAD`, `PROJECT_MANAGER`, `DEVELOPER`, `SYSTEM_OWNER`*, `SENIOR_MANAGEMENT` |
| `test:author` (create/edit/publish/archive suites + cases, link tickets) | `QA`, `PROGRAMMING_HEAD`, `PROJECT_MANAGER`, `DEVELOPER` |
| `test:execute` (record a result) | `QA`, `PROGRAMMING_HEAD`, `PROJECT_MANAGER`, `DEVELOPER` assigned to a linked ticket |
| `bug:create` | `QA`, `PROGRAMMING_HEAD`, `PROJECT_MANAGER`, `DEVELOPER` |
| `bug:assign` | `QA`, `PROGRAMMING_HEAD`, `PROJECT_MANAGER`, `DEVELOPER` |
| `bug:promote` | `QA`, `PROGRAMMING_HEAD`, `PROJECT_MANAGER`, `DEVELOPER` |

\* `SYSTEM_OWNER` and `SENIOR_MANAGEMENT` are read-only, and scoped to their
own systems/companies. `TICKET_REQUESTER` gets **403 on every endpoint above**
and sees no nav entry.

Every new endpoint carries a role check. No exceptions — see `AGENTS.md`.

### 3.5 Rollups

`TestRollupService`, modelled on `backend/src/tickets/task-rollup.service.ts`:
single writer, recomputed whenever a result changes or a case is
published/archived. Counts **`ACTIVE` cases only** — drafts and archived cases
are excluded from pass rate.

Exposed on `GET /test-suites` and `GET /test-suites/:id`:
`{ total, pass, fail, blocked, skipped, notRun, passRate, openBugs }`.

### 3.6 Notifications

- `TEST_CASE_FAILED` → the linked ticket's lead developer, when a case flips to `FAIL`.
- `BUG_ASSIGNED` → the assignee, on create-with-assignee and on reassignment.

Both go through the existing `NotificationsService`; the daily digest picks them
up with no change.

### 3.7 Attachments

No new endpoint. `attachments.controller.ts` gains query params
`testCaseId`, `bugId`, and **`testStepId`** passed through to
`AttachmentsService.upload`, and `resolveDownload` extends its scope check to
cover all three owners. When `testStepId` is set, reject if that step already
has an attachment (client replaces via delete-then-upload or a dedicated
replace flow — pick delete-then-upload for v1).

### 3.8 Tests

Every service gets a spec in the same commit, `Test.createTestingModule` with a
mocked `PrismaService`, no database. Cover, at minimum:

- the role gate on each mutating endpoint (including `TICKET_REQUESTER` → 403);
- the state guard (`publish` from a non-`DRAFT` state, `DELETE` on a published case);
- result change writes exactly one history row and updates the rollup;
- `promote` refuses a bug that already has a ticket, and creates the ticket at `DRAFT`;
- step reorder rebalance writes contiguous `order` values; delete removes the row and its attachment;
- publish rejects a case/bug with zero steps when `state` would become `ACTIVE`;
- system/company scoping — a user outside the scope gets nothing in the list.

---

## 4. Frontend

### 4.1 Hooks

`frontend/src/hooks/useTestSuites.ts`, `useTestCases.ts`, `useBugs.ts` —
mirroring `useTickets.ts`, same pagination envelope, same
`{ data, isLoading }` surface. Query keys added to
`frontend/src/lib/query-keys.ts` as `qk.suites.*`, `qk.cases.*`, `qk.bugs.*`.

Backend endpoint changes must sync these hooks — see the `barmijly-api-sync`
skill before touching a controller.

### 4.2 Routes

```
frontend/src/app/test-suites/page.tsx        suites list
frontend/src/app/test-suites/[id]/page.tsx   the workspace
frontend/src/app/bugs/page.tsx               bugs list
```

**Suites list.** `PageHeader` + search + pill rails (companies / state / health /
owner, including «المُسندة إليّ») + count line + suite cards + pagination —
exactly the anatomy of `frontend/src/app/tickets/page.tsx`. Each card reuses the
`TicketListCard` shape: 4 px status spine, chips, meta row. The spine colour
encodes **health**, not state: red = has failures, orange = open bugs,
green = clean, grey = draft.

**Workspace.** Three columns, right-to-left: nav rail → case panel (340 px) →
detail pane.

- Case panel: header with «+ حالة جديدة», search, filter segmented control
  (`الكل` / `فشل` / `محجوب` / `لم يُنفَّذ` / `مسودة` / `المُسندة إليّ`), then the
  case rows — result dot, title, code, assignee, bug count, attachment count,
  draft badge. Ends with a dashed "add case" row.
- Detail pane: title + code + state chip + result chip + last run; assignee and
  linked ticket; then الوصف / المتطلبات المسبقة / **خطوات التنفيذ** (see
  §4.7) / النتيجة المتوقعة / النتيجة الفعلية / **المرفقات** (case-level only);
  then a **collapsible bugs section** listing the case's bugs with an "add bug"
  row and a per-bug «إنشاء تذكرة» action when the bug has no ticket.
- Footer action bar: result segmented control (`نجح` / `فشل` / `محجوب` /
  `متخطى`), «حفظ كمسودة», «نشر الحالة», delete.

**Bugs list.** Stat tiles (`.brm-stat` anatomy) → search → filter rails
(severity / status / link / assignee) → count → bug rows → pagination. The
`hasTicket=false` filter is the important one: it surfaces bugs not yet promoted,
and each such row carries an inline «إنشاء تذكرة» button.

### 4.3 Ticket page section

`frontend/src/app/tickets/[id]/page.tsx` gains a `Section` card titled
**«الاختبارات والأخطاء»**, placed between المهام and التعليقات.

That page has **no tabs** — it is a stack of `Section` cards — so a tab would be
a foreign pattern. The section body holds three groups: linked suites with a
mini pass-rate bar, the cases covering this ticket, and the bugs filed against
it, plus «تسجيل خطأ» and «ربط بمجموعة» actions.

### 4.4 Components

`frontend/src/components/testing/`:

`SuiteListCard` · `TestCasePanel` · `TestCaseRow` · `TestCaseDetail` ·
`OrderedStepList` · `StepRow` · `TestCaseBugs` (the collapsible section) ·
`BugEditorDialog` · `BugListCard` · `ResultBadge` · `SeverityBadge` ·
`BugStatusBadge` · `PassRateBar` · `TicketTestingSection`.

`OrderedStepList` + `StepRow` are **one pair, two entry points** — used for
**خطوات التنفيذ** on `TestCaseDetail` and **خطوات إعادة الإنتاج** inside
`BugEditorDialog`. Props: `steps`, `onReorder`, `onAdd`, `onDelete`,
`onBodyChange`, `onAttach`, `onDetach`, `readOnly?`.

`BugEditorDialog` is **one component for both entry points**. Opened from a case
it carries a context strip naming the suite and case (removable → the bug
becomes standalone); opened from the bugs page the strip is empty and the
system/company pickers are shown instead. Three save actions: «حفظ كمسودة»,
«حفظ», «حفظ وإنشاء تذكرة». Repro steps use `OrderedStepList`, not a textarea.

Each component gets a `*.test.tsx` beside it (vitest + RTL).

### 4.5 Sidebar

Two entries in `frontend/src/components/layout/Sidebar.tsx`:

```ts
{ href: "/test-suites", label: "الاختبارات", icon: FlaskConical, action: "test:read" },
{ href: "/bugs",        label: "الأخطاء",    icon: Bug,          action: "test:read" },
```

`/bugs` carries an open-bug count badge, same markup as the notifications badge.

### 4.6 Labels & styling

All user-facing strings go in `frontend/src/lib/constants.ts`:
`TEST_STATE_LABELS`, `TEST_RESULT_LABELS`, `BUG_SEVERITY_LABELS`,
`BUG_STATUS_LABELS`, `TESTING_LABELS`.

| Enum value | Arabic |
|---|---|
| `DRAFT` / `ACTIVE` / `ARCHIVED` | مسودة · منشورة · مؤرشفة |
| `NOT_RUN` / `PASS` / `FAIL` / `BLOCKED` / `SKIPPED` | لم يُنفَّذ · نجح · فشل · محجوب · متخطى |
| `BLOCKER` / `CRITICAL` / `MAJOR` / `MINOR` / `TRIVIAL` | مُعطِّل · حرج · كبير · بسيط · طفيف |
| `OPEN` / `IN_PROGRESS` / `FIXED` / `VERIFIED` / `CLOSED` / `WONT_FIX` / `DUPLICATE` | مفتوح · قيد الإصلاح · تم الإصلاح · تم التحقق · مغلق · لن يُصلَح · مكرر |

Colours follow the existing `.brm-chip` convention in
`frontend/src/app/globals.css` — new `[data-result]` and `[data-severity]`
blocks with a light and a dark variant each, same `rgba(...,0.10)` / `0.18`
pattern. Codes render in `.font-brm` inside `.ltr-isolate`, as
`TS-0007` / `TC-0114` / `BUG-0114`, matching `formatTicketCode`'s
`BRM-0142` style.

RTL is the default and layouts are mobile-first. On phones the case panel
becomes the first screen and a case opens full-screen; hit targets stay ≥ 44 px;
action bars pin to the bottom. No fake status bar.

### 4.7 Ordered step lists (`OrderedStepList`)

Steps are **never a plain textarea or `String[]` in the UI**. Each step is its
own row in a vertical list, numbered by `order` (1, 2, 3… in the UI; renumbered
live after reorder/delete).

**Layout per step (`StepRow`) — RTL, one block stacked under the previous:**

```
┌─ grip ─ ① ─ [ step text input ........................... ] ─ × ─┐
│  [ thumb │ filename.png  × ]   ← only when attached; else:        │
│  ┌─ dashed: «+ لقطة شاشة» or drop zone ─────────────────────────┐ │
└───────────────────────────────────────────────────────────────────┘
```

- **Grip** (≡): drag handle — reorder via `@dnd-kit/sortable` (same dependency
  family as shadcn patterns; no bespoke HTML5-only DnD). On drop →
  `POST /test-steps/:id/reorder`. Touch: long-press to lift on mobile.
- **Order badge**: fixed-width circle with step number; updates immediately while
  dragging (placeholder gap shows drop target).
- **Body**: single-line `Input` by default; expands to two lines on focus if text
  wraps. Autosave on blur → `PATCH /test-steps/:id`.
- **Delete** (×): removes the step; if it has a screenshot, confirm once
  («حذف الخطوة والمرفق؟»). Disabled when only one step remains **while
  publishing** — drafts may have zero steps until save.
- **Attachment strip** (below the text row, full width of the step block):
  - **Empty**: one-line dashed `FileDropZone` — «+ لقطة شاشة» / paste / drag.
    Accept images only. Height ≈ 36 px; not a giant drop panel.
  - **Filled**: inline thumbnail (40×40, `object-cover`, rounded) + truncated
    filename + remove (×). Click thumbnail → existing ticket lightbox pattern on
    the ticket page. Upload uses `testStepId` query param.
  - Only **one** image per step in v1.

**List chrome:**

- Vertical stack with `gap-2`; no card per step — a subtle
  `border-b border-border/50` between steps is enough.
- **«+ إضافة خطوة»** dashed row at the bottom (same affordance as the suite
  panel's «add case» row). Inserts a new empty step at the end and focuses it.
- **Read-only mode** (viewers / archived): grip and delete hidden; attachment
  strip becomes thumbnail-only.

**Where it appears:**

| Surface | Label | Editable |
|---------|-------|----------|
| `TestCaseDetail` | خطوات التنفيذ | `test:author` |
| `BugEditorDialog` | خطوات إعادة الإنتاج | `bug:create` |
| Ticket testing section (case expand) | خطوات التنفيذ | read-only |

Reuse `FileDropZone` from `frontend/src/components/shared/FileDropZone.tsx` for
the per-step drop target. Labels in `TESTING_LABELS`:
`addStep`, `addScreenshot`, `deleteStep`, `deleteStepConfirm`.

### 4.8 Tests

Same bar as tickets: **new or changed code ships with specs in the same commit**.
`npm run check` at the repo root must pass (Husky + CI).

#### Backend (`*.spec.ts` next to the service)

`Test.createTestingModule` + mocked `PrismaService` — no database.

| Area | Minimum cases |
|------|----------------|
| RBAC | `TICKET_REQUESTER` → 403 on every mutating route; each `test:*` / `bug:*` action allowed/denied per §3.4 |
| Scoping | user outside system/company gets empty list / 404 on detail |
| Suite lifecycle | publish from `DRAFT` only; archive never hard-deletes; rollup excludes `DRAFT`/`ARCHIVED` cases |
| Case lifecycle | publish requires ≥1 step; result change → one `TestCaseResultHistory` row + rollup refresh |
| Steps | reorder rebalances contiguous `order`; delete cascades step attachment |
| Bug lifecycle | status change → `BugStatusHistory`; promote refuses when `ticketId` set; promoted ticket is `DRAFT` + `BUG_FIX` |
| Attachments | upload with `testStepId` rejects second file on same step; download guard respects scope |
| Notifications | `TEST_CASE_FAILED` on `FAIL`; `BUG_ASSIGNED` on assign |

#### Frontend (`*.test.tsx` beside the component or page)

Vitest + React Testing Library. Mock `api`, `useAuthStore`, `next/navigation` —
mirror `frontend/src/app/tickets/new/page.test.tsx`.

| Component / page | Cover |
|------------------|-------|
| `SuiteListCard` | health spine colour; chips; navigates on click |
| `TestCasePanel` | filter pills; selected row; «+ حالة جديدة» visible for `test:author` |
| `OrderedStepList` / `StepRow` | add step; delete step; reorder (mock DnD or call `onReorder`); attach/detach screenshot strip; read-only hides grip/delete |
| `TestCaseDetail` | result footer; save disabled while loading; bugs section expand |
| `BugEditorDialog` | context strip from case; standalone shows company/system pickers; three save buttons |
| `BugListCard` | «إنشاء تذكرة» when `hasTicket=false`; severity/status chips |
| `TicketTestingSection` | three groups render; read-only steps |
| `/test-suites` page | skeleton while loading; empty state; filter changes query |
| `/test-suites/[id]` page | mobile: case panel first; desktop: three columns |
| `/bugs` page | stat tiles; `hasTicket=false` filter |

Hook tests (`useTestSuites`, `useTestCases`, `useBugs`): query key + envelope shape
when the hook wraps non-trivial logic (optional if page tests cover the path).

#### Manual QA (`barmijly-qa-testing` skill)

Walk once before merge with QA accounts:

1. QA creates suite → adds case with ordered steps + step screenshot → publishes.
2. QA records `FAIL` → developer on linked ticket sees notification.
3. QA files bug from case → promotes to ticket → ticket stays `DRAFT` until submitted.
4. `TICKET_REQUESTER` never sees sidebar entries or gets 403 on direct URL.

### 4.9 Responsiveness

Follow `.cursor/rules/responsive-ui.mdc` and `.cursor/rules/rtl-arabic-ui.mdc`.
Every testing screen must be usable at **~360px** and **≥1024px** before merge.

| Screen | Mobile (< `lg`) | Desktop (`lg+`) |
|--------|-----------------|-------------------|
| Suites list | single column cards; filter pills horizontal scroll inside a rail | same as tickets list density |
| Workspace | **case panel full width first**; selecting a case opens **full-screen detail** with back chevron; footer action bar **sticky bottom** | nav rail + case panel (340px) + detail pane; footer bar inline |
| Bugs list | stat tiles `grid-cols-2`; rows stack meta under title | stat tiles `grid-cols-4`; inline promote button |
| `BugEditorDialog` | `max-w-full`, body scrolls, actions stack if needed | `max-w-lg` modal shell per `frontend-nextjs.mdc` |
| `OrderedStepList` | grip + delete targets **≥44px**; step input `min-w-0`; screenshot thumb 40×40 | same; DnD handle visible |
| Ticket testing section | pass-rate bar `max-w-full`; case/bug rows wrap | mini bar beside suite row |

**Must not:** fixed page widths; hide the only path to record a result or file a
bug on phone; native `<select>`; English-only strings.

Verify in DevTools at 360×640 and 1280×800 before marking frontend steps done.

---

## 5. Order of work

1. Schema + migration + `prisma generate`.
2. `backend/src/testing/` — suites, cases, results, history, rollup + specs.
3. `backend/src/bugs/` — CRUD, status history, promote + specs.
4. Attachment extension (two query params + download-guard scope) + spec.
5. `GET /tickets/:id/testing` + notifications.
6. Frontend hooks + query keys.
7. Suites list → workspace → bugs page (+ responsive pass at 360px / `lg`).
8. Ticket section + sidebar + labels + chip CSS.
9. Frontend component/page tests (§4.8), then `npm run check` at the repo root.

Each step is a commit with its tests. Nothing is merged with a failing
`npm run check` — Husky and CI both run it.

---

## 6. Non-negotiables carried over

From `AGENTS.md` and `req.md` §21:

- No ticket enters development without `PROGRAMMING_HEAD` approval — the
  promote flow creates a `DRAFT`, it does not shortcut.
- Nothing is hard-deleted. Suites and cases archive; bugs archive.
- Every state change is auditable — `TestCaseResultHistory`,
  `BugStatusHistory`, `AuditLog`.
- Users see only the systems and companies they are assigned to, except
  programming-team roles.
- No English-only UI. Every label lands in `constants.ts` with Arabic text.
- Role checks on every new endpoint.
