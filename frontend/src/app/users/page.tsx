'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { qk } from '@/lib/query-keys';
import { AppShell } from '@/components/layout/AppShell';
import { useAuthStore } from '@/store/auth';
import { usePermissions } from "@/hooks/usePermissions";
import { ROLE_LABELS, SELECT_PLACEHOLDERS } from '@/lib/constants';
import { CodeComment } from '@/components/shared/CodeComment';
import { toast } from 'sonner';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, X, Search, Shield, Users } from 'lucide-react';
import { CompanyProjectTree } from '@/components/shared/CompanyProjectTree';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SkeletonTable, SkeletonStat } from '@/components/shared/LoadingSpinner';
import {
  type MembershipSelection,
  membershipFromUser,
  applyMembershipToUser,
  type CompanyWithSystems,
} from '@/lib/membership';

const inviteSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  firstName: z.string().min(2, 'الاسم الأول مطلوب'),
  lastName: z.string().min(2, 'اسم العائلة مطلوب'),
  role: z.string().min(1, 'الدور مطلوب'),
  companyIds: z.array(z.string()).optional(),
  systemIds: z.array(z.string()).optional(),
});
type InviteForm = z.infer<typeof inviteSchema>;

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  company?: { id: string; name: string };
  companies?: { company: { id: string; name: string } }[];
  systems?: {
    system: {
      id: string;
      name: string;
      companyId: string;
      company?: { id: string; name: string };
    };
  }[];
  createdAt: string;
}

const NO_COMPANY = '__none__';

function userCompanyIds(user: User): string[] {
  const ids = new Set<string>();
  if (user.company?.id) ids.add(user.company.id);
  for (const uc of user.companies ?? []) ids.add(uc.company.id);
  for (const us of user.systems ?? []) {
    const cid = us.system?.companyId ?? us.system?.company?.id;
    if (cid) ids.add(cid);
  }
  return [...ids];
}

function companiesFromUsers(users: User[]): { id: string; name: string }[] {
  const names = new Map<string, string>();
  for (const user of users) {
    if (user.company?.id) names.set(user.company.id, user.company.name);
    for (const uc of user.companies ?? []) names.set(uc.company.id, uc.company.name);
    for (const us of user.systems ?? []) {
      const company = us.system?.company;
      if (company?.id) names.set(company.id, company.name);
    }
  }
  return [...names.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}

function FilterPill({
  label, active, onClick, ariaLabel, count,
}: {
  label: string; active: boolean; onClick: () => void; ariaLabel?: string; count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      aria-pressed={active}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
      style={{
        background: active ? 'var(--card)' : 'transparent',
        color: active ? 'var(--foreground)' : 'var(--muted-foreground)',
        boxShadow: active ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
      }}
    >
      {label}
      {count !== undefined && (
        <span
          className="font-brm text-[10px] tabular-nums px-1.5 py-0.5 rounded-md"
          style={{
            background: active ? 'rgba(79,70,229,0.12)' : 'var(--background)',
            color: active ? '#4F46E5' : 'var(--muted-foreground)',
          }}
        >
          {count}
        </span>
      )}
    </button>
  );
}

const MEMBERSHIP_ROLES = new Set(['DEVELOPER', 'QA']);

const ROLES = [
  { value: 'SENIOR_MANAGEMENT',  label: 'الإدارة العليا',     dot: '#8B5CF6' },
  { value: 'PROGRAMMING_HEAD',   label: 'رئيس البرمجة',       dot: '#4F46E5' },
  { value: 'PROJECT_MANAGER',    label: 'مدير مشروع',         dot: '#3B82F6' },
  { value: 'DEVELOPER',          label: 'مطور',               dot: '#06B6D4' },
  { value: 'QA',                 label: 'ضمان الجودة',         dot: '#14B8A6' },
  { value: 'SYSTEM_OWNER',       label: 'مالك النظام',         dot: '#F59E0B' },
  { value: 'TICKET_REQUESTER',   label: 'مقدم طلب',           dot: '#94A3B8' },
];

const ROLE_DOT: Record<string, string> = Object.fromEntries(ROLES.map(r => [r.value, r.dot]));

const inputCls = 'w-full rounded-xl px-3 py-2.5 text-sm outline-none transition-all';

/** The role picker, on the same control the rest of the app uses. */
function RoleSelect({
  value,
  onChange,
  includePlaceholder = false,
  ariaLabel = 'الدور',
}: {
  value: string;
  onChange: (value: string) => void;
  includePlaceholder?: boolean;
  ariaLabel?: string;
}) {
  const options = ROLES.map(r => ({ value: r.value, label: ROLE_LABELS[r.value] || r.label }));
  return (
    <Select
      value={value || null}
      onValueChange={(v: string | null) => onChange(v ?? '')}
      items={[
        ...(includePlaceholder ? [{ value: null, label: SELECT_PLACEHOLDERS.role }] : []),
        ...options,
      ]}
    >
      <SelectTrigger aria-label={ariaLabel}>
        <SelectValue placeholder={SELECT_PLACEHOLDERS.role} />
      </SelectTrigger>
      <SelectContent>
        {includePlaceholder && <SelectItem value={null}>{SELECT_PLACEHOLDERS.role}</SelectItem>}
        {options.map(o => (
          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
const inputStyle = { backgroundColor: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' };
const focusBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.target.style.borderColor = '#4F46E5');
const blurBorder  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.target.style.borderColor = 'var(--border)');

function Modal({ title, sub, icon: Icon, onClose, children }: {
  title: string; sub?: string; icon?: any; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="palette-modal brm-modal max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: 'rgba(79,70,229,0.12)' }}>
                <Icon className="w-5 h-5" style={{ color: '#4F46E5' }} />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold" style={{ color: 'var(--foreground)' }}>{title}</h2>
              {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{sub}</p>}
            </div>
          </div>
          <button onClick={onClose} className="transition-colors" style={{ color: 'var(--muted-foreground)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--foreground)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--muted-foreground)')}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 sm:p-6">{children}</div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const { can: allowed } = usePermissions();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editMembership, setEditMembership] = useState<MembershipSelection>({ companyIds: [], systemIds: [] });
  const [inviteMembership, setInviteMembership] = useState<MembershipSelection>({ companyIds: [], systemIds: [] });
  /** Forces the table/form to reflect a save even if a stale list GET races the cache. */
  const [membershipOverrides, setMembershipOverrides] = useState<Record<string, Pick<User, 'company' | 'companies' | 'systems' | 'firstName' | 'lastName' | 'role'>>>({});

  const canManage = allowed('user:manage');
  const canManageMembership = allowed('user:manage-membership');
  const canAssignRole = allowed('user:assign-role');
  const directoryOnly = canManageMembership && !canManage;
  const showUserActions = canManage || canManageMembership;

  const { data, isLoading } = useQuery({
    queryKey: qk.users.all,
    queryFn: ({ signal }) => api.get('/users', { signal }).then(r => r.data),
  });

  const { data: companiesData } = useQuery({
    queryKey: qk.companies.list(),
    queryFn: ({ signal }) => api.get('/companies', { signal }).then(r => r.data),
  });

  const companies = companiesData || [];
  const companyTree: CompanyWithSystems[] = companies.map((c: { id: string; name: string; systems?: { id: string; name: string }[] }) => ({
    id: c.id,
    name: c.name,
    systems: (c.systems ?? []).map((s) => ({ id: s.id, name: s.name })),
  }));
  const portfolioCompanyIds = companyTree.map((c) => c.id);

  const { register, handleSubmit, reset, control, formState: { errors, isSubmitting } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
  });

  const inviteMutation = useMutation({
    mutationFn: (d: InviteForm & MembershipSelection) =>
      api.post('/invitations', {
        ...d,
        companyIds: d.companyIds?.length ? d.companyIds : undefined,
        systemIds: d.systemIds?.length ? d.systemIds : undefined,
      }),
    onSuccess: () => {
      toast.success('تم إرسال الدعوة بنجاح');
      setShowInvite(false);
      reset();
      setInviteMembership({ companyIds: [], systemIds: [] });
      queryClient.invalidateQueries({ queryKey: qk.users.all });
      queryClient.invalidateQueries({ queryKey: qk.invitations.all });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'فشل إرسال الدعوة'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/users/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: () => { toast.success('تم تحديث حالة المستخدم'); queryClient.invalidateQueries({ queryKey: qk.users.all }); },
    onError: () => toast.error('فشل تحديث الحالة'),
  });

  const editMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      firstName?: string;
      lastName?: string;
      role?: string;
      companyIds?: string[];
      systemIds?: string[];
    }) => {
      const { id, ...body } = payload;
      const { data } = await api.patch(`/users/${id}`, body);
      return {
        id,
        user: data as User,
        selection: {
          companyIds: body.companyIds ?? [],
          systemIds: body.systemIds ?? [],
        } satisfies MembershipSelection,
        profile: {
          firstName: body.firstName,
          lastName: body.lastName,
          role: body.role,
        },
      };
    },
    onSuccess: async (result) => {
      toast.success('تم تحديث بيانات المستخدم');
      setEditingUser(null);

      const applyTo = (u: User): User => {
        const merged: User = {
          ...u,
          ...result.user,
          ...(result.profile.firstName !== undefined && { firstName: result.profile.firstName }),
          ...(result.profile.lastName !== undefined && { lastName: result.profile.lastName }),
          ...(result.profile.role !== undefined && { role: result.profile.role }),
        };
        return applyMembershipToUser(
          merged,
          result.selection,
          companyTree,
          canManage ? null : portfolioCompanyIds,
        );
      };

      const current = queryClient.getQueryData<User[]>(qk.users.all);
      const base = Array.isArray(current)
        ? current.find((u) => u.id === result.id)
        : undefined;
      const updated = applyTo(base ?? ({ id: result.id, firstName: '', lastName: '', email: '', role: 'DEVELOPER', isActive: true, createdAt: '' } as User));

      // Local override — guaranteed table re-render for company/systems columns.
      setMembershipOverrides((prev) => ({
        ...prev,
        [result.id]: {
          company: updated.company,
          companies: updated.companies,
          systems: updated.systems,
          firstName: updated.firstName,
          lastName: updated.lastName,
          role: updated.role,
        },
      }));

      await queryClient.cancelQueries({ queryKey: qk.users.all });
      queryClient.setQueryData(qk.users.all, (list: User[] | undefined) => {
        if (!Array.isArray(list)) return list;
        return list.map((u) => (u.id === result.id ? applyTo(u) : u));
      });

      try {
        const fresh = await queryClient.fetchQuery({
          queryKey: qk.users.all,
          queryFn: ({ signal }) => api.get('/users', { signal }).then((r) => r.data as User[]),
        });
        if (Array.isArray(fresh)) {
          const patched = fresh.map((u) => (u.id === result.id ? applyTo(u) : u));
          queryClient.setQueryData(qk.users.all, patched);
          const row = patched.find((u) => u.id === result.id);
          if (row) {
            setMembershipOverrides((prev) => ({
              ...prev,
              [result.id]: {
                company: row.company,
                companies: row.companies,
                systems: row.systems,
                firstName: row.firstName,
                lastName: row.lastName,
                role: row.role,
              },
            }));
          }
        }
      } catch {
        // Keep the override + optimistic cache row.
      }

      void queryClient.invalidateQueries({ queryKey: qk.users.detail(result.id) });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'فشل التحديث'),
  });

  const openEdit = (user: User) => {
    const over = membershipOverrides[user.id];
    const row = over ? { ...user, ...over } : user;
    setEditingUser(row);
    setEditFirstName(row.firstName);
    setEditLastName(row.lastName);
    setEditRole(row.role);
    setEditMembership(membershipFromUser(row));
  };

  const canEditMembership = (user: User) =>
    canManage || (canManageMembership && MEMBERSHIP_ROLES.has(user.role));

  const users: User[] = (Array.isArray(data) ? data : []).map((u) => {
    const over = membershipOverrides[u.id];
    return over ? { ...u, ...over } : u;
  });
  // Directory filters must reflect who is listed (all DEV/QA for a PM), not the
  // caller's company portfolio — otherwise Company1-only chips hide everyone else.
  const companyOptions = companiesFromUsers(users);
  const unassignedCount = users.filter((u) => userCompanyIds(u).length === 0).length;
  const roleFilterOptions = canManage
    ? ROLES
    : ROLES.filter((r) => MEMBERSHIP_ROLES.has(r.value));
  const q = search.toLowerCase();
  const filtered = users.filter(u => {
    const matchesSearch = !q
      || `${u.firstName} ${u.lastName}`.toLowerCase().includes(q)
      || u.email.toLowerCase().includes(q);
    const matchesRole = !roleFilter || u.role === roleFilter;
    const ids = userCompanyIds(u);
    const matchesCompany = !companyFilter
      || (companyFilter === NO_COMPANY ? ids.length === 0 : ids.includes(companyFilter));
    return matchesSearch && matchesRole && matchesCompany;
  });
  const stats = { total: users.length, active: users.filter(u => u.isActive).length, inactive: users.filter(u => !u.isActive).length };

  return (
    <AppShell requires={['user:read', 'user:read-directory']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="brm-page-header">
          <div>
            <h1 className="text-xl font-bold sm:text-2xl" style={{ color: 'var(--foreground)' }}>المستخدمون</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
              {directoryOnly
                ? 'دليل المطورين و QA في كل الشركات — لتعديل العضوية والإسناد فقط'
                : 'إدارة حسابات المستخدمين وصلاحياتهم'}
            </p>
          </div>
          {canManage && (
            <button onClick={() => setShowInvite(true)}
              className="flex shrink-0 items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #4F46E5, #6C5CE7)', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}>
              <UserPlus className="w-4 h-4" /> دعوة مستخدم
            </button>
          )}
        </div>

        {/* Stats */}
        {isLoading ? (
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {Array.from({ length: 3 }).map((_, i) => <SkeletonStat key={i} />)}
          </div>
        ) : (
        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          {[
            { label: directoryOnly ? 'إجمالي المطورين و QA' : 'إجمالي المستخدمين', value: stats.total,    color: '#4F46E5', bg: 'rgba(79,70,229,0.08)' },
            { label: 'نشطون',              value: stats.active,   color: '#059669', bg: 'rgba(5,150,105,0.08)' },
            { label: 'غير نشطين',          value: stats.inactive, color: '#DC2626', bg: 'rgba(220,38,38,0.08)' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-3 sm:p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <p className="text-xs sm:text-sm" style={{ color: 'var(--muted-foreground)' }}>{s.label}</p>
              <p className="text-2xl sm:text-3xl font-bold font-brm mt-1" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>
        )}

        {/* Search + Table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="px-4 py-4 space-y-3 sm:px-6" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="relative w-full max-w-xs">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
              <input type="text" placeholder="بحث بالاسم أو البريد..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full rounded-xl pr-9 pl-3 py-2 text-sm outline-none"
                style={{ ...inputStyle }} onFocus={focusBorder} onBlur={blurBorder} />
            </div>
            <div>
              <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
                <CodeComment>الدور</CodeComment>
              </p>
              <div className="brm-pill-rail flex flex-wrap gap-1.5 p-1 rounded-xl w-fit max-w-full" style={{ background: 'var(--muted)' }} role="group" aria-label="تصفية حسب الدور">
                <FilterPill label="الكل" ariaLabel="كل الأدوار" active={roleFilter === ''} onClick={() => setRoleFilter('')} />
                {roleFilterOptions.map(r => (
                  <FilterPill
                    key={r.value}
                    label={ROLE_LABELS[r.value] || r.label}
                    active={roleFilter === r.value}
                    onClick={() => setRoleFilter(roleFilter === r.value ? '' : r.value)}
                  />
                ))}
              </div>
            </div>
            <div>
              <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: 'var(--muted-foreground)' }}>
                <CodeComment>الشركة</CodeComment>
              </p>
              <div className="brm-pill-rail flex flex-wrap gap-1.5 p-1 rounded-xl w-fit max-w-full" style={{ background: 'var(--muted)' }} role="group" aria-label="تصفية حسب الشركة">
                <FilterPill label="الكل" ariaLabel="كل الشركات" active={companyFilter === ''} onClick={() => setCompanyFilter('')} />
                {companyOptions.map((c: { id: string; name: string }) => (
                  <FilterPill
                    key={c.id}
                    label={c.name}
                    active={companyFilter === c.id}
                    onClick={() => setCompanyFilter(companyFilter === c.id ? '' : c.id)}
                  />
                ))}
                <FilterPill
                  label="بدون شركة"
                  ariaLabel={`بدون شركة (${unassignedCount})`}
                  active={companyFilter === NO_COMPANY}
                  onClick={() => setCompanyFilter(companyFilter === NO_COMPANY ? '' : NO_COMPANY)}
                  count={unassignedCount}
                />
              </div>
            </div>
          </div>

          {isLoading ? (
            <SkeletonTable rows={6} cols={showUserActions ? 5 : 4} />
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center" style={{ color: 'var(--muted-foreground)' }}>
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-brm text-sm">لا يوجد مستخدمون</p>
            </div>
          ) : (
            <div className="brm-table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  {['المستخدم', 'الدور', 'الشركة', 'الحالة', ...(showUserActions ? ['إجراء'] : [])].map(h => (
                    <th key={h} className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide sm:px-6" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, i) => {
                  const companyNames = (() => {
                    const names = new Set<string>();
                    if (user.company?.name) names.add(user.company.name);
                    for (const uc of user.companies ?? []) names.add(uc.company.name);
                    for (const us of user.systems ?? []) {
                      if (us.system?.company?.name) names.add(us.system.company.name);
                    }
                    return [...names].join('، ');
                  })();
                  return (
                  <tr key={user.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, cursor: 'pointer' }}
                    onClick={() => router.push(`/users/${user.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="px-4 py-3.5 sm:px-6 sm:py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 text-indigo-300"
                          style={{ background: 'rgba(79,70,229,0.18)' }}>
                          {user.firstName[0]}{user.lastName[0]}
                        </div>
                        <div>
                          <p className="font-semibold" style={{ color: 'var(--foreground)' }}>{user.firstName} {user.lastName}</p>
                          <p className="font-brm text-xs" style={{ color: 'var(--muted-foreground)' }} dir="ltr">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap sm:px-6 sm:py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap"
                        style={{ background: `${ROLE_DOT[user.role]}18`, color: ROLE_DOT[user.role] }}>
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: ROLE_DOT[user.role] }} />
                        {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-sm max-w-0 w-full sm:px-6 sm:py-4">
                      <span
                        className="block truncate"
                        title={companyNames || undefined}
                        style={{ color: 'var(--muted-foreground)' }}
                      >
                        {companyNames || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap sm:px-6 sm:py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap"
                        style={{
                          background: user.isActive ? 'rgba(5,150,105,0.1)' : 'rgba(148,163,184,0.1)',
                          color: user.isActive ? '#059669' : 'var(--muted-foreground)',
                        }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: user.isActive ? '#059669' : '#94A3B8' }} />
                        {user.isActive ? 'نشط' : 'غير نشط'}
                      </span>
                    </td>
                    {showUserActions && (
                      <td className="px-4 py-3.5 whitespace-nowrap sm:px-6 sm:py-4">
                        <div className="flex gap-2">
                          {canEditMembership(user) && (
                            <button onClick={e => { e.stopPropagation(); openEdit(user); }}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap"
                              style={{ border: '1px solid rgba(79,70,229,0.3)', color: '#4F46E5' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79,70,229,0.08)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              {canManage ? 'تعديل' : 'المشاريع'}
                            </button>
                          )}
                          {canManage && (
                            <button onClick={e => { e.stopPropagation(); toggleMutation.mutate({ id: user.id, active: !user.isActive }); }}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all whitespace-nowrap"
                              style={{ border: user.isActive ? '1px solid rgba(220,38,38,0.3)' : '1px solid rgba(5,150,105,0.3)', color: user.isActive ? '#DC2626' : '#059669' }}
                              onMouseEnter={e => (e.currentTarget.style.background = user.isActive ? 'rgba(220,38,38,0.06)' : 'rgba(5,150,105,0.06)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              {user.isActive ? 'تعطيل' : 'تفعيل'}
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {showInvite && (
        <Modal title="دعوة مستخدم جديد" sub="سيتلقى المستخدم بريداً لإعداد كلمة المرور" icon={Shield} onClose={() => { setShowInvite(false); reset(); }}>
          <form onSubmit={handleSubmit(d => inviteMutation.mutate({ ...d, ...inviteMembership }))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>الاسم الأول</label>
                <input {...register('firstName')} placeholder="محمد" className={inputCls} style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
                {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>اسم العائلة</label>
                <input {...register('lastName')} placeholder="العلي" className={inputCls} style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
                {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>البريد الإلكتروني</label>
              <input {...register('email')} type="email" dir="ltr" placeholder="user@company.com" className={inputCls} style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>الدور</label>
              <Controller
                name="role"
                control={control}
                defaultValue=""
                render={({ field }) => (
                  <RoleSelect value={field.value ?? ''} onChange={field.onChange} includePlaceholder />
                )}
              />
              {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>}
            </div>
            {companyTree.length > 0 && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>الشركات والمشاريع (اختياري)</label>
                <CompanyProjectTree
                  companies={companyTree}
                  value={inviteMembership}
                  onChange={setInviteMembership}
                  visibleCompanyIds={canManage ? null : portfolioCompanyIds}
                />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button type="submit" disabled={inviteMutation.isPending} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #4F46E5, #6C5CE7)' }}>
                {inviteMutation.isPending ? 'جارٍ الإرسال...' : 'إرسال الدعوة'}
              </button>
              <button type="button" onClick={() => { setShowInvite(false); reset(); setInviteMembership({ companyIds: [], systemIds: [] }); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)', background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                إلغاء
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editingUser && (
        <Modal
          title={canManage ? 'تعديل بيانات المستخدم' : 'تعديل مشاريع المستخدم'}
          onClose={() => setEditingUser(null)}
        >
          <div className="space-y-4">
            {canManage && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="edit-first-name" className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>الاسم الأول</label>
                    <input id="edit-first-name" value={editFirstName} onChange={e => setEditFirstName(e.target.value)} className={inputCls} style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
                  </div>
                  <div>
                    <label htmlFor="edit-last-name" className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>اسم العائلة</label>
                    <input id="edit-last-name" value={editLastName} onChange={e => setEditLastName(e.target.value)} className={inputCls} style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>الدور</label>
                  <RoleSelect value={editRole} onChange={setEditRole} />
                </div>
              </>
            )}
            {companyTree.length > 0 && (
              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>الشركات والمشاريع</label>
                <CompanyProjectTree
                  companies={companyTree}
                  value={editMembership}
                  onChange={setEditMembership}
                  visibleCompanyIds={canManage ? null : portfolioCompanyIds}
                />
              </div>
            )}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  if (canManage) {
                    editMutation.mutate({
                      id: editingUser.id,
                      firstName: editFirstName,
                      lastName: editLastName,
                      role: editRole,
                      companyIds: editMembership.companyIds,
                      systemIds: editMembership.systemIds,
                    });
                  } else {
                    editMutation.mutate({
                      id: editingUser.id,
                      companyIds: editMembership.companyIds,
                      systemIds: editMembership.systemIds,
                    });
                  }
                }}
                disabled={
                  editMutation.isPending ||
                  (canManage && (!editFirstName.trim() || !editLastName.trim() || !editRole))
                }
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #4F46E5, #6C5CE7)' }}
              >
                {editMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
              </button>
              <button onClick={() => setEditingUser(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ border: '1px solid var(--border)', color: 'var(--muted-foreground)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                إلغاء
              </button>
            </div>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}
