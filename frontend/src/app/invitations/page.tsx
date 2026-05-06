'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { AppShell } from '@/components/layout/AppShell';
import { useAuthStore } from '@/store/auth';
import { ROLE_LABELS } from '@/lib/constants';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

interface Invitation {
  id: string;
  email: string;
  name: string;
  role: string;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: string;
  createdAt: string;
  invitedBy?: { name: string };
  company?: { name: string };
}

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'معلقة',
  ACCEPTED: 'مقبولة',
  EXPIRED: 'منتهية',
  REVOKED: 'ملغاة',
};

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-50 text-yellow-700',
  ACCEPTED: 'bg-green-50 text-green-700',
  EXPIRED: 'bg-gray-100 text-gray-500',
  REVOKED: 'bg-red-50 text-red-600',
};

export default function InvitationsPage() {
  const { hasRole } = useAuthStore();
  const queryClient = useQueryClient();

  const canManage = hasRole('SENIOR_MANAGEMENT', 'PROGRAMMING_HEAD');

  const { data, isLoading } = useQuery({
    queryKey: ['invitations'],
    queryFn: () => api.get('/users/invitations').then(r => r.data),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/users/invitations/${id}/resend`),
    onSuccess: () => {
      toast.success('تم إعادة إرسال الدعوة');
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: () => toast.error('فشل إعادة الإرسال'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/invitations/${id}`),
    onSuccess: () => {
      toast.success('تم إلغاء الدعوة');
      queryClient.invalidateQueries({ queryKey: ['invitations'] });
    },
    onError: () => toast.error('فشل إلغاء الدعوة'),
  });

  const invitations: Invitation[] = data?.data || data || [];

  const grouped = {
    PENDING: invitations.filter(i => i.status === 'PENDING'),
    ACCEPTED: invitations.filter(i => i.status === 'ACCEPTED'),
    EXPIRED: invitations.filter(i => i.status === 'EXPIRED'),
    REVOKED: invitations.filter(i => i.status === 'REVOKED'),
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">الدعوات</h1>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          {Object.entries(grouped).map(([status, items]) => (
            <div key={status} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{items.length}</div>
              <div className={`text-xs font-medium mt-1 px-2 py-0.5 rounded inline-block ${STATUS_COLORS[status]}`}>
                {STATUS_LABELS[status]}
              </div>
            </div>
          ))}
        </div>

        {/* Invitations Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">جارٍ التحميل...</div>
          ) : invitations.length === 0 ? (
            <div className="p-8 text-center text-gray-400">لا توجد دعوات</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-right font-medium text-gray-600">المدعو</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-600">الدور</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-600">الشركة</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-600">الحالة</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-600">تنتهي</th>
                  <th className="px-6 py-3 text-right font-medium text-gray-600">أُرسل بواسطة</th>
                  {canManage && <th className="px-6 py-3 text-right font-medium text-gray-600">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invitations.map(inv => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="font-medium text-gray-900">{inv.name}</div>
                      <div className="text-gray-500 text-xs" dir="ltr">{inv.email}</div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-medium">
                        {ROLE_LABELS[inv.role as keyof typeof ROLE_LABELS] || inv.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{inv.company?.name || '—'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[inv.status]}`}>
                        {STATUS_LABELS[inv.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {format(new Date(inv.expiresAt), 'dd MMM yyyy', { locale: ar })}
                    </td>
                    <td className="px-6 py-4 text-gray-600 text-xs">
                      {inv.invitedBy?.name || '—'}
                    </td>
                    {canManage && (
                      <td className="px-6 py-4">
                        <div className="flex gap-2">
                          {inv.status === 'PENDING' && (
                            <>
                              <button
                                onClick={() => resendMutation.mutate(inv.id)}
                                disabled={resendMutation.isPending}
                                className="text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                              >
                                إعادة إرسال
                              </button>
                              <button
                                onClick={() => {
                                  if (confirm('هل تريد إلغاء هذه الدعوة؟')) {
                                    revokeMutation.mutate(inv.id);
                                  }
                                }}
                                disabled={revokeMutation.isPending}
                                className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                إلغاء
                              </button>
                            </>
                          )}
                          {inv.status === 'EXPIRED' && (
                            <button
                              onClick={() => resendMutation.mutate(inv.id)}
                              disabled={resendMutation.isPending}
                              className="text-xs px-2 py-1 rounded border border-indigo-300 text-indigo-600 hover:bg-indigo-50 disabled:opacity-50"
                            >
                              إعادة إرسال
                            </button>
                          )}
                          {(inv.status === 'ACCEPTED' || inv.status === 'REVOKED') && (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
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
