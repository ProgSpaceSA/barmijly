"use client";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { PageHeader } from "@/components/shared/PageHeader";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { CodeComment } from "@/components/shared/CodeComment";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { SIGNUP_REQUEST_STATUS_LABELS } from "@/lib/constants";
import api from "@/lib/api";
import { toast } from "sonner";
import { Check, X, UserX } from "lucide-react";

type SignupStatus = "PENDING" | "APPROVED" | "REJECTED";
type FilterKey = SignupStatus | "ALL";

interface SignupRequest {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  status: SignupStatus;
  createdAt: string;
  reviewedBy?: { firstName: string; lastName: string } | null;
}

const STATUS_CFG: Record<SignupStatus, { label: string; bar: string; dot: string; bg: string; color: string }> = {
  PENDING:  { label: SIGNUP_REQUEST_STATUS_LABELS.PENDING,  bar: "#F59E0B", dot: "#F59E0B", bg: "rgba(245,158,11,0.1)",  color: "#B45309" },
  APPROVED: { label: SIGNUP_REQUEST_STATUS_LABELS.APPROVED, bar: "#10B981", dot: "#10B981", bg: "rgba(16,185,129,0.1)",  color: "#047857" },
  REJECTED: { label: SIGNUP_REQUEST_STATUS_LABELS.REJECTED, bar: "#EF4444", dot: "#EF4444", bg: "rgba(239,68,68,0.1)",   color: "#B91C1C" },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "ALL",      label: "الكل" },
  { key: "PENDING",  label: SIGNUP_REQUEST_STATUS_LABELS.PENDING },
  { key: "APPROVED", label: SIGNUP_REQUEST_STATUS_LABELS.APPROVED },
  { key: "REJECTED", label: SIGNUP_REQUEST_STATUS_LABELS.REJECTED },
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

export default function SignupRequestsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterKey>("PENDING");
  const [rejecting, setRejecting] = useState<SignupRequest | null>(null);

  const { data = [], isLoading } = useQuery<SignupRequest[]>({
    queryKey: ["signup-requests"],
    queryFn: () => api.get("/signup-requests").then(r => r.data),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.patch(`/signup-requests/${id}/approve`),
    onSuccess: () => {
      toast.success("تم اعتماد الطلب وإرسال الدعوة");
      qc.invalidateQueries({ queryKey: ["signup-requests"] });
    },
    onError: (e: unknown) => toast.error(apiError(e, "فشل اعتماد الطلب")),
  });

  const reject = useMutation({
    mutationFn: (id: string) => api.patch(`/signup-requests/${id}/reject`),
    onSuccess: () => {
      toast.success("تم رفض الطلب");
      setRejecting(null);
      qc.invalidateQueries({ queryKey: ["signup-requests"] });
    },
    onError: (e: unknown) => toast.error(apiError(e, "فشل رفض الطلب")),
  });

  const counts = {
    ALL: data.length,
    PENDING: data.filter(r => r.status === "PENDING").length,
    APPROVED: data.filter(r => r.status === "APPROVED").length,
    REJECTED: data.filter(r => r.status === "REJECTED").length,
  };
  const filtered = filter === "ALL" ? data : data.filter(r => r.status === filter);

  const stats = [
    { key: "PENDING" as const,  label: SIGNUP_REQUEST_STATUS_LABELS.PENDING,  value: counts.PENDING,  color: "#F59E0B" },
    { key: "APPROVED" as const, label: SIGNUP_REQUEST_STATUS_LABELS.APPROVED, value: counts.APPROVED, color: "#10B981" },
    { key: "REJECTED" as const, label: SIGNUP_REQUEST_STATUS_LABELS.REJECTED, value: counts.REJECTED, color: "#EF4444" },
  ];

  const closeRejectModal = () => {
    if (!reject.isPending) setRejecting(null);
  };

  return (
    <AppShell requires="signup:review">
      <PageHeader
        title="طلبات التسجيل"
        description={`${counts.ALL} طلب إجمالاً${counts.PENDING > 0 ? ` — ${counts.PENDING} بانتظار المراجعة` : ""}`}
      />

      <div className="grid grid-cols-3 gap-4 mb-6">
        {stats.map(s => (
          <div
            key={s.key}
            className="rounded-2xl p-5"
            style={{ background: "var(--card)", border: "1px solid var(--border)" }}
          >
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{s.label}</p>
            <p className="text-3xl font-bold font-brm mt-1" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="mb-6">
        <p className="font-brm text-xs mb-2 uppercase tracking-widest" style={{ color: "var(--muted-foreground)" }}>
          <CodeComment>الحالة</CodeComment>
        </p>
        <div className="flex flex-wrap gap-1.5 p-1 rounded-xl w-fit" style={{ background: "var(--muted)" }}>
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
        <SkeletonList count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="لا توجد طلبات"
          command={filter === "PENDING" ? "list signup-requests --pending" : "list signup-requests"}
          description={filter === "PENDING" ? "لا توجد طلبات بانتظار المراجعة" : "لا توجد طلبات بهذا التصفية"}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filtered.map(req => {
            const cfg = STATUS_CFG[req.status];
            const isPending = req.status === "PENDING";
            const busy = approve.isPending || reject.isPending;

            return (
              <div
                key={req.id}
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
                      {req.firstName[0]}{req.lastName[0]}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold" style={{ color: "var(--foreground)" }}>
                        {req.firstName} {req.lastName}
                      </p>
                      <p className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }} dir="ltr">
                        {req.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{ background: cfg.bg, color: cfg.color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
                      {cfg.label}
                    </span>
                    <RelativeTime date={req.createdAt} label="تاريخ الطلب" />
                    {req.reviewedBy && (
                      <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                        بواسطة {req.reviewedBy.firstName} {req.reviewedBy.lastName}
                      </span>
                    )}
                  </div>

                  {isPending && (
                    <div className="flex gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => approve.mutate(req.id)}
                        disabled={busy}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold text-white transition-all disabled:opacity-50"
                        style={{ background: "#10B981" }}
                        onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "#059669"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "#10B981"; }}
                      >
                        <Check className="w-3.5 h-3.5" />
                        اعتماد
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejecting(req)}
                        disabled={busy}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-50"
                        style={{ border: "1px solid rgba(220,38,38,0.3)", color: "#EF4444" }}
                        onMouseEnter={e => { if (!busy) e.currentTarget.style.background = "rgba(220,38,38,0.06)"; }}
                        onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                      >
                        <X className="w-3.5 h-3.5" />
                        رفض
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {rejecting && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={closeRejectModal}
        >
          <div
            className="palette-modal w-full max-w-md rounded-2xl overflow-hidden"
            style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.12)" }}>
                  <UserX className="w-5 h-5" style={{ color: "#EF4444" }} />
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>رفض طلب التسجيل</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    {rejecting.firstName} {rejecting.lastName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeRejectModal}
                disabled={reject.isPending}
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
              <p className="text-sm" style={{ color: "var(--foreground)" }}>هل تريد رفض طلب التسجيل؟</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }} dir="ltr">{rejecting.email}</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>لن يتم إنشاء حساب. يمكن لصاحب الطلب التقديم مرة أخرى.</p>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => reject.mutate(rejecting.id)}
                  disabled={reject.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}
                >
                  {reject.isPending ? "جارٍ الرفض..." : "رفض الطلب"}
                </button>
                <button
                  type="button"
                  onClick={closeRejectModal}
                  disabled={reject.isPending}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                  style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "var(--muted)"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
