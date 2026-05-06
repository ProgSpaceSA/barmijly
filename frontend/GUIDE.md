# برمجلي — Frontend Guide

## Overview

Next.js 15 App Router frontend for the Barmijli ticket management system.
Full Arabic RTL UI, role-based access, JWT authentication.

- **URL**: https://barmijly.ai
- **Port**: 3000 (served by Next.js, proxied through nginx)
- **API**: https://barmijly.ai/api (backend on port 3001)

---

## Tech Stack

| Tool | Purpose |
|------|---------|
| Next.js 15 | App Router, SSR/CSR |
| TypeScript | Type safety |
| Tailwind CSS | Styling |
| shadcn/ui | UI components |
| Zustand + persist | Auth state |
| TanStack React Query v5 | Server state / caching |
| Axios | HTTP client with JWT interceptor |
| react-hook-form + Zod | Form validation |
| Recharts | Charts (dashboard, reports) |
| Sonner | Toast notifications |
| date-fns + Arabic locale | Date formatting |

---

## Project Structure

```
src/
├── app/                      # Next.js App Router pages
│   ├── layout.tsx            # Root layout: html lang="ar" dir="rtl"
│   ├── globals.css           # CSS vars, RTL defaults
│   ├── page.tsx              # Redirects to /dashboard or /login
│   ├── login/                # Login page (public)
│   ├── accept-invitation/    # Set password from invite token (public)
│   ├── dashboard/            # Stat cards, charts, overdue list
│   ├── tickets/
│   │   ├── page.tsx          # Filterable ticket list
│   │   ├── new/page.tsx      # Create ticket form
│   │   └── [id]/page.tsx     # Ticket detail + actions + comments
│   ├── notifications/        # Notification list, mark-read
│   ├── reports/              # KPI, charts, developer table
│   ├── users/                # User management, invite
│   ├── companies/            # Companies / departments / systems CRUD
│   └── invitations/          # Invitation list, resend/revoke
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx       # RTL sidebar, role-based nav
│   │   └── AppShell.tsx      # Auth guard + layout wrapper
│   └── providers.tsx         # QueryClient + Toaster
├── hooks/
│   ├── useTickets.ts         # All ticket queries + mutations
│   ├── useNotifications.ts   # Notifications with 30s polling
│   └── useReports.ts         # Dashboard + report queries
├── lib/
│   ├── api.ts                # Axios instance, Bearer interceptor, 401→/login
│   └── constants.ts          # Arabic labels for all enums
└── store/
    └── auth.ts               # Zustand: token, user, setAuth, logout, hasRole
```

---

## Authentication Flow

1. User visits `/` → redirected to `/dashboard` (if token in store) or `/login`
2. Login: `POST /api/auth/login` → receives `{ access_token, user }`
3. Token stored in Zustand (persisted to localStorage via `persist` middleware)
4. All API calls: `Authorization: Bearer <token>` header via Axios interceptor
5. On 401 response: clear store, redirect to `/login`
6. Invitation flow: email link → `/accept-invitation?token=xxx` → set password → auto-login

---

## Role-Based Access

Roles (in decreasing privilege):
- `SUPER_ADMIN` — full access, manage all companies/users
- `COMPANY_ADMIN` — manage their company's users
- `DEVELOPER_LEAD` — assign tickets, override priorities
- `DEVELOPER` — work on tickets, update progress
- `PROJECT_MANAGER` — view all, manage tickets
- `KEY_USER` — create tickets, view reports
- `END_USER` — create tickets, view own tickets

UI access controlled via `hasRole([...roles])` from the auth store.
Pages that require elevated access redirect to `/dashboard` if role is insufficient.

---

## Sidebar Navigation

| Item | Roles |
|------|-------|
| لوحة التحكم (Dashboard) | All |
| التذاكر (Tickets) | All |
| إشعاراتي (Notifications) | All |
| التقارير (Reports) | SUPER_ADMIN, DEVELOPER_LEAD, PROJECT_MANAGER, COMPANY_ADMIN |
| المستخدمون (Users) | SUPER_ADMIN, COMPANY_ADMIN |
| الشركات (Companies) | SUPER_ADMIN, COMPANY_ADMIN |
| الدعوات (Invitations) | SUPER_ADMIN, COMPANY_ADMIN |

---

## Key Patterns

### Fetching Data
```tsx
const { data, isLoading } = useQuery({
  queryKey: ['tickets', filters],
  queryFn: () => api.get('/tickets', { params: filters }).then(r => r.data),
});
```

### Mutations
```tsx
const mutation = useMutation({
  mutationFn: (data) => api.post('/tickets', data),
  onSuccess: () => {
    toast.success('تم إنشاء التذكرة');
    queryClient.invalidateQueries({ queryKey: ['tickets'] });
  },
  onError: () => toast.error('حدث خطأ'),
});
```

### Form Validation
```tsx
const schema = z.object({ title: z.string().min(5) });
const { register, handleSubmit, formState: { errors } } = useForm({
  resolver: zodResolver(schema),
});
```

---

## Ticket Workflow

```
DRAFT → SUBMITTED → IN_REVIEW → IN_PROGRESS → PENDING_APPROVAL → APPROVED → COMPLETED
                                                                ↓
                                                             REJECTED
                 ↓                        ↓
              CANCELLED              PENDING_INFO → (back to previous)
```

Action buttons on ticket detail page are role-dependent and auto-hide when action is not available.

---

## Environment

```env
NEXT_PUBLIC_API_URL=https://barmijly.ai/api
```

---

## Running in Development

```bash
cd /home/barmijly/frontend
npm run dev        # starts on port 3000
```

## Building for Production

```bash
npm run build
npm start          # or via systemd (barmijly-frontend.service)
```

---

## Systemd Service

```ini
# /etc/systemd/system/barmijly-frontend.service
[Unit]
Description=Barmijli Frontend
After=network.target

[Service]
User=ubuntu
WorkingDirectory=/home/barmijly/frontend
ExecStart=/home/ubuntu/.nvm/versions/node/v24.15.0/bin/node node_modules/.bin/next start
Restart=always
Environment=PORT=3000
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

---

## Adding New Pages

1. Create `src/app/<route>/page.tsx`
2. Wrap with `<AppShell>` to get auth guard + sidebar
3. Use `useAuthStore()` for role checks
4. Add route to `Sidebar.tsx` nav items if needed

---

## Notes

- All pages use `'use client'` — no server components (auth state is client-side)
- RTL: `dir="rtl"` on `<html>`, Tailwind uses `mr-*`/`ml-*` as-is (RTL-aware with Tailwind v3+)
- Arabic text labels centralized in `src/lib/constants.ts`
- API base URL is set via `NEXT_PUBLIC_API_URL` env var — never hardcode
