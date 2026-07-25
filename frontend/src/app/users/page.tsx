'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { AppShell } from '@/components/layout/AppShell';
import { useAuthStore } from '@/store/auth';
import { ROLE_LABELS } from '@/lib/constants';
import { toast } from 'sonner';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { UserPlus, X, Search, Shield, Users } from 'lucide-react';

const inviteSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  firstName: z.string().min(2, 'الاسم الأول مطلوب'),
  lastName: z.string().min(2, 'اسم العائلة مطلوب'),
  role: z.string().min(1, 'الدور مطلوب'),
  companyIds: z.array(z.string()).optional(),
});
type InviteForm = z.infer<typeof inviteSchema>;

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  company?: { name: string };
  companies?: { company: { id: string; name: string } }[];
  createdAt: string;
}

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
const inputStyle = { background: 'var(--muted)', border: '1px solid var(--border)', color: 'var(--foreground)' };
const focusBorder = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.target.style.borderColor = '#4F46E5');
const blurBorder  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => (e.target.style.borderColor = 'var(--border)');

function Modal({ title, sub, icon: Icon, onClose, children }: {
  title: string; sub?: string; icon?: any; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div className="palette-modal w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)', boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid var(--border)' }}>
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
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const router = useRouter();
  const { hasRole } = useAuthStore();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState('');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [editFirstName, setEditFirstName] = useState('');
  const [editLastName, setEditLastName] = useState('');
  const [editCompanyIds, setEditCompanyIds] = useState<string[]>([]);

  const canManage = hasRole('SENIOR_MANAGEMENT', 'PROGRAMMING_HEAD', 'PROJECT_MANAGER');

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => api.get('/companies').then(r => r.data),
    enabled: canManage,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
  });

  const inviteMutation = useMutation({
    mutationFn: (d: InviteForm) => api.post('/invitations', { ...d, companyIds: d.companyIds?.length ? d.companyIds : undefined }),
    onSuccess: () => { toast.success('تم إرسال الدعوة بنجاح'); setShowInvite(false); reset(); queryClient.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'فشل إرسال الدعوة'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => api.patch(`/users/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: () => { toast.success('تم تحديث حالة المستخدم'); queryClient.invalidateQueries({ queryKey: ['users'] }); },
    onError: () => toast.error('فشل تحديث الحالة'),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, firstName, lastName, companyIds }: { id: string; firstName: string; lastName: string; companyIds: string[] }) =>
      api.patch(`/users/${id}`, { firstName, lastName, companyIds }),
    onSuccess: () => { toast.success('تم تحديث بيانات المستخدم'); setEditingUser(null); queryClient.invalidateQueries({ queryKey: ['users'] }); },
    onError: (e: any) => toast.error(e.response?.data?.message || 'فشل التحديث'),
  });

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditFirstName(user.firstName);
    setEditLastName(user.lastName);
    setEditCompanyIds(user.companies?.map(uc => uc.company.id) || []);
  };

  const users: User[] = data || [];
  const filtered = users.filter(u =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );
  const companies = companiesData || [];
  const stats = { total: users.length, active: users.filter(u => u.isActive).length, inactive: users.filter(u => !u.isActive).length };

  const CompanyChecklist = ({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) => (
    <div className="rounded-xl p-3 space-y-1.5 max-h-36 overflow-y-auto" style={{ border: '1px solid var(--border)', background: 'var(--muted)' }}>
      {companies.map((c: any) => (
        <label key={c.id} className="flex items-center gap-2 cursor-pointer rounded-lg px-2 py-1 transition-colors"
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--border)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
          <input type="checkbox" checked={ids.includes(c.id)}
            onChange={e => onChange(e.target.checked ? [...ids, c.id] : ids.filter(x => x !== c.id))}
            className="w-4 h-4 rounded accent-indigo-600" />
          <span className="text-sm" style={{ color: 'var(--foreground)' }}>{c.name}</span>
        </label>
      ))}
    </div>
  );

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>المستخدمون</h1>
            <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>إدارة حسابات المستخدمين وصلاحياتهم</p>
          </div>
          {canManage && (
            <button onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: 'linear-gradient(135deg, #4F46E5, #6C5CE7)', boxShadow: '0 4px 12px rgba(79,70,229,0.3)' }}>
              <UserPlus className="w-4 h-4" /> دعوة مستخدم
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'إجمالي المستخدمين', value: stats.total,    color: '#4F46E5', bg: 'rgba(79,70,229,0.08)' },
            { label: 'نشطون',              value: stats.active,   color: '#059669', bg: 'rgba(5,150,105,0.08)' },
            { label: 'غير نشطين',          value: stats.inactive, color: '#DC2626', bg: 'rgba(220,38,38,0.08)' },
          ].map(s => (
            <div key={s.label} className="rounded-2xl p-5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
              <p className="text-sm" style={{ color: 'var(--muted-foreground)' }}>{s.label}</p>
              <p className="text-3xl font-bold font-brm mt-1" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Invite Modal */}
        {showInvite && (
          <Modal title="دعوة مستخدم جديد" sub="سيتلقى المستخدم بريداً لإعداد كلمة المرور" icon={Shield} onClose={() => { setShowInvite(false); reset(); }}>
            <form onSubmit={handleSubmit(d => inviteMutation.mutate(d))} className="space-y-4">
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
                <select {...register('role')} className={inputCls} style={inputStyle} onFocus={focusBorder} onBlur={blurBorder}>
                  <option value="">اختر الدور...</option>
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>}
              </div>
              {companies.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>الشركات (اختياري)</label>
                  <CompanyChecklist ids={[]} onChange={() => {}} />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={isSubmitting} className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #4F46E5, #6C5CE7)' }}>
                  {isSubmitting ? 'جارٍ الإرسال...' : 'إرسال الدعوة'}
                </button>
                <button type="button" onClick={() => { setShowInvite(false); reset(); }}
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

        {/* Edit Modal */}
        {editingUser && (
          <Modal title="تعديل بيانات المستخدم" onClose={() => setEditingUser(null)}>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>الاسم الأول</label>
                  <input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} className={inputCls} style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>اسم العائلة</label>
                  <input value={editLastName} onChange={e => setEditLastName(e.target.value)} className={inputCls} style={inputStyle} onFocus={focusBorder} onBlur={blurBorder} />
                </div>
              </div>
              {companies.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--muted-foreground)' }}>الشركات</label>
                  <CompanyChecklist ids={editCompanyIds} onChange={setEditCompanyIds} />
                </div>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => editMutation.mutate({ id: editingUser.id, firstName: editFirstName, lastName: editLastName, companyIds: editCompanyIds })}
                  disabled={!editFirstName.trim() || !editLastName.trim() || editMutation.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #4F46E5, #6C5CE7)' }}>
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

        {/* Search + Table */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--border)' }}>
            <div className="relative max-w-xs">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--muted-foreground)' }} />
              <input type="text" placeholder="بحث بالاسم أو البريد..." value={search} onChange={e => setSearch(e.target.value)}
                className="w-full rounded-xl pr-9 pl-3 py-2 text-sm outline-none"
                style={{ ...inputStyle }} onFocus={focusBorder} onBlur={blurBorder} />
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 text-center font-brm text-sm" style={{ color: 'var(--muted-foreground)' }}>loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center" style={{ color: 'var(--muted-foreground)' }}>
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-brm text-sm">$ no users found_</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  {['المستخدم', 'الدور', 'الشركة', 'الحالة', ...(canManage ? ['إجراء'] : [])].map(h => (
                    <th key={h} className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((user, i) => (
                  <tr key={user.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined, cursor: 'pointer' }}
                    onClick={() => router.push(`/users/${user.id}`)}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <td className="px-6 py-4">
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
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                        style={{ background: `${ROLE_DOT[user.role]}18`, color: ROLE_DOT[user.role] }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: ROLE_DOT[user.role] }} />
                        {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm" style={{ color: 'var(--muted-foreground)' }}>
                      {user.companies?.length
                        ? user.companies.map((uc: any) => uc.company.name).join('، ')
                        : user.company?.name || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold"
                        style={{
                          background: user.isActive ? 'rgba(5,150,105,0.1)' : 'rgba(148,163,184,0.1)',
                          color: user.isActive ? '#059669' : 'var(--muted-foreground)',
                        }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: user.isActive ? '#059669' : '#94A3B8' }} />
                        {user.isActive ? 'نشط' : 'غير نشط'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button onClick={() => openEdit(user)}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                            style={{ border: '1px solid rgba(79,70,229,0.3)', color: '#4F46E5' }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79,70,229,0.08)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            تعديل
                          </button>
                          <button onClick={() => toggleMutation.mutate({ id: user.id, active: !user.isActive })}
                            className="text-xs px-3 py-1.5 rounded-lg font-semibold transition-all"
                            style={{ border: user.isActive ? '1px solid rgba(220,38,38,0.3)' : '1px solid rgba(5,150,105,0.3)', color: user.isActive ? '#DC2626' : '#059669' }}
                            onMouseEnter={e => (e.currentTarget.style.background = user.isActive ? 'rgba(220,38,38,0.06)' : 'rgba(5,150,105,0.06)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                            {user.isActive ? 'تعطيل' : 'تفعيل'}
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
