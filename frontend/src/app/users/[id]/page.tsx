"use client";
import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { SkeletonList, SkeletonStat } from "@/components/shared/LoadingSpinner";
import { ROLE_LABELS, TICKET_TYPE_LABELS } from "@/lib/constants";
import api from "@/lib/api";
import { ArrowLeft, Mail, Building2, User, Layers, FileText, Download, AtSign } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
const FILE_BASE = API_BASE.replace("/api", "");

const ROLE_COLOR: Record<string, string> = {
  TICKET_REQUESTER: "#0891B2",
  SYSTEM_OWNER:     "#7C3AED",
  PROGRAMMING_HEAD: "#DC2626",
  PROJECT_MANAGER:  "#D97706",
  DEVELOPER:        "#4F46E5",
  QA:               "#059669",
  SENIOR_MANAGEMENT:"#6B7280",
};

const STATUS_BAR: Record<string, string> = {
  DRAFT:"#94A3B8", NEW:"#3B82F6", AWAITING_INFO:"#F59E0B",
  AWAITING_APPROVAL:"#F97316", APPROVED:"#10B981", REJECTED:"#EF4444",
  SCHEDULED:"#8B5CF6", IN_PROGRESS:"#22C55E", AWAITING_TESTING:"#06B6D4",
  AWAITING_OWNER_APPROVAL:"#14B8A6", COMPLETED:"#10B981", CLOSED:"#6B7280", ON_HOLD:"#94A3B8",
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
const isImg = (t: string) => t.startsWith("image/");

function StatBox({ label, value }: { label: string; value: number | undefined }) {
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="font-brm text-2xl font-bold" style={{ color: "var(--foreground)" }}>{value ?? "—"}</div>
      <div className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>{label}</div>
    </div>
  );
}

export default function UserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"tickets" | "chats">("tickets");

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ["user", id],
    queryFn: () => api.get(`/users/${id}`).then(r => r.data),
  });

  const isDev = user?.role === "DEVELOPER";
  const { data: ticketsData, isLoading: ticketsLoading } = useQuery({
    queryKey: ["user-tickets", id, isDev],
    queryFn: () => api.get(`/tickets?${isDev ? `developerId=${id}` : `creatorId=${id}`}&limit=50`).then(r => r.data),
    enabled: !!user && activeTab === "tickets",
  });

  const { data: commentsData, isLoading: commentsLoading } = useQuery({
    queryKey: ["user-comments", id],
    queryFn: () => api.get(`/users/${id}/comments`).then(r => r.data),
    enabled: activeTab === "chats",
  });

  const tickets: any[] = ticketsData?.data ?? [];
  const comments: any[] = commentsData ?? [];
  const initials = user ? `${user.firstName?.[0] ?? ""}${user.lastName?.[0] ?? ""}` : "";
  const roleColor = ROLE_COLOR[user?.role] ?? "#6B7280";

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

        {userLoading ? (
          <div className="grid grid-cols-4 gap-4"><SkeletonStat /><SkeletonStat /><SkeletonStat /><SkeletonStat /></div>
        ) : user && (
          <>
            {/* Profile card */}
            <div className="rounded-2xl p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex items-start gap-5">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-bold shrink-0"
                  style={{ background: `${roleColor}18`, color: roleColor }}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap mb-1">
                    <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
                      {user.firstName} {user.lastName}
                    </h1>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                      style={{ background: `${roleColor}18`, color: roleColor }}>
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                    {!user.isActive && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold"
                        style={{ background: "rgba(220,38,38,.1)", color: "#DC2626" }}>
                        غير نشط
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm" style={{ color: "var(--muted-foreground)" }}>
                    <span className="flex items-center gap-1.5 font-brm" dir="ltr">
                      <Mail className="w-3.5 h-3.5" /> {user.email}
                    </span>
                    {user.company && (
                      <span className="flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5" /> {user.company.name}
                      </span>
                    )}
                    {user.department && (
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5" /> {user.department.name}
                      </span>
                    )}
                  </div>
                  {user.systems?.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {user.systems.map((us: any) => (
                        <span key={us.systemId} className="flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
                          style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                          <Layers className="w-3 h-3" /> {us.system?.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <RelativeTime date={user.createdAt} />
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

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--muted)" }}>
          {(["tickets", "chats"] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className="px-4 py-1.5 rounded-lg text-sm font-medium transition-all"
              style={activeTab === tab
                ? { background: "var(--card)", color: "var(--foreground)", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" }
                : { color: "var(--muted-foreground)", background: "transparent" }}>
              {tab === "tickets" ? "التذاكر" : "المحادثات"}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {activeTab === "tickets" && (
          <div>
            <p className="font-brm text-xs uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
              // {isDev ? "التذاكر المخصصة" : "التذاكر المُنشأة"}
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
                                <span>{ticket.system?.name}</span>
                                <span>{ticket.company?.name}</span>
                                <RelativeTime date={ticket.createdAt} />
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === "chats" && (
          <div>
            <p className="font-brm text-xs uppercase tracking-widest mb-3" style={{ color: "var(--muted-foreground)" }}>
              // المحادثات والإشارات
            </p>
            {commentsLoading ? (
              <SkeletonList count={4} />
            ) : comments.length === 0 ? (
              <div className="rounded-xl p-10 text-center" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                <p className="font-brm text-sm" style={{ color: "var(--muted-foreground)" }}>$ no chats found_</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {comments.map((c: any) => {
                  const isMentioned = c.mentions?.includes(id) && c.authorId !== id;
                  const commentImgs = (c.attachments || []).filter((a: any) => isImg(a.mimeType));
                  const commentFiles = (c.attachments || []).filter((a: any) => !isImg(a.mimeType));
                  return (
                    <Link key={c.id} href={`/tickets/${c.ticket?.id}`}>
                      <div className="rounded-xl p-4 transition-all hover:shadow-md"
                        style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                        {/* Ticket name header */}
                        <div className="flex items-center gap-2 mb-3 pb-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate" style={{ color: "#4F46E5" }}>
                              {c.ticket?.ticketNumber ? `BRM-${String(c.ticket.ticketNumber).padStart(4, "0")} · ` : ""}
                              {c.ticket?.title}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {isMentioned && (
                              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                                style={{ background: "rgba(79,70,229,0.1)", color: "#4F46E5" }}>
                                <AtSign className="w-3 h-3" /> إشارة
                              </span>
                            )}
                            {c.ticket?.status && <StatusBadge status={c.ticket.status} />}
                          </div>
                        </div>

                        {/* Comment body */}
                        <div className="flex gap-3">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: "rgba(79,70,229,0.18)", color: "#818CF8" }}>
                            {c.author?.firstName?.[0]}{c.author?.lastName?.[0]}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                                {c.author?.firstName} {c.author?.lastName}
                              </span>
                              <RelativeTime date={c.createdAt} />
                            </div>
                            <p className="text-sm leading-relaxed line-clamp-3" style={{ color: "var(--muted-foreground)" }}>
                              {c.content}
                            </p>
                            {/* Attachment previews */}
                            {commentImgs.length > 0 && (
                              <div className="flex gap-1.5 mt-2 flex-wrap">
                                {commentImgs.slice(0, 3).map((a: any) => (
                                  <img key={a.id} src={`${FILE_BASE}${a.url}`} alt={a.fileName}
                                    className="w-16 h-12 object-cover rounded-lg"
                                    style={{ border: "1px solid var(--border)" }} />
                                ))}
                                {commentImgs.length > 3 && (
                                  <div className="w-16 h-12 rounded-lg flex items-center justify-center text-xs font-medium"
                                    style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                                    +{commentImgs.length - 3}
                                  </div>
                                )}
                              </div>
                            )}
                            {commentFiles.length > 0 && (
                              <div className="flex items-center gap-1 mt-1.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                                <FileText className="w-3.5 h-3.5" />
                                <span>{commentFiles.length} مرفق</span>
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
        )}
      </div>
    </AppShell>
  );
}
