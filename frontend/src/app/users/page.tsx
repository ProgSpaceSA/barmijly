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

const inviteSchema = z.object({
  email: z.string().email('بريد إلكتروني غير صالح'),
  name: z.string().min(2, 'الاسم مطلوب'),
  role: z.string().min(1, 'الدور مطلوب'),
  companyId: z.string().optional(),
});

type InviteForm = z.infer<typeof inviteSchema>;

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  company?: { name: string };
  createdAt: string;
}

const ROLES = [
  { value: 'SENIOR_MANAGEMENT', label: 'الإدارة العليا' },
  { value: 'PROGRAMMING_HEAD', label: 'رئيس البرمجة' },
  { value: 'PROJECT_MANAGER', label: 'مدير مشروع' },
  { value: 'DEVELOPER', label: 'مطور' },
  { value: 'QA', label: 'ضمان الجودة' },
  { value: 'SYSTEM_OWNER', label: 'مالك النظام' },
  { value: 'TICKET_REQUESTER', label: 'مقدم طلب' },
];

export default function UsersPage() {
  const { hasRole } = useAuthStore();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [search, setSearch] = useState('');

  const canManage = hasRole('SENIOR_MANAGEMENT', 'PROGRAMMING_HEAD');

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then(r => r.data),
  });

  const { data: companies } = useQuery({
    queryKey: ['companies-list'],
    queryFn: () => api.get('/companies').then(r => r.data),
    enabled: canManage,
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InviteForm>({
    resolver: zodResolver(inviteSchema),
  });

  const inviteMutation = useMutation({
    mutationFn: (data: InviteForm) => api.post('/users/invite', data),
    onSuccess: () => {
      toast.success('تم إرسال الدعوة بنجاح');
      setShowInvite(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast.error('فشل إرسال الدعوة'),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api.patch(`/users/${id}`, { isActive: active }),
    onSuccess: () => {
      toast.success('تم تحديث حالة المستخدم');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: () => toast.error('فشل تحديث الحالة'),
  });

  const users: User[] = data?.data || data || [];
  const filtered = users.filter(u =>
    u.name.includes(search) || u.email.includes(search)
  );

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">إدارة المستخدمين</h1>
          {canManage && (
            <button
              onClick={() => setShowInvite(true)}
              className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm font-medium"
            >
              + دعوة مستخدم
            </button>
          )}
        </div>

        {/* Search */}
        <div>
          <input
            type="text"
            placeholder="بحث بالاسم أو البريد..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full max-w-sm border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Invite Modal */}
        {showInvite && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
              <h2 className="text-lg font-bold mb-4">دعوة مستخدم جديد</h2>
              <form onSubmit={handleSubmit(d => inviteMutation.mutate(d))} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الاسم</label>
                  <input {...register('name')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">البريد الإلكتروني</label>
                  <input {...register('email')} type="email" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" dir="ltr" />
                  {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">الدور</label>
                  <select {...register('role')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option value="">اختر الدور</option>
                    {ROLES.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  {errors.role && <p className="text-red-500 text-xs mt-1">{errors.role.message}</p>}
                </div>
                {companies && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">الشركة (اختياري)</label>
                    <select {...register('companyId')} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                      <option value="">بدون شركة</option>
                      {(companies?.data || companies || []).map((c: any) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={inviteMutation.isPending}
                    className="flex-1 bg-indigo-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {inviteMutation.isPending ? 'جارٍ الإرسال...' : 'إرسال الدعوة'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setShowInvite(false); reset(); }}
                    className="flex-1 border border-gray-300 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Users Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">جارٍ التحميل...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">لا يوجد مستخدمون</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-right font-medium text-gray-600">المستخدم</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-600">الدور</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-600">الشركة</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-600">الحالة</th>
                  {canManage && <th className="px-6 py-3 text-right font-medium text-gray-600">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(user => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{user.name}</div>
                      <div className="text-gray-500 text-xs" dir="ltr">{user.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-medium">
                        {ROLE_LABELS[user.role as keyof typeof ROLE_LABELS] || user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">
                      {user.company?.name || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        user.isActive
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {user.isActive ? 'نشط' : 'غير نشط'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <button
                          onClick={() => toggleActiveMutation.mutate({ id: user.id, active: !user.isActive })}
                          className={`text-xs px-3 py-1 rounded border font-medium transition-colors ${
                            user.isActive
                              ? 'border-red-300 text-red-600 hover:bg-red-50'
                              : 'border-green-300 text-green-600 hover:bg-green-50'
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

        <p className="text-sm text-gray-500">
          إجمالي المستخدمين: <span className="font-medium">{users.length}</span>
        </p>
      </div>
    </AppShell>
  );
}
