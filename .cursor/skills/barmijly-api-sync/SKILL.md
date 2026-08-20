---
name: barmijly-api-sync
description: Keeps backend API endpoints and frontend React Query hooks in sync. Use when adding or modifying controller endpoints, DTOs, API paths, or frontend hooks in Barmijly.
paths: backend/src/**/*.controller.ts,frontend/src/hooks/**
---

# Barmijly API Sync

## Rule

Every backend API change ships with matching frontend changes in the **same task**.

## Sync map

| Backend file | Frontend file(s) |
|--------------|------------------|
| `backend/src/tickets/tickets.controller.ts` | `frontend/src/hooks/useTickets.ts` |
| `backend/src/reports/reports.controller.ts` | `frontend/src/hooks/useReports.ts` |
| `backend/src/tasks/tasks.controller.ts` | `frontend/src/hooks/useTasks.ts` |
| `backend/src/notifications/notifications.controller.ts` | `frontend/src/hooks/useNotifications.ts` |
| New module controller | New `frontend/src/hooks/use<Feature>.ts` + page |

## Workflow

### 1. Backend first

```typescript
// controller
@Patch(':id/my-action')
@Roles(UserRole.DEVELOPER)
myAction(@Param('id') id: string, @Body() dto: MyActionDto, @CurrentUser() user: any) {
  return this.service.myAction(id, dto, user);
}
```

### 2. Frontend hook

Add to the relevant hook file:

```typescript
myAction: useMutation({
  mutationFn: (data: MyActionDto) =>
    api.patch(`/tickets/${id}/my-action`, data).then(r => r.data),
  onSuccess: () => { invalidate(); toast.success("تم التنفيذ"); },
  onError: (e: any) => toast.error(e.response?.data?.message || "حدث خطأ"),
}),
```

### 3. UI wiring

- Add button in page component, gated by role
- Use `disabled={actions.myAction.isPending}`
- Arabic label on button and toast

### 4. Constants (if new enum)

Update `frontend/src/lib/constants.ts` with `_LABELS` and `_COLORS`.

## Verification checklist

```
- [ ] Path and HTTP method match exactly
- [ ] Request body fields match DTO
- [ ] queryKey invalidated after mutation
- [ ] Arabic success/error toasts
- [ ] Swagger @ApiOperation on controller
- [ ] Test in Swagger, then test in UI
```

## Common misses

- Adding endpoint but forgetting `useTicketAction` mutation
- New enum in Prisma but no Arabic label
- Changing response shape without updating page component
- Missing `enabled: !!id` on detail queries

See also: [barmijly-patterns/reference.md](../barmijly-patterns/reference.md)
