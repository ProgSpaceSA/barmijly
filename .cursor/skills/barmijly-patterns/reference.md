# Barmijly Code Patterns Reference

Concrete patterns copied from this codebase. Follow these exactly.

---

## 1. NestJS endpoint with RBAC

From `backend/src/reports/reports.controller.ts`:

```typescript
import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  @Roles(UserRole.PROGRAMMING_HEAD, UserRole.PROJECT_MANAGER)
  @Get('dashboard')
  getDashboard(@CurrentUser() user: any, @Query('companyId') companyId?: string) {
    return this.reportsService.getDashboardStats(user.id, user.role, companyId);
  }
}
```

Tickets controller uses `JwtAuthGuard` only (role checks in service). Prefer `@Roles` on controller **plus** service scoping for new endpoints.

---

## 2. DTO with validation + Swagger

From `backend/src/tickets/dto/approve-ticket.dto.ts`:

```typescript
import { IsString, IsEnum, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ApprovalDecision {
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  NEEDS_INFO = 'NEEDS_INFO',
  CONVERT_TO_PROJECT = 'CONVERT_TO_PROJECT',
}

export class ApproveTicketDto {
  @ApiProperty({ enum: ApprovalDecision })
  @IsEnum(ApprovalDecision)
  decision: ApprovalDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
```

---

## 3. React Query list hook

From `frontend/src/hooks/useTickets.ts`:

```typescript
"use client";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

export function useTickets(filters: Record<string, string> = {}) {
  const params = new URLSearchParams(filters).toString();
  return useQuery({
    queryKey: ["tickets", filters],
    queryFn: () => api.get(`/tickets?${params}`).then(r => r.data),
  });
}
```

---

## 4. React Query mutation with toast + invalidation

From `frontend/src/hooks/useTickets.ts`:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post("/tickets", data).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tickets"] });
      toast.success("تم إنشاء التذكرة");
    },
    onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ"),
  });
}
```

New ticket actions go in `useTicketAction(id)` — one mutation per endpoint.

---

## 5. Ticket action mapping

| Backend endpoint | Frontend mutation |
|------------------|-------------------|
| `PATCH /tickets/:id/submit` | `actions.submit` |
| `PATCH /tickets/:id/approve` | `actions.approve` |
| `PATCH /tickets/:id/assign` | `actions.assign` |
| `PATCH /tickets/:id/start` | `actions.startWork` |
| `PATCH /tickets/:id/submit-for-testing` | `actions.submitForTesting` |
| `PATCH /tickets/:id/approve-completion` | `actions.approveCompletion` |
| `PATCH /tickets/:id/close` | `actions.close` |
| `PATCH /tickets/:id/archive` | `actions.archive` |
| `PATCH /tickets/:id/reopen` | `actions.reopen` |

---

## 6. Arabic labels for enums

From `frontend/src/lib/constants.ts`:

```typescript
export const TICKET_STATUS_LABELS: Record<string, string> = {
  DRAFT: "مسودة",
  NEW: "جديدة",
  IN_PROGRESS: "قيد التنفيذ",
  // ...
};

export const TICKET_STATUS_COLORS: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-700",
  IN_PROGRESS: "bg-indigo-100 text-indigo-700",
  // ...
};
```

Add both `_LABELS` and `_COLORS` for any new status or priority.

---

## 7. Ticket transition side effects (service)

Every transition in `tickets.service.ts` must:

```typescript
// 1. Validate current status
if (ticket.status !== TicketStatus.DRAFT) {
  throw new BadRequestException('...');
}

// 2. Update in transaction
await this.prisma.$transaction(async (tx) => {
  await tx.ticket.update({ where: { id }, data: { status: newStatus } });
  await tx.ticketStatusHistory.create({ data: { ticketId: id, fromStatus, toStatus, changedById: user.id } });
});

// 3. Audit + notify + email
await this.audit.log({ ... });
await this.notifications.create({ ... });
await this.email.sendStatusUpdate(...);  // if user-facing
```

---

## 8. Role-based sidebar nav

From `frontend/src/components/layout/Sidebar.tsx`:

```typescript
{ href: "/reports", label: "التقارير", icon: BarChart2,
  roles: ["PROGRAMMING_HEAD", "PROJECT_MANAGER", "SENIOR_MANAGEMENT"] }
```

Filter nav items by `user.role` from `useAuthStore`.

---

## 9. API client (JWT auto-attached)

From `frontend/src/lib/api.ts`:

```typescript
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "https://barmijly.ai/api",
});
// Interceptor adds Bearer token from localStorage
// 401 → redirect to /login
```

---

## 10. New backend module checklist

```
backend/src/<feature>/
├── <feature>.module.ts      → import in app.module.ts
├── <feature>.controller.ts  → @ApiTags, @UseGuards, @Roles
├── <feature>.service.ts     → inject PrismaService
└── dto/
    ├── create-<feature>.dto.ts
    └── update-<feature>.dto.ts

frontend/src/hooks/use<Feature>.ts
frontend/src/app/<feature>/page.tsx
frontend/src/lib/constants.ts  (if new enums)
```
