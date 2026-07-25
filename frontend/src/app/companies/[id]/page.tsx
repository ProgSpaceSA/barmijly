"use client";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { SkeletonList, SkeletonStat } from "@/components/shared/LoadingSpinner";
import { TICKET_TYPE_LABELS } from "@/lib/constants";
import api from "@/lib/api";
import { ArrowLeft, Globe, Monitor, FolderOpen, Users } from "lucide-react";

const STATUS_BAR: Record<string, string> = {
  DRAFT:"#94A3B8", NEW:"#3B82F6", AWAITING_INFO:"#F59E0B",
  AWAITING_APPROVAL:"#F97316", APPROVED:"#10B981", REJECTED:"#EF4444",
  SCHEDULED:"#8B5CF6", IN_PROGRESS:"#22C55E", AWAITING_TESTING:"#06B6D4",
  AWAITING_OWNER_APPROVAL:"#14B8A6", COMPLETED:"#10B981", CLOSED:"#6B7280", ON_HOLD:"#94A3B8",
};

function StatBox({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="font-brm text-2xl font-bold" style={{ color: "var(--foreground)" }}>{value ?? "—"}</div>
      <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{label}</div>
    </div>
  );
}

export default function CompanyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ["company", id],
    queryFn: () => api.get(`/companies/${id}`).then(r => r.data),
  });

  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ["company-tickets", id],
    queryFn: () => api.get(`/tickets?companyId=${id}&limit=50`).then(r => r.data),
  });

  const tickets: any[] = ticketsData?.data ?? [];

  return (
    <AppShell>
      <div className="max-w-4xl space-y-6">
        {/* Back */}
        <button onClick={() => router.back()}
          className="flex items-center gap-1.5 text-sm transition-colors"
          style={{ color: "var(--muted-foreground)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--foreground)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
          <ArrowLeft className="w-4 h-4" /> رجوع
        </button>

        {companyLoading ? (
          <div className="grid grid-cols-4 gap-4"><SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat /></div>
        ) : company && (
          <>
            {/* Company card */}
            <div className="rounded-2xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex items-start gap-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0"
                  style={{ background: "rgba(79,70,229,0.1)", color: "#4F46E5" }}>
                  {company.name?.[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>{company.name}</h1>
                    {company.nameAr && company.nameAr !== company.name && (
                      <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>{company.nameAr}</span>
                    )}
                    {!company.isActive && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: "rgba(220,38,38,.1)", color: "#DC2626" }}>غير نشطة</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-5 text-sm" style={{ color: "var(--muted-foreground)" }}>
                    {company.domain && (
                      <span className="flex items-center gap-1.5 font-brm" dir="ltr">
                        <Globe className="w-3.5 h-3.5" /> {company.domain}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5">
                      <FolderOpen className="w-3.5 h-3.5" /> {company.departments?.length ?? 0} قسم
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Monitor className="w-3.5 h-3.5" /> {company.systems?.length ?? 0} نظام
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users className="w-3.5 h-3.5" /> {company._count?.users ?? 0} مستخدم
                    </span>
                  </div>

                  {/* Systems */}
                  {company.systems?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {company.systems.map((s: any) => (
                        <span key={s.id} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
                          style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                          <Monitor className="w-3 h-3" /> {s.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-4 gap-3">
              <StatBox label="إجمالي التذاكر"  value={tickets.length} />
              <StatBox label="قيد التنفيذ"      value={tickets.filter((t: any) => t.status === "IN_PROGRESS").length} />
              <StatBox label="مكتملة"           value={tickets.filter((t: any) => t.status === "COMPLETED").length} />
              <StatBox label="مغلقة"            value={tickets.filter((t: any) => t.status === "CLOSED").length} />
            </div>
          </>
        )}

        {/* Tickets */}
        <div>
          <p className="font-brm text-xs uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
            // تذاكر الشركة
          </p>

          {ticketsLoading ? (
            <SkeletonList count={4} />
          ) : tickets.length === 0 ? (
            <div className="rounded-xl p-10 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="font-brm text-sm" style={{ color: "var(--muted-foreground)" }}>$ no tickets found_</p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {tickets.map((ticket: any) => {
                const bar = STATUS_BAR[ticket.status] ?? "#94A3B8";
                const brmId = ticket.ticketNumber ? `BRM-${String(ticket.ticketNumber).padStart(4, "0")}` : null;
                return (
                  <Link key={ticket.id} href={`/tickets/${ticket.id}`}>
                    <div className="rounded-xl flex overflow-hidden transition-all hover:shadow-md"
                      style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                      <div className="w-1 shrink-0 self-stretch" style={{ background: bar, borderRadius: "0 4px 4px 0" }} />
                      <div className="flex-1 p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <StatusBadge status={ticket.status} />
                              <PriorityBadge priority={ticket.finalPriority || ticket.priority} />
                              {brmId && (
                                <span className="font-brm text-xs px-2 py-0.5 rounded-md"
                                  style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>{brmId}</span>
                              )}
                              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                                {TICKET_TYPE_LABELS[ticket.type]}
                              </span>
                            </div>
                            <h3 className="font-semibold truncate" style={{ color: "var(--foreground)" }}>{ticket.title}</h3>
                            <div className="flex gap-4 mt-1.5 text-xs flex-wrap" style={{ color: "var(--muted-foreground)" }}>
                              <span className="flex items-center gap-1">
                                {ticket.creator?.firstName} {ticket.creator?.lastName}
                              </span>
                              <span>{ticket.system?.name}</span>
                              <RelativeTime date={ticket.createdAt} />
                            </div>
                          </div>
                          {ticket.assignments?.[0] && (
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                              style={{ background: "rgba(79,70,229,0.1)", color: "#4F46E5" }}>
                              {ticket.assignments[0].developer?.firstName?.[0]}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
