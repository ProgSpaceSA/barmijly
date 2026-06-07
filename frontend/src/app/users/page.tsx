'use client';

import { useState } from 'react';
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
  { value: 'SENIOR_MANAGEMENT', label: 'الإدارة العليا', color: 'bg-purple-100 text-purple-700' },
  { value: 'PROGRAMMING_HEAD', label: 'رئيس البرمجة', color: 'bg-indigo-100 text-indigo-700' },
  { value: 'PROJECT_MANAGER', label: 'مدير مشروع', color: 'bg-blue-100 text-blue-700' },
  { value: 'DEVELOPER', label: 'مطور', color: 'bg-cyan-100 text-cyan-700' },
  { value: 'QA', label: 'ضمان الجودة', color: 'bg-teal-100 text-teal-700' },
  { value: 'SYSTEM_OWNER', label: 'مالك النظام', color: 'bg-amber-100 text-amber-700' },
  { value: 'TICKET_REQUESTER', label: 'مقدم طلب', color: 'bg-slate-100 text-slate-600' },
];

function getRoleStyle(role: string) {
  return ROLES.find(r => r.value === role)?.color ?? 'bg-gray-100 text-gray-600';
}

export default function UsersPage() {
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
    mutationFn: (data: InviteForm) => api.post('/invitations', {
      ...data,
      companyIds: data.companyIds?.length ? data.companyIds : undefined,
    }),
    onSuccess: () => {
      toast.success('تم إرسال الدعوة بنجاح');
      setShowInvite(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'فشل إرسال الدعوة'),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/users/${id}/${active ? 'activate' : 'deactivate'}`),
    onSuccess: () => {
      toast.success('تم تحديث حالة المستخدم');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast.error('فشل تحديث الحالة'),
  });

  const editMutation = useMutation({
    mutationFn: ({ id, firstName, lastName, companyIds }: { id: string; firstName: string; lastName: string; companyIds: string[] }) =>
      api.patch(`/users/${id}`, { firstName, lastName, companyIds }),
    onSuccess: () => {
      toast.success('تم تحديث بيانات المستخدم');
      setEditingUser(null);
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'فشل التحديث'),
  });

  const openEdit = (user: User) => {
    setEditingUser(user);
    setEditFirstName(user.firstName);
    setEditLastName(user.lastName);
    setEditCompanyIds(user.companies?.map(uc => uc.company.id) || (user.company ? [] : []));
  };

  const users: User[] = data || [];
  const filtered = users.filter(u =>
    `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );
  const companies = companiesData || [];

  const stats = {
    total: users.length,
    active: users.filter(u => u.isActive).length,
    inactive: users.filter(u => !u.isActive).length,
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">المستخدمون</h1>
            <p className="text-sm text-slate-500 mt-0.5">إدارة حسابات المستخدمين وصلاحياتهم</p>
          </div>
          {canManage && (
            <button
              onClick={() => setShowInvite(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: "linear-gradient(135deg, #4338CA, #6366F1)", boxShadow: "0 4px 12px rgba(67,56,202,0.3)" }}
            >
              <UserPlus className="w-4 h-4" />
              دعوة مستخدم
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'إجمالي المستخدمين', value: stats.total, color: '#4338CA', bg: '#EEF2FF' },
            { label: 'نشطون', value: stats.active, color: '#059669', bg: '#ECFDF5' },
            { label: 'غير نشطين', value: stats.inactive, color: '#DC2626', bg: '#FEF2F2' },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-2xl p-5 border border-slate-100" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
              <p className="text-sm text-slate-500">{s.label}</p>
              <p className="text-3xl font-bold mt-1" style={{ color: s.color }}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* Invite Modal */}
        {showInvite && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">دعوة مستخدم جديد</h2>
                    <p className="text-xs text-slate-400 mt-0.5">سيتلقى المستخدم بريداً لإعداد كلمة المرور</p>
                  </div>
                </div>
                <button onClick={() => { setShowInvite(false); reset(); }} className="text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit(d => inviteMutation.mutate(d))} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">الاسم الأول</label>
                    <input {...register('firstName')} placeholder="محمد" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                    {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName.message}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم العائلة</label>
                    <input {...register('lastName')} placeholder="العلي" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                    {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName.message}</p>}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">البريد الإلكتروني</label>
                  <input {...register('email')} type="email" dir="ltr" placeholder="user@company.com" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">الدور</label>
                  <select {...register('role')} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                    <option value="">اختر الدور...</option>
                    {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>}
                </div>

                {companies.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">الشركات (اختياري)</label>
                    <div className="border border-slate-200 rounded-xl p-3 space-y-2 max-h-40 overflow-y-auto">
                      {companies.map((c: any) => (
                        <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1">
                          <input
                            type="checkbox"
                            value={c.id}
                            {...register('companyIds')}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-slate-700">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all"
                    style={{ background: "linear-gradient(135deg, #4338CA, #6366F1)" }}
                  >
                    {isSubmitting ? 'جارٍ الإرسال...' : 'إرسال الدعوة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowInvite(false); reset(); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {editingUser && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <h2 className="text-lg font-bold text-slate-900">تعديل بيانات المستخدم</h2>
                <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">الاسم الأول</label>
                    <input value={editFirstName} onChange={e => setEditFirstName(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">اسم العائلة</label>
                    <input value={editLastName} onChange={e => setEditLastName(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                  </div>
                </div>

                {companies.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">الشركات</label>
                    <div className="border border-slate-200 rounded-xl p-3 space-y-2 max-h-40 overflow-y-auto">
                      {companies.map((c: any) => (
                        <label key={c.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 rounded-lg px-2 py-1">
                          <input
                            type="checkbox"
                            checked={editCompanyIds.includes(c.id)}
                            onChange={e => setEditCompanyIds(e.target.checked ? [...editCompanyIds, c.id] : editCompanyIds.filter(id => id !== c.id))}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-sm text-slate-700">{c.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => editMutation.mutate({ id: editingUser.id, firstName: editFirstName, lastName: editLastName, companyIds: editCompanyIds })}
                    disabled={!editFirstName.trim() || !editLastName.trim() || editMutation.isPending}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all"
                    style={{ background: "linear-gradient(135deg, #4338CA, #6366F1)" }}
                  >
                    {editMutation.isPending ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
                  </button>
                  <button onClick={() => setEditingUser(null)} className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50">
                    إلغاء
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Search + Table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="relative max-w-xs">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="بحث بالاسم أو البريد..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full border border-slate-200 rounded-xl pr-9 pl-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="py-16 text-center text-slate-400">جارٍ التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-slate-400">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>لا يوجد مستخدمون</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">المستخدم</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">الدور</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">الشركة</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">الحالة</th>
                  {canManage && <th className="px-6 py-3 text-right text-xs font-semibold text-slate-500 uppercase tracking-wide">إجراء</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map(user => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold text-sm shrink-0">
                          {user.firstName[0]}{user.lastName[0]}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{user.firstName} {user.lastName}</p>
                          <p className="text-slate-400 text-xs" dir="ltr">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${getRoleStyle(user.role)}`}>
                        {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-slate-500 text-sm">
                      {user.companies?.length
                        ? user.companies.map((uc: any) => uc.company.name).join('، ')
                        : user.company?.name || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                        user.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {user.isActive ? 'نشط' : 'غير نشط'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEdit(user)}
                            className="text-xs px-3 py-1.5 rounded-lg border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-semibold transition-all"
                          >
                            تعديل
                          </button>
                          <button
                            onClick={() => toggleMutation.mutate({ id: user.id, active: !user.isActive })}
                            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                              user.isActive
                                ? 'border-red-200 text-red-600 hover:bg-red-50'
                                : 'border-emerald-200 text-emerald-600 hover:bg-emerald-50'
                            }`}
                          >
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
