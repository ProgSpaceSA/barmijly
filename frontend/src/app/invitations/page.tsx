'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { AppShell } from '@/components/layout/AppShell';
import { useAuthStore } from '@/store/auth';
import { ROLE_LABELS } from '@/lib/constants';
import { toast } from 'sonner';
import { RelativeTime } from '@/components/shared/RelativeTime';
import { Mail } from 'lucide-react';

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

const STATUS_CFG: Record<string, { label: string; dot: string; bg: string; color: string }> = {
  PENDING:  { label: 'معلقة',  dot: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  color: '#B45309' },
  ACCEPTED: { label: 'مقبولة', dot: '#22C55E', bg: 'rgba(34,197,94,0.1)',   color: '#15803D' },
  EXPIRED:  { label: 'منتهية', dot: '#94A3B8', bg: 'rgba(148,163,184,0.1)', color: '#64748B' },
  REVOKED:  { label: 'ملغاة',  dot: '#EF4444', bg: 'rgba(239,68,68,0.1)',   color: '#B91C1C' },
};

export default function InvitationsPage() {
  const { hasRole } = useAuthStore();
  const queryClient = useQueryClient();
  const canManage = hasRole('SENIOR_MANAGEMENT', 'PROGRAMMING_HEAD');

  const { data, isLoading } = useQuery({
    queryKey: ['invitations'],
    queryFn: () => api.get('/invitations').then(r => r.data),
  });

  const resendMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/invitations/${id}/resend`),
    onSuccess: () => { toast.success('تم إعادة إرسال الدعوة'); queryClient.invalidateQueries({ queryKey: ['invitations'] }); },
    onError: () => toast.error('فشل إعادة الإرسال'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/invitations/${id}/revoke`),
    onSuccess: () => { toast.success('تم إلغاء الدعوة'); queryClient.invalidateQueries({ queryKey: ['invitations'] }); },
    onError: () => toast.error('فشل إلغاء الدعوة'),
  });

  const invitations: Invitation[] = data?.data || data || [];
  const grouped = {
    PENDING:  invitations.filter(i => i.status === 'PENDING'),
    ACCEPTED: invitations.filter(i => i.status === 'ACCEPTED'),
    EXPIRED:  invitations.filter(i => i.status === 'EXPIRED'),
    REVOKED:  invitations.filter(i => i.status === 'REVOKED'),
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--foreground)' }}>الدعوات</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--muted-foreground)' }}>{invitations.length} دعوة إجمالاً</p>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(grouped).map(([status, items]) => {
            const cfg = STATUS_CFG[status];
            return (
              <div key={status} className="rounded-xl p-4 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="font-brm text-2xl font-bold mb-1" style={{ color: 'var(--foreground)' }}>{items.length}</div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: cfg.bg, color: cfg.color }}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
                  {cfg.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Table */}
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          {isLoading ? (
            <div className="p-8 text-center font-brm text-sm" style={{ color: 'var(--muted-foreground)' }}>loading...</div>
          ) : invitations.length === 0 ? (
            <div className="p-12 text-center" style={{ color: 'var(--muted-foreground)' }}>
              <Mail className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-brm text-sm">$ no invitations found_</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
                  {['المدعو', 'الدور', 'الشركة', 'الحالة', 'أُرسل', ...(canManage ? ['إجراءات'] : [])].map(h => (
                    <th key={h} className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--muted-foreground)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invitations.map((inv, i) => {
                  const cfg = STATUS_CFG[inv.status];
                  return (
                    <tr key={inv.id} style={{ borderTop: i > 0 ? '1px solid var(--border)' : undefined }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--muted)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                      <td className="px-5 py-3.5">
                        <div className="font-medium" style={{ color: 'var(--foreground)' }}>{inv.name || '—'}</div>
                        <div className="font-brm text-xs" style={{ color: 'var(--muted-foreground)' }} dir="ltr">{inv.email}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                          style={{ background: 'rgba(79,70,229,0.1)', color: '#4F46E5' }}>
                          {ROLE_LABELS[inv.role as keyof typeof ROLE_LABELS] || inv.role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-sm" style={{ color: 'var(--muted-foreground)' }}>{inv.company?.name || '—'}</td>
                      <td className="px-5 py-3.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{ background: cfg.bg, color: cfg.color }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <RelativeTime date={inv.createdAt} />
                      </td>
                      {canManage && (
                        <td className="px-5 py-3.5">
                          <div className="flex gap-2">
                            {(inv.status === 'PENDING' || inv.status === 'EXPIRED') && (
                              <button onClick={() => resendMutation.mutate(inv.id)} disabled={resendMutation.isPending}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-50"
                                style={{ border: '1px solid rgba(79,70,229,0.3)', color: '#4F46E5' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(79,70,229,0.08)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                إعادة إرسال
                              </button>
                            )}
                            {inv.status === 'PENDING' && (
                              <button onClick={() => { if (confirm('هل تريد إلغاء هذه الدعوة؟')) revokeMutation.mutate(inv.id); }}
                                disabled={revokeMutation.isPending}
                                className="text-xs px-2.5 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-50"
                                style={{ border: '1px solid rgba(220,38,38,0.3)', color: '#EF4444' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(220,38,38,0.06)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                إلغاء
                              </button>
                            )}
                            {(inv.status === 'ACCEPTED' || inv.status === 'REVOKED') && (
                              <span className="text-xs" style={{ color: 'var(--muted-foreground)' }}>—</span>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppShell>
  );
}
