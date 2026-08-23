"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList, SkeletonStat } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { CodeComment } from "@/components/shared/CodeComment";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { INVITATION_STATUS_LABELS, ROLE_LABELS } from "@/lib/constants";
import { useAuthStore } from "@/store/auth";
import { usePermissions } from "@/hooks/usePermissions";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { toast } from "sonner";
import { Ban, RefreshCw, X } from "lucide-react";

type InvitationStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "REVOKED";
type FilterKey = InvitationStatus | "ALL";

interface Invitation {
  id: string;
  email: string;
  role: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  sender?: { firstName: string; lastName: string } | null;
  receiver?: { firstName: string; lastName: string } | null;
}

const STATUS_CFG: Record<InvitationStatus, { label: string; bar: string; dot: string; bg: string; color: string }> = {
  PENDING:  { label: INVITATION_STATUS_LABELS.PENDING,  bar: "#F59E0B", dot: "#F59E0B", bg: "rgba(245,158,11,0.1)",  color: "#B45309" },
  ACCEPTED: { label: INVITATION_STATUS_LABELS.ACCEPTED, bar: "#10B981", dot: "#22C55E", bg: "rgba(34,197,94,0.1)",   color: "#15803D" },
  EXPIRED:  { label: INVITATION_STATUS_LABELS.EXPIRED,  bar: "#94A3B8", dot: "#94A3B8", bg: "rgba(148,163,184,0.1)", color: "#64748B" },
  REVOKED:  { label: INVITATION_STATUS_LABELS.REVOKED,  bar: "#EF4444", dot: "#EF4444", bg: "rgba(239,68,68,0.1)",   color: "#B91C1C" },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL",      label: "الكل" },
  { key: "PENDING",  label: INVITATION_STATUS_LABELS.PENDING },
  { key: "ACCEPTED", label: INVITATION_STATUS_LABELS.ACCEPTED },
  { key: "EXPIRED",  label: INVITATION_STATUS_LABELS.EXPIRED },
  { key: "REVOKED",  label: INVITATION_STATUS_LABELS.REVOKED },
];

function CountBadge({ count, active, tone }: { count: number; active: boolean; tone?: "warning" }) {
  const twoDigits = count > 9;
  return (
    <span
      data-testid={tone === "warning" ? "pending-count" : undefined}
      className="font-brm inline-flex items-center justify-center rounded-full shrink-0 grow-0"
      style={{
        width: twoDigits ? undefined : 20,
        height: 20,
        minWidth: 20,
        minHeight: 20,
        maxHeight: 20,
        maxWidth: twoDigits ? undefined : 20,
        padding: 0,
        paddingInline: twoDigits ? 6 : 0,
        flex: twoDigits ? undefined : "0 0 20px",
        aspectRatio: twoDigits ? undefined : "1 / 1",
        boxSizing: "border-box",
        overflow: "hidden",
        fontSize: 10,
        lineHeight: 1,
        background: tone === "warning"
          ? (active ? "#F59E0B" : "rgba(245,158,11,0.18)")
          : (active ? "rgba(79,70,229,0.12)" : "var(--muted)"),
        color: tone === "warning"
          ? (active ? "#fff" : "#B45309")
          : (active ? "#4F46E5" : "var(--muted-foreground)"),
      }}
    >
      {count}
    </span>
  );
}

function FilterPill({
  label,
  count,
  active,
  onClick,
  warningCount,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
  warningCount?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap"
      style={{
        background: active ? "var(--card)" : "transparent",
        color: active ? "var(--foreground)" : "var(--muted-foreground)",
        boxShadow: active ? "0 1px 4px rgba(0,0,0,0.08)" : "none",
      }}
    >
      {label}
      {count !== undefined && count > 0 && (
        <CountBadge count={count} active={active} tone={warningCount ? "warning" : undefined} />
      )}
    </button>
  );
}

function apiError(e: unknown, fallback: string) {
  const message = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return typeof message === "string" ? message : fallback;
}

function inviteeName(inv: Invitation) {
  const name = [inv.receiver?.firstName, inv.receiver?.lastName].filter(Boolean).join(" ").trim();
  return name || inv.email;
}

function inviteeInitials(inv: Invitation) {
  const first = inv.receiver?.firstName?.[0] ?? inv.email[0] ?? "?";
  const last = inv.receiver?.lastName?.[0] ?? "";
  return `${first}${last}`;
}

export default function InvitationsPage() {
  const qc = useQueryClient();
  const { can: allowed } = usePermissions();
  const canManage = allowed("invitation:manage");
  const [filter, setFilter] = useState<FilterKey>("PENDING");
  const [revoking, setRevoking] = useState<Invitation | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: qk.invitations.all,
    queryFn: () => api.get("/invitations").then(r => r.data),
  });

  const invitations: Invitation[] = data?.data || data || [];

  const resend = useMutation({
    mutationFn: (id: string) => api.patch(`/invitations/${id}/resend`),
    onSuccess: () => {
      toast.success("تم إعادة إرسال الدعوة");
      qc.invalidateQueries({ queryKey: qk.invitations.all });
    },
    onError: (e: unknown) => toast.error(apiError(e, "فشل إعادة الإرسال")),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.patch(`/invitations/${id}/revoke`),
    onSuccess: () => {
      toast.success("تم إلغاء الدعوة");
      setRevoking(null);
      qc.invalidateQueries({ queryKey: qk.invitations.all });
    },
    onError: (e: unknown) => toast.error(apiError(e, "فشل إلغاء الدعوة")),
  });

  const counts = {
    ALL: invitations.length,
    PENDING: invitations.filter(i => i.status === "PENDING").length,
    ACCEPTED: invitations.filter(i => i.status === "ACCEPTED").length,
    EXPIRED: invitations.filter(i => i.status === "EXPIRED").length,
    REVOKED: invitations.filter(i => i.status === "REVOKED").length,
  };
  const filtered = filter === "ALL" ? invitations : invitations.filter(i => i.status === filter);

  const stats = [
    { key: "PENDING" as const,  label: INVITATION_STATUS_LABELS.PENDING,  value: counts.PENDING,  color: "#F59E0B" },
    { key: "ACCEPTED" as const, label: INVITATION_STATUS_LABELS.ACCEPTED, value: counts.ACCEPTED, color: "#10B981" },
    { key: "EXPIRED" as const,  label: INVITATION_STATUS_LABELS.EXPIRED,  value: counts.EXPIRED,  color: "#94A3B8" },
    { key: "REVOKED" as const,  label: INVITATION_STATUS_LABELS.REVOKED,  value: counts.REVOKED,  color: "#EF4444" },
  ];

  const closeRevokeModal = () => {
    if (!revoke.isPending) setRevoking(null);
  };

  const busy = resend.isPending || revoke.isPending;

  return (
    <AppShell requires="invitation:manage">
      <PageHeader
        title="الدعوات"
        description={`${counts.ALL} دعوة إجمالاً${counts.PENDING > 0 ? ` — ${counts.PENDING} معلقة` : ""}`}
      />

      {isLoading ? (
        <div className="grid grid-cols-2 gap-2 mb-6 sm:grid-cols-4 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonStat key={i} />)}
        </div>
      ) : (
      <div className="grid grid-cols-2 gap-2 mb-6 sm:grid-cols-4 sm:gap-4">
        {stats.map(s => (
          <div
            key={s.key}
            className="rounded-2xl p-3 sm:p-5"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <p className="text-xs sm:text-sm" style={{ color: "var(--muted-foreground)" }}>{s.label}</p>
            <p className="text-2xl sm:text-3xl font-bold font-brm mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>
      )}

      <div className="mb-6">
        <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
          <CodeComment>الحالة</CodeComment>
        </p>
        <div className="brm-pill-rail flex flex-wrap gap-1.5 p-1 rounded-xl w-fit max-w-full" style={{ background: "var(--muted)" }}>
          {FILTERS.map(({ key, label }) => (
            <FilterPill
              key={key}
              label={label}
              count={key === "ALL" ? counts.ALL : counts[key]}
              warningCount={key === "PENDING"}
              active={filter === key}
              onClick={() => setFilter(key)}
            />
          ))}
        </div>
      </div>

      {isLoading ? (
        <SkeletonList count={4} variant="people" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="لا توجد دعوات"
          command={filter === "PENDING" ? "list invitations --pending" : "list invitations"}
          description={filter === "PENDING" ? "لا توجد دعوات معلقة" : "لا توجد دعوات بهذا التصفية"}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filtered.map(inv => {
            const cfg = STATUS_CFG[inv.status];
            const canResend = inv.status === "PENDING" || inv.status === "EXPIRED";
            const canRevoke = inv.status === "PENDING";

            return (
              <div
                key={inv.id}
                className="rounded-xl flex overflow-hidden"
                style={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
                }}
              >
                <div className="w-1 shrink-0 self-stretch" style={{ background: cfg.bar, borderRadius: "0 4px 4px 0" }} />

                <div className="flex-1 p-4 flex items-center justify-between gap-4 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 text-indigo-300"
                      style={{ background: "rgba(79,70,229,0.18)" }}
                    >
                      {inviteeInitials(inv)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold" style={{ color: "var(--foreground)" }}>{inviteeName(inv)}</p>
                      <p className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }} dir="ltr">
                        {inv.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className="px-2.5 py-1 rounded-lg text-xs font-semibold"
                      style={{ background: "rgba(79,70,229,0.1)", color: "#4F46E5" }}
                    >
                      {ROLE_LABELS[inv.role as keyof typeof ROLE_LABELS] || inv.role}
                    </span>
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{ background: cfg.bg, color: cfg.color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
                      {cfg.label}
                    </span>
                    <RelativeTime date={inv.createdAt} label="تاريخ الإرسال" />
                    {inv.sender && (
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        بواسطة {inv.sender.firstName} {inv.sender.lastName}
                      </span>
                    )}
                  </div>

                  {canManage && (canResend || canRevoke) && (
                    <div className="flex gap-2 shrink-0">
                      {canResend && (
                        <button
                          type="button"
                          onClick={() => resend.mutate(inv.id)}
                          disabled={busy}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-50"
                          style={{ border: "1px solid rgba(79,70,229,0.3)", color: "#4F46E5" }}
                          onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "rgba(79,70,229,0.08)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                          إعادة إرسال
                        </button>
                      )}
                      {canRevoke && (
                        <button
                          type="button"
                          onClick={() => setRevoking(inv)}
                          disabled={busy}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-50"
                          style={{ border: "1px solid rgba(220,38,38,0.3)", color: "#EF4444" }}
                          onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "rgba(220,38,38,0.06)"; }}
                          onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                        >
                          <X className="w-3.5 h-3.5" />
                          إلغاء
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {revoking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={closeRevokeModal}
        >
          <div
            className="palette-modal brm-modal max-w-md rounded-2xl overflow-hidden"
            style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.12)" }}>
                  <Ban className="w-5 h-5" style={{ color: "#EF4444" }} />
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>إلغاء الدعوة</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{inviteeName(revoking)}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeRevokeModal}
                disabled={revoke.isPending}
                className="transition-colors disabled:opacity-50"
                style={{ color: "var(--muted-foreground)" }}
                onMouseEnter={e => { e.currentTarget.style.color = "var(--foreground)"; }}
                onMouseLeave={e => { e.currentTarget.style.color = "var(--muted-foreground)"; }}
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: "var(--foreground)" }}>هل تريد إلغاء هذه الدعوة؟</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }} dir="ltr">{revoking.email}</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>لن يتمكن المدعو من تفعيل الحساب بهذا الرابط.</p>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => revoke.mutate(revoking.id)}
                  disabled={revoke.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}
                >
                  {revoke.isPending ? "جارٍ الإلغاء..." : "تأكيد الإلغاء"}
                </button>
                <button
                  type="button"
                  onClick={closeRevokeModal}
                  disabled={revoke.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                  style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--muted)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  رجوع
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
