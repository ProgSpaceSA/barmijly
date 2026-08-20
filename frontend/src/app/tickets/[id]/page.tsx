"use client";
import { use, useRef, useState, useEffect, useCallback, useReducer } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { TicketCodeBadge } from "@/components/shared/TicketCodeBadge";
import { useTicket, useTicketAction } from "@/hooks/useTickets";
import { useMarkTicketRead } from "@/hooks/useNotifications";
import { useAuthStore } from "@/store/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadAttachment, fetchAttachmentObjectUrl } from "@/lib/attachments";
import { AttachmentImage } from "@/components/shared/AttachmentImage";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMMENT_LABELS, SELECT_PLACEHOLDERS, TICKET_TYPE_LABELS } from "@/lib/constants";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  ArrowRight, Clock, User, Building2, Monitor, Lock,
  Paperclip, FileText, Trash2, Download, Check, AlertTriangle, X, Plus, Eye, Loader2,
  ChevronDown, ChevronLeft,
} from "lucide-react";
import api from "@/lib/api";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { CodeComment } from "@/components/shared/CodeComment";
import { Markdown } from "@/components/shared/Markdown";
import { CommentThread } from "@/components/tickets/CommentThread";
import { formatBytes } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
const FILE_BASE = API_BASE.replace("/api", "");

const isImg = (t: string) => t.startsWith("image/");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-visible" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-3.5" style={{ borderBottom: "1px solid var(--border)" }}>
        <h3 className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-brm text-xs mb-1.5" style={{ color: "var(--muted-foreground)" }}>
        <CodeComment>{label}</CodeComment>
      </p>
      <div className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>{children}</div>
    </div>
  );
}

function ActionBtn({ onClick, variant = "primary", disabled, children }: {
  onClick?: () => void; variant?: "primary" | "outline" | "danger" | "ghost"; disabled?: boolean; children: React.ReactNode;
}) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: "linear-gradient(135deg, #4F46E5, #6C5CE7)", color: "#fff" },
    outline: { border: "1px solid var(--border)", color: "var(--foreground)", background: "transparent" },
    danger:  { border: "1px solid rgba(239,68,68,0.4)", color: "#EF4444", background: "rgba(239,68,68,0.06)" },
    ghost:   { color: "var(--muted-foreground)", background: "transparent" },
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
      style={styles[variant]}>
      {children}
    </button>
  );
}

function Spinner() {
  return <Loader2 className="w-3.5 h-3.5 animate-spin inline-block ml-1" />;
}

// ── Lightbox ──────────────────────────────────────────────────────────────
type LbState = {
  zoom: number;
  offset: { x: number; y: number };
  dragging: boolean;
  origin: { mx: number; my: number; ox: number; oy: number };
};
const LB_INIT: LbState = { zoom: 1, offset: { x: 0, y: 0 }, dragging: false, origin: { mx: 0, my: 0, ox: 0, oy: 0 } };

function lbReducer(s: LbState, a: any): LbState {
  switch (a.type) {
    case "WHEEL": {
      const nz = Math.min(Math.max(s.zoom * (a.deltaY < 0 ? 1.12 : 1 / 1.12), 0.5), 12);
      const r = nz / s.zoom;
      return { ...s, zoom: nz, offset: { x: a.cx - (a.cx - s.offset.x) * r, y: a.cy - (a.cy - s.offset.y) * r } };
    }
    case "DOWN": return { ...s, dragging: true, origin: { mx: a.x, my: a.y, ox: s.offset.x, oy: s.offset.y } };
    case "MOVE": return s.dragging ? { ...s, offset: { x: s.origin.ox + a.x - s.origin.mx, y: s.origin.oy + a.y - s.origin.my } } : s;
    case "UP":   return { ...s, dragging: false };
    case "ZOOM": {
      const nz = Math.min(Math.max(s.zoom * a.factor, 0.5), 12);
      return { ...s, zoom: nz, offset: nz <= 1 ? { x: 0, y: 0 } : s.offset };
    }
    case "RESET": return LB_INIT;
    default: return s;
  }
}

function LbControlBtn({ onClick, children, wide }: { onClick: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <button onClick={onClick}
      style={{
        height: 34, minWidth: wide ? "auto" : 34,
        padding: wide ? "0 14px" : "0",
        borderRadius: 8, gap: 5,
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.12)",
        color: "#fff", cursor: "pointer", fontSize: wide ? 12 : 17,
        fontWeight: 600, display: "inline-flex",
        alignItems: "center", justifyContent: "center",
        transition: "background 0.1s",
      }}
      onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
      onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}>
      {children}
    </button>
  );
}

function LightboxViewer({ url, alt, onClose }: { url: string; alt?: string; onClose: () => void }) {
  const [s, dispatch] = useReducer(lbReducer, LB_INIT);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      dispatch({ type: "WHEEL", deltaY: e.deltaY, cx: e.clientX - rect.left - rect.width / 2, cy: e.clientY - rect.top - rect.height / 2 });
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, []);

  const pct = Math.round(s.zoom * 100);

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(5,5,9,0.97)", display: "flex", flexDirection: "column", direction: "ltr" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>

      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        aria-label="إغلاق"
        title="إغلاق (Esc)"
        style={{
          position: "absolute", top: 20, right: 20, zIndex: 1,
          width: 40, height: 40, padding: 0, borderRadius: "50%",
          background: "rgba(20,20,28,0.72)", border: "1px solid rgba(255,255,255,0.16)",
          color: "#fff", cursor: "pointer", lineHeight: 0,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          backdropFilter: "blur(10px)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
          transition: "background 0.15s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(20,20,28,0.72)")}>
        <X size={18} strokeWidth={2.25} aria-hidden />
      </button>

      {/* Image area */}
      <div
        ref={containerRef}
        style={{
          flex: 1, overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: s.dragging ? "grabbing" : s.zoom > 1 ? "grab" : "default",
          userSelect: "none",
        }}
        onMouseDown={(e) => { e.preventDefault(); dispatch({ type: "DOWN", x: e.clientX, y: e.clientY }); }}
        onMouseMove={(e) => dispatch({ type: "MOVE", x: e.clientX, y: e.clientY })}
        onMouseUp={() => dispatch({ type: "UP" })}
        onMouseLeave={() => dispatch({ type: "UP" })}
        onDoubleClick={() => dispatch({ type: s.zoom > 1 ? "RESET" : "ZOOM", factor: 2 })}>

        <img
          src={url} alt={alt ?? ""}
          draggable={false}
          style={{
            maxWidth: "90vw", maxHeight: "85vh",
            objectFit: "contain", display: "block", borderRadius: 6,
            transform: `translate(${s.offset.x}px, ${s.offset.y}px) scale(${s.zoom})`,
            transformOrigin: "center center",
            pointerEvents: "none",
            boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          }}
        />
      </div>

      {/* Controls */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        padding: "12px 20px",
        background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(255,255,255,0.07)",
      }}>
        <LbControlBtn onClick={() => dispatch({ type: "ZOOM", factor: 1 / 1.3 })}>−</LbControlBtn>
        <span style={{
          color: "rgba(255,255,255,0.65)", fontSize: 13, fontWeight: 500,
          minWidth: 52, textAlign: "center", fontVariantNumeric: "tabular-nums",
        }}>
          {pct}%
        </span>
        <LbControlBtn onClick={() => dispatch({ type: "ZOOM", factor: 1.3 })}>+</LbControlBtn>
        <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.12)", margin: "0 4px" }} />
        <LbControlBtn onClick={() => dispatch({ type: "RESET" })} wide>↺ إعادة الضبط</LbControlBtn>
        <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.12)", margin: "0 4px" }} />
        <span style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
          دبل كليك للتكبير · اسحب للتحريك
        </span>
      </div>
    </div>
  );
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuthStore();
  const { can: allowed } = usePermissions();

  /** Lightbox source for an attachment, fetched through the authorised route. */
  const openAttachment = (attachmentId: string) =>
    fetchAttachmentObjectUrl(attachmentId)
      .then(setLightboxUrl)
      .catch(() => {});
  const qc = useQueryClient();
  const { data: ticket, isLoading } = useTicket(id);
  const { mutate: markTicketRead } = useMarkTicketRead();
  const actions = useTicketAction(id);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [approvalNotes, setApprovalNotes] = useState("");
  const [closureNotes, setClosureNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const attachInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ticket?.id) return;
    markTicketRead(ticket.id);
    // Opened the ticket — mark that thread read once per id, not on mutate identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  // Scoped by ticket: the API returns exactly the people it will accept a
  // mention for, so the picker cannot offer a name that is dropped on save.
  const { data: allUsers } = useQuery({
    queryKey: ["users-mentionable", id],
    queryFn: () => api.get("/users/mentionable", { params: { ticketId: id } }).then(r => r.data),
    enabled: !!id,
    staleTime: 60_000,
  });
  const mentionableUsers: any[] = allUsers ?? [];

  const { data: tasksData, refetch: refetchTasks } = useQuery({
    queryKey: ["ticket-tasks", id],
    queryFn: () => api.get(`/tickets/${id}/tasks`).then(r => r.data),
    enabled: !!ticket,
  });
  const tasks: any[] = tasksData ?? [];
  const myTasks = tasks.filter(t => t.assignedTo?.id === user?.id);

  const { data: systemData } = useQuery({
    queryKey: ["system", ticket?.systemId],
    queryFn: () => api.get(`/systems/${ticket!.systemId}`).then(r => r.data),
    enabled: !!ticket?.systemId,
  });
  const developerList: any[] = (allUsers ?? [])
    .filter((u: any) => u.role === "DEVELOPER" && u.isActive !== false);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [desktopSidebarClosed, setDesktopSidebarClosed] = useState(false);
  const [forceStatusOpen, setForceStatusOpen] = useState(false);
  const [forceStatusReason, setForceStatusReason] = useState("");
  const [taskForm, setTaskForm] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", assignedToId: "", dueDate: "" });
  const [savingTask, setSavingTask] = useState(false);
  const [assignForm, setAssignForm] = useState(false);
  const [assignDevId, setAssignDevId] = useState("");
  const [assignDeadline, setAssignDeadline] = useState("");
  const [assignStartDate, setAssignStartDate] = useState("");
  const [assignHours, setAssignHours] = useState("");
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [taskFiles, setTaskFiles] = useState<File[]>([]);
  const taskFileRef = useRef<HTMLInputElement>(null);

  const createTask = async () => {
    if (!newTask.title.trim() || !newTask.assignedToId) return;
    setSavingTask(true);
    try {
      const taskPayload = Object.fromEntries(Object.entries(newTask).filter(([, v]) => v !== ""));
      const created = await api.post(`/tickets/${id}/tasks`, taskPayload);
      const taskId = created.data?.id;
      if (taskId && taskFiles.length) {
        for (const file of taskFiles) {
          const fd = new FormData();
          fd.append("file", file);
          await api.post(`/attachments/upload?taskId=${taskId}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        }
      }
      setNewTask({ title: "", description: "", assignedToId: "", dueDate: "" });
      setTaskFiles([]);
      setTaskForm(false);
      refetchTasks();
    } finally { setSavingTask(false); }
  };

  const updateTaskStatus = async (taskId: string, status: string) => {
    await api.patch(`/tasks/${taskId}`, { status });
    refetchTasks();
  };

  const deleteTask = async (taskId: string) => {
    await api.delete(`/tasks/${taskId}`);
    refetchTasks();
  };

  const assignedDev = ticket?.assignments?.[0]?.developer;
  const assignedDevName = [assignedDev?.firstName, assignedDev?.lastName].filter(Boolean).join(" ");
  const assignedDevLabel = assignedDevName
    ? `المطور المُكلَّف: ${assignedDevName}`
    : "المطور المُكلَّف";
  // Capability flags, not role names: these mirror the backend action matrix in
  // lib/permissions.ts, so a visible button is always one the API will accept.
  const isHead      = user?.role === "PROGRAMMING_HEAD";
  const isRequester = user?.role === "TICKET_REQUESTER";
  const isManager   = allowed("ticket:archive");
  const isDeveloper = user?.role === "DEVELOPER";
  const canApprove       = allowed("ticket:approve");
  const canAssign        = allowed("ticket:assign");
  const canVerifyTesting = allowed("ticket:verify-testing");
  const canClose         = allowed("ticket:close");
  const canReopen        = allowed("ticket:reopen");
  const canArchive       = allowed("ticket:archive");
  const canForceStatus   = allowed("ticket:force-status");
  const canManageTasks   = allowed("task:manage");
  const canPostInternal  = allowed("comment:internal");

  if (isLoading) return <AppShell><SkeletonList count={4} /></AppShell>;
  if (!ticket)   return <AppShell><p className="text-sm" style={{ color: "var(--muted-foreground)" }}>التذكرة غير موجودة</p></AppShell>;

  // Owner sign-off is the requester's or a system owner's call (req.md §3);
  // leadership may stand in for an absent owner. "مالك النظام" is the role
  // that can already open this ticket, not only the named systemOwnerId.
  const isOwnerSide =
    ticket.creatorId === user?.id ||
    ticket.systemOwnerId === user?.id ||
    user?.role === "SYSTEM_OWNER";
  const canAcceptDelivery = allowed("ticket:accept-delivery") && (isOwnerSide || canClose);

  const handleAttachUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        await api.post(`/attachments/upload?ticketId=${id}`, form, { headers: { "Content-Type": "multipart/form-data" } });
      }
      qc.invalidateQueries({ queryKey: ["ticket", id] });
    } finally { setUploading(false); e.target.value = ""; }
  };

  const handleDeleteAttachment = async (aid: string) => {
    try {
      await api.delete(`/attachments/${aid}`);
      qc.invalidateQueries({ queryKey: ["ticket", id] });
    } catch (e: any) {
      const { toast } = await import("sonner");
      toast.error(e.response?.data?.message || "تعذّر حذف المرفق");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const ticketAttachments = (ticket.attachments || []).filter((a: any) => !a.commentId);
  const imageAttachments  = ticketAttachments.filter((a: any) => isImg(a.mimeType));
  const fileAttachments   = ticketAttachments.filter((a: any) => !isImg(a.mimeType));

  return (
    <>
    <AppShell>
      <div className="max-w-4xl">

        {/* Top nav */}
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm mb-5 transition-colors"
          style={{ color: "var(--muted-foreground)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--foreground)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
          <ArrowRight className="w-4 h-4" /> رجوع
        </button>

        {/* Cover Image */}
        {ticket.coverImageUrl && (
          <div className="mb-5 rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)", cursor: "pointer" }}
            onClick={() => setLightboxUrl(`${FILE_BASE}${ticket.coverImageUrl}`)}>
            <img src={`${FILE_BASE}${ticket.coverImageUrl}`} alt="cover" className="w-full max-h-56 object-cover hover:opacity-95 transition-opacity" />
          </div>
        )}

        {/* Hero */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <TicketCodeBadge ticketNumber={ticket.ticketNumber} />
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.finalPriority || ticket.priority} />
            <span className="inline-flex h-6 items-center text-xs px-2.5 rounded-full font-medium leading-4"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              {TICKET_TYPE_LABELS[ticket.type]}
            </span>
            <RelativeTime date={ticket.createdAt} />
          </div>
          <h1 className="text-xl font-bold leading-snug" style={{ color: "var(--foreground)" }}>{ticket.title}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Main column ── */}
          <div className={`space-y-4 ${desktopSidebarClosed ? "lg:col-span-3" : "lg:col-span-2"}`}>
            {desktopSidebarClosed && (
              <div className="hidden lg:flex justify-end -mb-1">
                <button onClick={() => setDesktopSidebarClosed(false)}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                  style={{ color: "#4F46E5", background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.15)" }}>
                  <ChevronLeft className="w-3.5 h-3.5" /> عرض التفاصيل
                </button>
              </div>
            )}

            {/* Details */}
            <Section title="تفاصيل الطلب">
              <div className="space-y-5">
                <Field label="الوصف">
                  <Markdown
                    content={ticket.description}
                    baseUrl={FILE_BASE}
                    onImageClick={(src) => setLightboxUrl(src)}
                  />
                </Field>
                <div className="h-px" style={{ background: "var(--border)" }} />
                <Field label="السبب">{ticket.reason}</Field>
                <div className="h-px" style={{ background: "var(--border)" }} />
                <Field label="النتيجة المتوقعة">{ticket.expectedOutcome}</Field>
                <div className="h-px" style={{ background: "var(--border)" }} />
                <Field label="التأثير على العمل">{ticket.businessImpact}</Field>
                {ticket.hasFinancialLoss && (
                  <>
                    <div className="h-px" style={{ background: "var(--border)" }} />
                    <div className="flex gap-3 p-3 rounded-xl" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-red-500 mb-0.5">يوجد ضرر مالي</p>
                        <p className="text-sm text-red-400">{ticket.financialLossDetails}</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Section>

            {/* Attachments */}
            <Section title="المرفقات">
              <input ref={attachInputRef} type="file" multiple className="hidden" onChange={handleAttachUpload} />
              {ticketAttachments.length === 0 ? (
                <div className="text-center py-6">
                  <p className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>$ no attachments_</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {imageAttachments.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {imageAttachments.map((att: any) => (
                        <div key={att.id} className="group relative rounded-lg overflow-hidden aspect-video"
                          style={{ border: "1px solid var(--border)", background: "var(--muted)", cursor: "pointer" }}
                          onClick={() => openAttachment(att.id)}>
                          <AttachmentImage attachmentId={att.id} alt={att.fileName} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all" style={{ background: "rgba(0,0,0,0.45)" }}>
                            <button onClick={(e) => { e.stopPropagation(); openAttachment(att.id); }} className="p-1.5 rounded-full bg-white text-slate-700 hover:text-indigo-600" title="عرض">
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={e => { e.stopPropagation(); downloadAttachment(att.id, att.fileName); }} className="p-1.5 rounded-full bg-white text-slate-700 hover:text-indigo-600" title="تحميل">
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(att.id); }} className="p-1.5 rounded-full bg-white text-slate-700 hover:text-red-600" title="حذف">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {fileAttachments.length > 0 && (
                    <div className="space-y-2">
                      {fileAttachments.map((att: any) => (
                        <div key={att.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: "var(--muted)" }}>
                          <FileText className="w-4 h-4 shrink-0" style={{ color: "#4F46E5" }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>{att.fileName}</p>
                            <p className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>{formatBytes(att.fileSize)}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <button onClick={() => downloadAttachment(att.id, att.fileName)} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--muted-foreground)" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#4F46E5")}
                              onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}
                              title="تحميل">
                              <Download className="w-4 h-4" />
                            </button>
                            <button onClick={() => setConfirmDeleteId(att.id)} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--muted-foreground)" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                              onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}
                              title="حذف">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button onClick={() => attachInputRef.current?.click()} disabled={uploading}
                className="mt-3 flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-50"
                style={{ color: "#4F46E5" }}>
                <Paperclip className="w-3.5 h-3.5" />
                {uploading ? "جارٍ الرفع..." : "إضافة مرفق"}
              </button>
            </Section>

            {/* Status Timeline */}
            {ticket.statusHistory?.length > 0 && (
              <Section title="سجل الحالات">
                <div className="space-y-1">
                  {ticket.statusHistory.map((h: any, i: number) => (
                    <div key={h.id} className="flex gap-3">
                      <div className="flex flex-col items-center pt-1.5">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "#4F46E5" }} />
                        {i < ticket.statusHistory.length - 1 && (
                          <div className="w-px flex-1 mt-1" style={{ background: "var(--border)", minHeight: "20px" }} />
                        )}
                      </div>
                      <div className="pb-4 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          {h.fromStatus && <StatusBadge status={h.fromStatus} />}
                          {h.fromStatus && <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>←</span>}
                          <StatusBadge status={h.toStatus} />
                        </div>
                        {h.changedBy && (
                          <p className="text-xs mb-0.5 font-medium" style={{ color: "var(--foreground)" }}>
                            {h.changedBy.firstName} {h.changedBy.lastName}
                          </p>
                        )}
                        {h.reason && <p className="text-xs mb-0.5" style={{ color: "var(--muted-foreground)" }}>{h.reason}</p>}
                        <RelativeTime date={h.createdAt} />
                      </div>
                    </div>
                  ))}
                </div>
              </Section>
            )}

            {/* Tasks */}
            {(isManager || tasks.length > 0) && (
              <Section title={`المهام${tasks.length > 0 ? ` (${tasks.length})` : ""}`}>
                {/* My tasks banner for developers */}
                {myTasks.length > 0 && !isManager && (
                  <div className="mb-3 px-3 py-2 rounded-lg text-sm font-medium"
                    style={{ background: "rgba(79,70,229,0.08)", color: "#4F46E5", border: "1px solid rgba(79,70,229,0.18)" }}>
                    لديك {myTasks.length} مهمة مكلَّف بها
                  </div>
                )}

                {/* Task list */}
                <div className="space-y-2 mb-3">
                  {tasks.length === 0 ? (
                    <p className="font-brm text-xs text-center py-3" style={{ color: "var(--muted-foreground)" }}>$ no tasks yet_</p>
                  ) : (
                    (tasksExpanded ? tasks : tasks.slice(0, 4)).map((t: any) => {
                      const isAssignee = t.assignedTo?.id === user?.id;
                      const statusColor = t.status === "COMPLETED" ? "#059669" : t.status === "IN_PROGRESS" ? "#D97706" : "#6B7280";
                      const statusLabel = t.status === "COMPLETED" ? "مكتملة" : t.status === "IN_PROGRESS" ? "جارٍ" : "جديدة";
                      return (
                        <div key={t.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors group"
                          style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
                          {/* Status toggle for assignee/manager */}
                          {(isAssignee || isManager) ? (
                            <button
                              onClick={() => {
                                const next = t.status === "NEW" ? "IN_PROGRESS" : t.status === "IN_PROGRESS" ? "COMPLETED" : "NEW";
                                updateTaskStatus(t.id, next);
                              }}
                              className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 transition-colors"
                              style={{ borderColor: statusColor, background: t.status === "COMPLETED" ? statusColor : "transparent" }}
                              title="تغيير الحالة">
                              {t.status === "COMPLETED" && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                              {t.status === "IN_PROGRESS" && <div className="w-2 h-2 rounded-full" style={{ background: statusColor }} />}
                            </button>
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0"
                              style={{ borderColor: statusColor, background: t.status === "COMPLETED" ? statusColor : "transparent" }}>
                              {t.status === "COMPLETED" && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug" style={{
                              color: "var(--foreground)",
                              textDecoration: t.status === "DONE" ? "line-through" : "none",
                              opacity: t.status === "DONE" ? 0.6 : 1,
                            }}>{t.title}</p>
                            {t.description && (
                              <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{t.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium"
                                style={{ background: `${statusColor}18`, color: statusColor }}>
                                {statusLabel}
                              </span>
                              <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                                {t.assignedTo?.firstName} {t.assignedTo?.lastName}
                              </span>
                            </div>
                            {/* Task attachments */}
                            {(t.attachments ?? []).length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {(t.attachments as any[]).filter(a => isImg(a.mimeType)).map((a: any) => (
                                  <button key={a.id} onClick={() => openAttachment(a.id)}>
                                    <AttachmentImage attachmentId={a.id} alt={a.fileName}
                                      className="w-14 h-11 object-cover rounded-lg hover:opacity-90 transition-opacity"
                                      style={{ border: "1px solid var(--border)" }} />
                                  </button>
                                ))}
                                {(t.attachments as any[]).filter(a => !isImg(a.mimeType)).map((a: any) => (
                                  <button key={a.id} onClick={() => downloadAttachment(a.id, a.fileName)}
                                    className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-colors"
                                    style={{ background: "var(--card)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "#4F46E5")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
                                    <FileText className="w-3 h-3 shrink-0" />
                                    <span className="truncate max-w-28">{a.fileName}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {isManager && (
                            <button onClick={() => deleteTask(t.id)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-red-100 hover:text-red-500"
                              style={{ color: "var(--muted-foreground)" }}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {tasks.length > 4 && (
                  <button onClick={() => setTasksExpanded(e => !e)}
                    className="w-full text-xs font-medium py-1.5 rounded-lg transition-colors mb-3"
                    style={{ color: "#4F46E5", background: "rgba(79,70,229,0.06)" }}>
                    {tasksExpanded ? "عرض أقل" : `عرض كل المهام (${tasks.length})`}
                  </button>
                )}

                {/* Create task form — managers only */}
                {isManager && (
                  taskForm ? (
                    <div className="space-y-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                      <Select
                        value={newTask.assignedToId || null}
                        onValueChange={(v: string | null) => setNewTask(p => ({ ...p, assignedToId: v ?? "" }))}
                        items={[
                          { value: null, label: SELECT_PLACEHOLDERS.developer },
                          ...developerList.map((u: any) => ({ value: u.id, label: `${u.firstName} ${u.lastName}` })),
                        ]}
                      >
                        <SelectTrigger className="w-full h-9 text-sm" aria-label={SELECT_PLACEHOLDERS.developer}>
                          <SelectValue placeholder={SELECT_PLACEHOLDERS.developer} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={null}>{SELECT_PLACEHOLDERS.developer}</SelectItem>
                          {developerList.map((u: any) => (
                            <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <input
                        value={newTask.title}
                        onChange={e => setNewTask(p => ({ ...p, title: e.target.value }))}
                        placeholder="عنوان المهمة"
                        className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                        style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                        onFocus={e => (e.target.style.borderColor = "#4F46E5")}
                        onBlur={e => (e.target.style.borderColor = "var(--border)")}
                      />
                      <textarea
                        value={newTask.description}
                        onChange={e => setNewTask(p => ({ ...p, description: e.target.value }))}
                        placeholder="وصف المهمة (اختياري)"
                        rows={2}
                        className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                        style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                        onFocus={e => (e.target.style.borderColor = "#4F46E5")}
                        onBlur={e => (e.target.style.borderColor = "var(--border)")}
                      />
                      <input
                        type="date"
                        value={newTask.dueDate || (ticket.estimatedDeadline ? ticket.estimatedDeadline.slice(0, 10) : "")}
                        onChange={e => setNewTask(p => ({ ...p, dueDate: e.target.value }))}
                        className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                        style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                        onFocus={e => (e.target.style.borderColor = "#4F46E5")}
                        onBlur={e => (e.target.style.borderColor = "var(--border)")}
                      />

                      {/* Task file attachments */}
                      <input ref={taskFileRef} type="file" multiple className="hidden"
                        onChange={e => { setTaskFiles(prev => [...prev, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
                      {taskFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {taskFiles.map((f, i) => (
                            f.type.startsWith("image/") ? (
                              <div key={i} className="relative group">
                                <img src={URL.createObjectURL(f)} alt={f.name}
                                  className="w-14 h-12 object-cover rounded-lg"
                                  style={{ border: "1px solid var(--border)" }} />
                                <button onClick={() => setTaskFiles(prev => prev.filter((_, idx) => idx !== i))}
                                  className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white"
                                  style={{ background: "#EF4444" }}>
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </div>
                            ) : (
                              <div key={i} className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs"
                                style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                                <FileText className="w-3 h-3 shrink-0" style={{ color: "#4F46E5" }} />
                                <span className="truncate max-w-24">{f.name}</span>
                                <button onClick={() => setTaskFiles(prev => prev.filter((_, idx) => idx !== i))}
                                  className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                              </div>
                            )
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button onClick={() => taskFileRef.current?.click()}
                          className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium transition-colors"
                          style={{ color: "var(--muted-foreground)", border: "1px solid var(--border)", background: "var(--muted)" }}
                          onMouseEnter={e => (e.currentTarget.style.color = "#4F46E5")}
                          onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
                          <Paperclip className="w-3.5 h-3.5" /> مرفق
                        </button>
                        <button onClick={createTask} disabled={savingTask || !newTask.title.trim() || !newTask.assignedToId}
                          className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg, #4F46E5, #6C5CE7)" }}>
                          {savingTask ? "جارٍ الرفع..." : "إنشاء"}
                        </button>
                        <button onClick={() => { setTaskForm(false); setNewTask({ title: "", description: "", assignedToId: "", dueDate: "" }); setTaskFiles([]); }}
                          className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                          style={{ color: "var(--muted-foreground)", background: "var(--muted)" }}>
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setTaskForm(true)}
                      className="mt-1 flex items-center gap-1.5 text-xs font-semibold transition-colors"
                      style={{ color: "#4F46E5" }}>
                      <Plus className="w-3.5 h-3.5" /> إضافة مهمة
                    </button>
                  )
                )}
              </Section>
            )}

            {/* Comments */}
            <Section title={`${COMMENT_LABELS.sectionTitle}${ticket.comments?.length ? ` · ${ticket.comments.length}` : ""}`}>
              <CommentThread
                ticketId={id}
                comments={ticket.comments ?? []}
                users={mentionableUsers}
                currentUserId={user?.id}
                currentUserName={[user?.firstName, user?.lastName].filter(Boolean).join(" ")}
                canPostInternal={canPostInternal}
                onOpenImage={setLightboxUrl}
              />
            </Section>
          </div>

          {/* ── Sidebar ── */}
          <div className={desktopSidebarClosed ? "lg:hidden" : ""}>

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileSidebarOpen(o => !o)}
              className="lg:hidden w-full flex items-center justify-between px-4 py-3 rounded-xl mb-1 transition-colors"
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
              <span className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
                <CodeComment>التفاصيل والإجراءات</CodeComment>
              </span>
              <ChevronDown className="w-4 h-4 transition-transform duration-200" style={{
                color: "var(--muted-foreground)",
                transform: mobileSidebarOpen ? "rotate(180deg)" : "rotate(0deg)",
              }} />
            </button>

            {/* Desktop close button */}
            <div className="hidden lg:flex justify-end mb-1">
              <button onClick={() => setDesktopSidebarClosed(true)}
                className="flex items-center gap-1 text-xs font-medium transition-colors"
                style={{ color: "var(--muted-foreground)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--foreground)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
                إخفاء <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Collapsible content: hidden on mobile by default, always visible on desktop */}
            <div className={`space-y-4 lg:block ${mobileSidebarOpen ? "block" : "hidden"}`}>

            {/* Ticket info */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              {[
                { icon: User,    label: ticket.creatorId === user?.id ? "أنت" : `${ticket.creator?.firstName} ${ticket.creator?.lastName}`, field: "طالب التذكرة" },
                { icon: Monitor, label: ticket.system?.name, field: "النظام" },
                { icon: Clock,   label: format(new Date(ticket.createdAt), "d MMM yyyy", { locale: ar }), field: "تاريخ الإنشاء" },
                ...(ticket.estimatedDeadline ? [{ icon: Clock, label: `التسليم: ${format(new Date(ticket.estimatedDeadline), "d MMM yyyy", { locale: ar })}`, field: "تاريخ التسليم المتوقع" }] : []),
              ].map(({ icon: Icon, label, field }, i) => label && (
                <div key={i} className="flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  <span title={field} aria-label={field} className="shrink-0 cursor-help">
                    <Icon className="w-3.5 h-3.5" aria-hidden />
                  </span>
                  <span>{label}</span>
                </div>
              ))}
              {ticket.company && (
                <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  <span title="الشركة" aria-label="الشركة" className="shrink-0 cursor-help">
                    <CompanyLogo company={ticket.company} size="xs" />
                  </span>
                  <span>{ticket.company.name}</span>
                </div>
              )}
              {assignedDev && (
                <div className="flex items-center gap-2 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
                  <div title={assignedDevLabel} aria-label={assignedDevLabel}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-indigo-300 cursor-help"
                    style={{ background: "rgba(79,70,229,0.18)" }}>
                    {assignedDev.firstName?.[0]}
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>المطور المُكلَّف</p>
                    <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                      {assignedDevName}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="font-brm text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
                <CodeComment>الإجراءات</CodeComment>
              </p>

              {ticket.status === "DRAFT" && ticket.creatorId === user?.id && (
                <ActionBtn onClick={() => actions.submit.mutate(undefined)} disabled={actions.submit.isPending}>
                  {actions.submit.isPending ? <><Spinner />جارٍ الإرسال...</> : "إرسال للمراجعة"}
                </ActionBtn>
              )}

              {ticket.status === "AWAITING_INFO" && ticket.creatorId === user?.id && (
                <div>
                  <div className="flex items-start gap-2 p-3 rounded-xl mb-3"
                    style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)" }}>
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs leading-relaxed" style={{ color: "#B45309" }}>
                        طُلبت منك معلومات إضافية. يمكنك تعديل التذكرة ثم إعادة إرسالها للمراجعة.
                      </p>
                      <p className="font-brm text-xs mt-1" style={{ color: "#92400E" }}>
                        <CodeComment>راجع التعليقات للاطلاع على التفاصيل المطلوبة</CodeComment>
                      </p>
                    </div>
                  </div>
                  <ActionBtn onClick={() => actions.submit.mutate(undefined)} disabled={actions.submit.isPending}>
                    {actions.submit.isPending ? <><Spinner />جارٍ الإرسال...</> : "إعادة الإرسال للمراجعة"}
                  </ActionBtn>
                </div>
              )}

              {ticket.status === "NEW" && canApprove && (
                <>
                  <textarea value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)}
                    placeholder="ملاحظات (اختياري)" rows={2}
                    className="w-full rounded-xl px-3 py-2 text-xs outline-none resize-none"
                    style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
                  <p className="font-brm text-xs mb-2" style={{ color: "var(--muted-foreground)" }}>
                    <CodeComment>ستُنشر الملاحظات كتعليق على التذكرة</CodeComment>
                  </p>
                  <ActionBtn onClick={() => actions.approve.mutate({ decision: "APPROVED", notes: approvalNotes })} disabled={actions.approve.isPending}>
                    {actions.approve.isPending ? <><Spinner />جارٍ الاعتماد...</> : "اعتماد"}
                  </ActionBtn>
                  <ActionBtn variant="outline" onClick={() => actions.approve.mutate({ decision: "NEEDS_INFO", notes: approvalNotes })} disabled={actions.approve.isPending}>
                    {actions.approve.isPending ? <><Spinner />جارٍ الإرسال...</> : "طلب معلومات"}
                  </ActionBtn>
                  <ActionBtn variant="danger" onClick={() => actions.approve.mutate({ decision: "REJECTED", notes: approvalNotes })} disabled={actions.approve.isPending}>
                    {actions.approve.isPending ? <><Spinner />جارٍ الرفض...</> : "رفض"}
                  </ActionBtn>
                </>
              )}

              {ticket.status === "APPROVED" && canAssign && (
                assignForm ? (
                  <div className="space-y-2">
                    <Select
                      value={assignDevId || null}
                      onValueChange={v => setAssignDevId(v ?? "")}
                      items={[
                        { value: null, label: SELECT_PLACEHOLDERS.developer },
                        ...developerList.map((d: any) => ({ value: d.id, label: `${d.firstName} ${d.lastName}` })),
                      ]}
                    >
                      <SelectTrigger className="w-full h-9 text-xs" aria-label={SELECT_PLACEHOLDERS.developer}>
                        <SelectValue placeholder={SELECT_PLACEHOLDERS.developer} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={null}>{SELECT_PLACEHOLDERS.developer}</SelectItem>
                        {developerList.map((d: any) => (
                          <SelectItem key={d.id} value={d.id}>{d.firstName} {d.lastName}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div>
                      <p className="font-brm text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>تاريخ البدء</p>
                      <input type="date" value={assignStartDate} onChange={e => setAssignStartDate(e.target.value)}
                        className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                        style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                        onFocus={e => (e.target.style.borderColor = "#4F46E5")}
                        onBlur={e => (e.target.style.borderColor = "var(--border)")} />
                    </div>
                    <div>
                      <p className="font-brm text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>تاريخ التسليم المتوقع <span style={{ color: "#EF4444" }}>*</span></p>
                      <input type="date" value={assignDeadline} onChange={e => setAssignDeadline(e.target.value)}
                        className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                        style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                        onFocus={e => (e.target.style.borderColor = "#4F46E5")}
                        onBlur={e => (e.target.style.borderColor = "var(--border)")} />
                    </div>
                    <div>
                      <p className="font-brm text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>الساعات المقدّرة</p>
                      <input type="number" min="1" value={assignHours} onChange={e => setAssignHours(e.target.value)}
                        placeholder="مثال: 8"
                        className="w-full rounded-xl px-3 py-2 text-xs outline-none"
                        style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                        onFocus={e => (e.target.style.borderColor = "#4F46E5")}
                        onBlur={e => (e.target.style.borderColor = "var(--border)")} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <ActionBtn
                        onClick={() => {
                          if (!assignDevId || !assignDeadline) return;
                          actions.assign.mutate({
                            developerId: assignDevId,
                            estimatedDeadline: assignDeadline,
                            ...(assignStartDate ? { startDate: assignStartDate } : {}),
                            ...(assignHours ? { estimatedHours: parseInt(assignHours) } : {}),
                          });
                          setAssignForm(false); setAssignDevId(""); setAssignDeadline(""); setAssignStartDate(""); setAssignHours("");
                        }}
                        disabled={!assignDevId || !assignDeadline || actions.assign.isPending}>
                        {actions.assign.isPending ? <><Spinner />جارٍ الإسناد...</> : "جدولة وإسناد"}
                      </ActionBtn>
                      <button onClick={() => { setAssignForm(false); setAssignDevId(""); setAssignDeadline(""); setAssignStartDate(""); setAssignHours(""); }}
                        className="px-3 py-2.5 rounded-xl text-xs font-medium transition-all"
                        style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
                        إلغاء
                      </button>
                    </div>
                  </div>
                ) : (
                  <ActionBtn onClick={() => setAssignForm(true)}>إسناد وجدولة</ActionBtn>
                )
              )}

              {ticket.status === "SCHEDULED" && isDeveloper && (
                <ActionBtn onClick={() => actions.startWork.mutate(undefined)} disabled={actions.startWork.isPending}>
                  {actions.startWork.isPending ? <><Spinner />جارٍ التحديث...</> : "بدء العمل"}
                </ActionBtn>
              )}
              {ticket.status === "IN_PROGRESS" && isDeveloper && (
                <ActionBtn onClick={() => actions.submitForTesting.mutate(undefined)} disabled={actions.submitForTesting.isPending}>
                  {actions.submitForTesting.isPending ? <><Spinner />جارٍ الإرسال...</> : "إرسال للاختبار"}
                </ActionBtn>
              )}
              {((ticket.status === "AWAITING_TESTING" && canVerifyTesting) || (ticket.status === "AWAITING_OWNER_APPROVAL" && canAcceptDelivery)) && (
                <ActionBtn onClick={() => actions.approveCompletion.mutate(undefined)} disabled={actions.approveCompletion.isPending}>
                  {actions.approveCompletion.isPending ? <><Spinner />جارٍ الاعتماد...</> : "اعتماد الإكمال"}
                </ActionBtn>
              )}
              {ticket.status === "COMPLETED" && canClose && (
                <>
                  <textarea value={closureNotes} onChange={e => setClosureNotes(e.target.value)}
                    placeholder="ملاحظات الإغلاق *" rows={2}
                    className="w-full rounded-xl px-3 py-2 text-xs outline-none resize-none mb-2"
                    style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
                  <ActionBtn onClick={() => actions.close.mutate({ closureNotes })} disabled={!closureNotes.trim() || actions.close.isPending}>
                    {actions.close.isPending ? <><Spinner />جارٍ الإغلاق...</> : "إغلاق التذكرة"}
                  </ActionBtn>
                </>
              )}
              {["CLOSED", "REJECTED"].includes(ticket.status) && canReopen && (
                <ActionBtn variant="outline" onClick={() => actions.reopen.mutate(undefined)} disabled={actions.reopen.isPending}>
                  {actions.reopen.isPending ? <><Spinner />جارٍ الفتح...</> : "إعادة الفتح"}
                </ActionBtn>
              )}
              {canArchive && !ticket.isArchived && (
                confirmArchive ? (
                  <div className="flex gap-2">
                    <button
                      onClick={() => { actions.archive.mutate(undefined); setConfirmArchive(false); }}
                      disabled={actions.archive.isPending}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                      style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}
                    >
                      {actions.archive.isPending ? <><Spinner />جارٍ الأرشفة...</> : "تأكيد"}
                    </button>
                    <button
                      onClick={() => setConfirmArchive(false)}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                      style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
                    >
                      إلغاء
                    </button>
                  </div>
                ) : (
                  <ActionBtn variant="ghost" onClick={() => setConfirmArchive(true)}>أرشفة</ActionBtn>
                )
              )}
              {canArchive && ticket.isArchived && (
                <ActionBtn
                  variant="outline"
                  onClick={() => actions.unarchive.mutate(undefined)}
                  disabled={actions.unarchive.isPending}
                >
                  {actions.unarchive.isPending ? <><Spinner />جارٍ التراجع...</> : "إلغاء الأرشفة"}
                </ActionBtn>
              )}

              {/* Force status — project manager and above */}
              {canForceStatus && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 4 }}>
                  <button
                    onClick={() => setForceStatusOpen(o => !o)}
                    className="w-full flex items-center justify-between text-xs font-semibold transition-colors"
                    style={{ color: "var(--muted-foreground)" }}>
                    <span className="font-brm">
                      <CodeComment>تغيير الحالة يدوياً</CodeComment>
                    </span>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{forceStatusOpen ? "−" : "+"}</span>
                  </button>

                  {forceStatusOpen && (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-1.5">
                        {([
                          { val: "NEW",                     label: "جديدة" },
                          { val: "AWAITING_INFO",           label: "ينتظر معلومات" },
                          { val: "AWAITING_APPROVAL",       label: "ينتظر موافقة" },
                          { val: "APPROVED",                label: "معتمدة" },
                          { val: "REJECTED",                label: "مرفوضة" },
                          { val: "SCHEDULED",               label: "مجدولة" },
                          { val: "IN_PROGRESS",             label: "قيد التنفيذ" },
                          { val: "AWAITING_TESTING",        label: "ينتظر اختبار" },
                          { val: "AWAITING_OWNER_APPROVAL", label: "موافقة المالك" },
                          { val: "COMPLETED",               label: "مكتملة" },
                          { val: "CLOSED",                  label: "مغلقة" },
                          { val: "ON_HOLD",                 label: "معلقة" },
                          { val: "DRAFT",                   label: "مسودة" },
                        ] as const).map(({ val, label }) => {
                          const isCurrent = ticket.status === val;
                          return (
                            <button
                              key={val}
                              disabled={isCurrent || actions.forceStatus.isPending}
                              onClick={() => actions.forceStatus.mutate({ status: val, reason: forceStatusReason || undefined })}
                              className="py-1.5 px-2 rounded-lg text-xs font-medium transition-all disabled:cursor-default"
                              style={{
                                background: isCurrent ? "rgba(79,70,229,0.15)" : "var(--muted)",
                                color: isCurrent ? "#4F46E5" : "var(--foreground)",
                                border: isCurrent ? "1px solid rgba(79,70,229,0.4)" : "1px solid var(--border)",
                                opacity: isCurrent ? 1 : undefined,
                              }}
                              onMouseEnter={e => { if (!isCurrent) e.currentTarget.style.borderColor = "#4F46E5"; }}
                              onMouseLeave={e => { if (!isCurrent) e.currentTarget.style.borderColor = "var(--border)"; }}
                            >
                              {isCurrent && <span style={{ marginLeft: 3 }}>●</span>} {label}
                            </button>
                          );
                        })}
                      </div>
                      <textarea
                        value={forceStatusReason}
                        onChange={e => setForceStatusReason(e.target.value)}
                        placeholder="سبب التغيير (اختياري)"
                        rows={2}
                        className="w-full rounded-xl px-3 py-2 text-xs outline-none resize-none"
                        style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                        onFocus={e => (e.target.style.borderColor = "#4F46E5")}
                        onBlur={e => (e.target.style.borderColor = "var(--border)")}
                      />
                      {actions.forceStatus.isPending && (
                        <p className="text-xs text-center font-brm" style={{ color: "var(--muted-foreground)" }}>
                          <Spinner /> جارٍ التغيير...
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            </div>{/* end collapsible content */}
          </div>{/* end sidebar */}
        </div>
      </div>
    </AppShell>

    {lightboxUrl && (
      <LightboxViewer
        url={lightboxUrl}
        onClose={() => setLightboxUrl(null)}
      />
    )}

    {confirmDeleteId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
        <div className="rounded-2xl p-6 max-w-sm w-full space-y-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <p className="font-semibold text-sm" style={{ color: "var(--foreground)" }}>هل أنت متأكد من حذف هذا المرفق؟</p>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex gap-3">
            <button onClick={() => handleDeleteAttachment(confirmDeleteId)}
              className="flex-1 py-2 rounded-xl text-sm font-semibold"
              style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}>
              حذف
            </button>
            <button onClick={() => setConfirmDeleteId(null)}
              className="flex-1 py-2 rounded-xl text-sm font-semibold"
              style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
              إلغاء
            </button>
          </div>
        </div>
      </div>
    )}

    </>
  );
}
