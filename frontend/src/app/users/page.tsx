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
import { UserPlus, X, Search, Shield, Eye, EyeOff, Users } from 'lucide-react';

const createSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  firstName: z.string().min(2, 'الاسم الأول مطلوب'),
  lastName: z.string().min(2, 'اسم العائلة مطلوب'),
  role: z.string().min(1, 'الدور مطلوب'),
  password: z.string().min(8, 'كلمة المرور 8 أحرف على الأقل'),
  companyId: z.string().optional(),
});

type CreateForm = z.infer<typeof createSchema>;

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  company?: { name: string };
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
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const canManage = hasRole('SENIOR_MANAGEMENT', 'PROGRAMMING_HEAD');

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const { data: companiesData } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => api.get('/companies').then(r => r.data),
    enabled: canManage,
  });

  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<CreateForm>({
    resolver: zodResolver(createSchema),
  });

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => api.post('/users', data),
    onSuccess: () => {
      toast.success('تم إنشاء المستخدم بنجاح');
      setShowCreate(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'فشل إنشاء المستخدم'),
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

  const users: User[] = data || [];
  const filtered = users.filter(u =>
    `${u.firstName} ${u.lastName}`.includes(search) || u.email.includes(search)
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
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
              style={{ background: "linear-gradient(135deg, #4338CA, #6366F1)", boxShadow: "0 4px 12px rgba(67,56,202,0.3)" }}
            >
              <UserPlus className="w-4 h-4" />
              إضافة مستخدم
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

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.5)" }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" style={{ boxShadow: "0 25px 50px rgba(0,0,0,0.2)" }}>
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                    <Shield className="w-5 h-5 text-indigo-600" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-900">إضافة مستخدم جديد</h2>
                </div>
                <button onClick={() => { setShowCreate(false); reset(); }} className="text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit(d => createMutation.mutate(d))} className="p-6 space-y-4">
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

                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">كلمة المرور</label>
                  <div className="relative">
                    <input
                      {...register('password')}
                      type={showPassword ? 'text' : 'password'}
                      placeholder="8 أحرف على الأقل"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password.message}</p>}
                </div>

                {companies.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">الشركة (اختياري)</label>
                    <select {...register('companyId')} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                      <option value="">بدون شركة</option>
                      {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60 transition-all"
                    style={{ background: "linear-gradient(135deg, #4338CA, #6366F1)" }}
                  >
                    {isSubmitting ? 'جارٍ الإنشاء...' : 'إنشاء المستخدم'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowCreate(false); reset(); }}
                    className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
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
                    <td className="px-6 py-4 text-slate-500 text-sm">{user.company?.name || '—'}</td>
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
