"use client";
import { use, useRef, useState, useEffect, useCallback, useReducer } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { SkeletonList } from "@/components/shared/LoadingSpinner";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { useTicket, useTicketAction, useAddComment } from "@/hooks/useTickets";
import { useAuthStore } from "@/store/auth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TICKET_TYPE_LABELS } from "@/lib/constants";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  ArrowRight, Send, Clock, User, Building2, Monitor, Lock,
  Paperclip, FileText, Trash2, Download, Copy, Check, AlertTriangle, X, AtSign,
} from "lucide-react";
import api from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
const FILE_BASE = API_BASE.replace("/api", "");

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
}
const isImg = (t: string) => t.startsWith("image/");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
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
      <p className="font-brm text-xs mb-1.5" style={{ color: "var(--muted-foreground)" }}>// {label}</p>
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
      <button onClick={onClose}
        style={{
          position: "absolute", top: 16, right: 16, zIndex: 1,
          width: 36, height: 36, borderRadius: "50%",
          background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.12)",
          color: "#fff", cursor: "pointer", fontSize: 20, lineHeight: 1,
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.1s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.18)")}
        onMouseLeave={e => (e.currentTarget.style.background = "rgba(255,255,255,0.08)")}
        title="إغلاق (Esc)">
        ×
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

function renderContent(content: string, mentionedUsers: any[]) {
  if (!mentionedUsers.length) return <span className="whitespace-pre-wrap">{content}</span>;
  const parts: React.ReactNode[] = [];
  let last = 0;
  const regex = /@(\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(content)) !== null) {
    if (m.index > last) parts.push(content.slice(last, m.index));
    const handle = m[1];
    const matched = mentionedUsers.find(
      u => `${u.firstName}${u.lastName}`.replace(/\s/g, "").toLowerCase() === handle.toLowerCase() ||
           `${u.firstName}_${u.lastName}`.toLowerCase() === handle.toLowerCase()
    );
    if (matched) {
      parts.push(
        <span key={m.index} className="font-semibold" style={{ color: "#4F46E5" }}>@{handle}</span>
      );
    } else {
      parts.push(m[0]);
    }
    last = m.index + m[0].length;
  }
  if (last < content.length) parts.push(content.slice(last));
  return <span className="whitespace-pre-wrap">{parts}</span>;
}

export default function TicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useAuthStore();
  const qc = useQueryClient();
  const { data: ticket, isLoading } = useTicket(id);
  const actions = useTicketAction(id);
  const { mutateAsync: addComment } = useAddComment(id);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [commentVisibility, setCommentVisibility] = useState("PUBLIC");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [closureNotes, setClosureNotes] = useState("");
  const [uploading, setUploading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionStart, setMentionStart] = useState(0);
  const [selectedMentions, setSelectedMentions] = useState<any[]>([]);
  const attachInputRef = useRef<HTMLInputElement>(null);
  const commentFileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { data: allUsers } = useQuery({
    queryKey: ["users-list"],
    queryFn: () => api.get("/users").then(r => r.data),
    staleTime: 60_000,
  });
  const userList: any[] = allUsers ?? [];

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
  const developerList: any[] = (systemData?.userSystems ?? [])
    .filter((us: any) => us.user?.role === "DEVELOPER" && us.user?.isActive !== false)
    .map((us: any) => us.user);

  const [taskForm, setTaskForm] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", description: "", assignedToId: "" });
  const [savingTask, setSavingTask] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(false);

  const createTask = async () => {
    if (!newTask.title.trim() || !newTask.assignedToId) return;
    setSavingTask(true);
    try {
      await api.post(`/tickets/${id}/tasks`, newTask);
      setNewTask({ title: "", description: "", assignedToId: "" });
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

  const filteredMentions = mentionQuery !== null
    ? userList.filter(u =>
        `${u.firstName} ${u.lastName}`.toLowerCase().includes(mentionQuery.toLowerCase()) ||
        u.email?.toLowerCase().includes(mentionQuery.toLowerCase())
      ).slice(0, 6)
    : [];

  const handleCommentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setComment(val);
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    if (atIdx !== -1 && !before.slice(atIdx + 1).includes(" ")) {
      setMentionQuery(before.slice(atIdx + 1));
      setMentionStart(atIdx);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (u: any) => {
    const handle = `${u.firstName}${u.lastName}`;
    const before = comment.slice(0, mentionStart);
    const after = comment.slice(textareaRef.current?.selectionStart ?? comment.length);
    const newVal = `${before}@${handle} ${after}`;
    setComment(newVal);
    setMentionQuery(null);
    if (!selectedMentions.find(m => m.id === u.id)) {
      setSelectedMentions(prev => [...prev, u]);
    }
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const removeMention = (uid: string) => {
    setSelectedMentions(prev => prev.filter(m => m.id !== uid));
  };

  const copyBrmId = (s: string) => {
    navigator.clipboard.writeText(s).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const isHead     = user?.role === "PROGRAMMING_HEAD";
  const isManager  = user?.role === "PROJECT_MANAGER" || isHead;
  const isDeveloper = user?.role === "DEVELOPER";
  const isQA       = user?.role === "QA";
  const isRequester = user?.role === "TICKET_REQUESTER";

  const handleComment = async () => {
    if (!comment.trim() && !pendingFiles.length) return;
    const newComment = await addComment({
      content: comment,
      visibility: commentVisibility,
      mentions: selectedMentions.map(m => m.id),
    });
    const commentId = newComment?.id;
    if (pendingFiles.length && commentId) {
      setUploading(true);
      try {
        for (const file of pendingFiles) {
          const form = new FormData();
          form.append("file", file);
          await api.post(`/attachments/upload?ticketId=${id}&commentId=${commentId}`, form, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        }
        qc.invalidateQueries({ queryKey: ["ticket", id] });
      } finally { setUploading(false); }
    }
    setComment("");
    setSelectedMentions([]);
    setPendingFiles([]);
    setMentionQuery(null);
  };

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
    await api.delete(`/attachments/${aid}`);
    qc.invalidateQueries({ queryKey: ["ticket", id] });
  };

  const addCommentFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setPendingFiles(prev => [...prev, ...files]);
    e.target.value = "";
  };

  if (isLoading) return <AppShell><SkeletonList count={4} /></AppShell>;
  if (!ticket)   return <AppShell><p className="text-sm" style={{ color: "var(--muted-foreground)" }}>التذكرة غير موجودة</p></AppShell>;

  const ticketAttachments = (ticket.attachments || []).filter((a: any) => !a.commentId);
  const imageAttachments  = ticketAttachments.filter((a: any) => isImg(a.mimeType));
  const fileAttachments   = ticketAttachments.filter((a: any) => !isImg(a.mimeType));
  const brmId = ticket.ticketNumber ? `BRM-${String(ticket.ticketNumber).padStart(4, "0")}` : null;

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
            {brmId && (
              <button onClick={() => copyBrmId(brmId)}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg font-brm text-sm font-semibold transition-all"
                style={{ background: "rgba(79,70,229,0.1)", color: "#4F46E5", border: "1px solid rgba(79,70,229,0.2)" }}
                title="نسخ الرقم">
                {brmId}
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3 opacity-50" />}
              </button>
            )}
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.finalPriority || ticket.priority} />
            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              {TICKET_TYPE_LABELS[ticket.type]}
            </span>
            <RelativeTime date={ticket.createdAt} />
          </div>
          <h1 className="text-xl font-bold leading-snug" style={{ color: "var(--foreground)" }}>{ticket.title}</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Main column ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Details */}
            <Section title="تفاصيل الطلب">
              <div className="space-y-5">
                <Field label="الوصف"><span className="whitespace-pre-wrap">{ticket.description}</span></Field>
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
                          onClick={() => setLightboxUrl(`${FILE_BASE}${att.url}`)}>
                          <img src={`${FILE_BASE}${att.url}`} alt={att.fileName} className="w-full h-full object-cover" />
                          <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-all" style={{ background: "rgba(0,0,0,0.45)" }}>
                            <button onClick={(e) => { e.stopPropagation(); setLightboxUrl(`${FILE_BASE}${att.url}`); }} className="p-1.5 rounded-full bg-white text-slate-700 hover:text-indigo-600" title="عرض">
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); handleDeleteAttachment(att.id); }} className="p-1.5 rounded-full bg-white text-slate-700 hover:text-red-600">
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
                            <a href={`${FILE_BASE}${att.url}`} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--muted-foreground)" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#4F46E5")}
                              onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
                              <Download className="w-4 h-4" />
                            </a>
                            <button onClick={() => handleDeleteAttachment(att.id)} className="p-1.5 rounded-lg transition-colors" style={{ color: "var(--muted-foreground)" }}
                              onMouseEnter={e => (e.currentTarget.style.color = "#EF4444")}
                              onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
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
                      const statusColor = t.status === "DONE" ? "#059669" : t.status === "IN_PROGRESS" ? "#D97706" : "#6B7280";
                      const statusLabel = t.status === "DONE" ? "منجز" : t.status === "IN_PROGRESS" ? "جارٍ" : "مفتوح";
                      return (
                        <div key={t.id} className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors group"
                          style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
                          {/* Status toggle for assignee/manager */}
                          {(isAssignee || isManager) ? (
                            <button
                              onClick={() => {
                                const next = t.status === "OPEN" ? "IN_PROGRESS" : t.status === "IN_PROGRESS" ? "DONE" : "OPEN";
                                updateTaskStatus(t.id, next);
                              }}
                              className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0 transition-colors"
                              style={{ borderColor: statusColor, background: t.status === "DONE" ? statusColor : "transparent" }}
                              title="تغيير الحالة">
                              {t.status === "DONE" && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
                              {t.status === "IN_PROGRESS" && <div className="w-2 h-2 rounded-full" style={{ background: statusColor }} />}
                            </button>
                          ) : (
                            <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 shrink-0"
                              style={{ borderColor: statusColor, background: t.status === "DONE" ? statusColor : "transparent" }}>
                              {t.status === "DONE" && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
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
                      <Select value={newTask.assignedToId} onValueChange={(v: string | null) => v && setNewTask(p => ({ ...p, assignedToId: v }))}>
                        <SelectTrigger className="w-full h-9 text-sm"><SelectValue placeholder="اختر المطور" /></SelectTrigger>
                        <SelectContent>
                          {developerList.map((u: any) => (
                            <SelectItem key={u.id} value={u.id}>{u.firstName} {u.lastName}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex gap-2">
                        <button onClick={createTask} disabled={savingTask || !newTask.title.trim() || !newTask.assignedToId}
                          className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg, #4F46E5, #6C5CE7)" }}>
                          {savingTask ? "جارٍ الحفظ..." : "إنشاء"}
                        </button>
                        <button onClick={() => { setTaskForm(false); setNewTask({ title: "", description: "", assignedToId: "" }); }}
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
                      <Check className="w-3.5 h-3.5" /> إضافة مهمة
                    </button>
                  )
                )}
              </Section>
            )}

            {/* Comments */}
            <Section title="التعليقات">
              <div className="space-y-5 mb-5">
                {ticket.comments?.length === 0 ? (
                  <p className="font-brm text-xs text-center py-4" style={{ color: "var(--muted-foreground)" }}>$ no comments yet_</p>
                ) : ticket.comments?.map((c: any) => {
                  const commentImgs = (c.attachments || []).filter((a: any) => isImg(a.mimeType));
                  const commentFiles = (c.attachments || []).filter((a: any) => !isImg(a.mimeType));
                  const mentionedInComment = (c.mentions || [])
                    .map((mid: string) => userList.find(u => u.id === mid))
                    .filter(Boolean);
                  return (
                    <div key={c.id} className="flex gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 text-indigo-300"
                        style={{ background: "rgba(79,70,229,0.18)" }}>
                        {c.author?.firstName?.[0]}{c.author?.lastName?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                            {c.author?.firstName} {c.author?.lastName}
                          </span>
                          {c.visibility === "INTERNAL" && (
                            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded"
                              style={{ background: "rgba(245,158,11,0.1)", color: "#B45309" }}>
                              <Lock className="w-3 h-3" /> داخلي
                            </span>
                          )}
                          <RelativeTime date={c.createdAt} />
                        </div>
                        <p className="text-sm leading-relaxed" style={{ color: "var(--foreground)" }}>
                          {renderContent(c.content, mentionedInComment)}
                        </p>
                        {/* Comment attachments */}
                        {commentImgs.length > 0 && (
                          <div className="grid grid-cols-3 gap-1.5 mt-2">
                            {commentImgs.map((att: any) => (
                              <button key={att.id} onClick={() => setLightboxUrl(`${FILE_BASE}${att.url}`)}
                                className="rounded-lg overflow-hidden aspect-video block w-full"
                                style={{ border: "1px solid var(--border)", cursor: "pointer" }}>
                                <img src={`${FILE_BASE}${att.url}`} alt={att.fileName}
                                  className="w-full h-full object-cover hover:opacity-90 transition-opacity" />
                              </button>
                            ))}
                          </div>
                        )}
                        {commentFiles.length > 0 && (
                          <div className="flex flex-col gap-1.5 mt-2">
                            {commentFiles.map((att: any) => (
                              <a key={att.id} href={`${FILE_BASE}${att.url}`} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
                                onMouseEnter={e => (e.currentTarget.style.color = "#4F46E5")}
                                onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
                                <FileText className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate max-w-48">{att.fileName}</span>
                                <span className="font-brm opacity-60 shrink-0">{formatBytes(att.fileSize)}</span>
                              </a>
                            ))}
                          </div>
                        )}
                        {/* Mentions pills */}
                        {mentionedInComment.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {mentionedInComment.map((u: any) => (
                              <span key={u.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                                style={{ background: "rgba(79,70,229,0.1)", color: "#4F46E5" }}>
                                <AtSign className="w-3 h-3" />{u.firstName} {u.lastName}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Comment form */}
              <div className="pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                {/* Mention chips */}
                {selectedMentions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {selectedMentions.map(m => (
                      <span key={m.id} className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full"
                        style={{ background: "rgba(79,70,229,0.1)", color: "#4F46E5", border: "1px solid rgba(79,70,229,0.2)" }}>
                        @{m.firstName}{m.lastName}
                        <button onClick={() => removeMention(m.id)} className="hover:text-red-500 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Textarea with mention dropdown */}
                <div className="relative">
                  <textarea
                    ref={textareaRef}
                    value={comment}
                    onChange={handleCommentChange}
                    placeholder="اكتب تعليقك... استخدم @ لذكر شخص"
                    rows={3}
                    className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none transition-all"
                    style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                    onFocus={e => (e.target.style.borderColor = "#4F46E5")}
                    onBlur={e => { setTimeout(() => setMentionQuery(null), 200); e.target.style.borderColor = "var(--border)"; }}
                  />
                  {mentionQuery !== null && filteredMentions.length > 0 && (
                    <div className="absolute bottom-full mb-1 right-0 left-0 z-50 rounded-xl overflow-hidden shadow-lg"
                      style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
                      {filteredMentions.map(u => (
                        <button key={u.id} onMouseDown={() => insertMention(u)}
                          className="w-full flex items-center gap-3 px-3 py-2 text-sm text-right transition-colors"
                          style={{ color: "var(--foreground)" }}
                          onMouseEnter={e => (e.currentTarget.style.background = "var(--muted)")}
                          onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: "rgba(79,70,229,0.18)", color: "#818CF8" }}>
                            {u.firstName?.[0]}{u.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium truncate">{u.firstName} {u.lastName}</p>
                            <p className="font-brm text-xs truncate" style={{ color: "var(--muted-foreground)" }}>{u.email}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Pending comment files preview */}
                {pendingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {pendingFiles.map((f, i) => (
                      <div key={i} className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                        style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                        <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "#4F46E5" }} />
                        <span className="truncate max-w-32">{f.name}</span>
                        <button onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                          className="hover:text-red-500 transition-colors">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-2">
                    {!isRequester && (
                      <Select value={commentVisibility} onValueChange={(v: string | null) => v && setCommentVisibility(v)}>
                        <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PUBLIC">عام</SelectItem>
                          <SelectItem value="INTERNAL">داخلي</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <input ref={commentFileRef} type="file" multiple className="hidden" onChange={addCommentFile} />
                    <button onClick={() => commentFileRef.current?.click()}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                      style={{ color: "var(--muted-foreground)", border: "1px solid var(--border)", background: "var(--muted)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "#4F46E5")}
                      onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
                      <Paperclip className="w-3.5 h-3.5" /> مرفق
                    </button>
                  </div>
                  <button onClick={handleComment} disabled={!comment.trim() && !pendingFiles.length}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "linear-gradient(135deg, #4F46E5, #6C5CE7)" }}>
                    {uploading ? "جارٍ الرفع..." : <><Send className="w-3.5 h-3.5" /> إرسال</>}
                  </button>
                </div>
              </div>
            </Section>
          </div>

          {/* ── Sidebar ── */}
          <div className="space-y-4">

            {/* Ticket info */}
            <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              {[
                { icon: User,     label: `${ticket.creator?.firstName} ${ticket.creator?.lastName}` },
                { icon: Building2, label: ticket.company?.name },
                { icon: Monitor,  label: ticket.system?.name },
                { icon: Clock,    label: format(new Date(ticket.createdAt), "d MMM yyyy", { locale: ar }) },
                ...(ticket.estimatedDeadline ? [{ icon: Clock, label: `التسليم: ${format(new Date(ticket.estimatedDeadline), "d MMM yyyy", { locale: ar })}` }] : []),
              ].map(({ icon: Icon, label }, i) => label && (
                <div key={i} className="flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{label}</span>
                </div>
              ))}
              {ticket.assignments?.[0]?.developer && (
                <div className="flex items-center gap-2 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-indigo-300"
                    style={{ background: "rgba(79,70,229,0.18)" }}>
                    {ticket.assignments[0].developer.firstName?.[0]}
                  </div>
                  <div>
                    <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>المطور المُكلَّف</p>
                    <p className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                      {ticket.assignments[0].developer.firstName} {ticket.assignments[0].developer.lastName}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="font-brm text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>// الإجراءات</p>

              {ticket.status === "DRAFT" && ticket.creatorId === user?.id && (
                <ActionBtn onClick={() => actions.submit.mutate(undefined)}>إرسال للمراجعة</ActionBtn>
              )}

              {ticket.status === "NEW" && isHead && (
                <>
                  <textarea value={approvalNotes} onChange={e => setApprovalNotes(e.target.value)}
                    placeholder="ملاحظات (اختياري)" rows={2}
                    className="w-full rounded-xl px-3 py-2 text-xs outline-none resize-none mb-2"
                    style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
                  <ActionBtn onClick={() => actions.approve.mutate({ decision: "APPROVED", notes: approvalNotes })}>اعتماد</ActionBtn>
                  <ActionBtn variant="outline" onClick={() => actions.approve.mutate({ decision: "NEEDS_INFO", notes: approvalNotes })}>طلب معلومات</ActionBtn>
                  <ActionBtn variant="danger" onClick={() => actions.approve.mutate({ decision: "REJECTED", notes: approvalNotes })}>رفض</ActionBtn>
                </>
              )}

              {ticket.status === "SCHEDULED" && isDeveloper && (
                <ActionBtn onClick={() => actions.startWork.mutate(undefined)}>بدء العمل</ActionBtn>
              )}
              {ticket.status === "IN_PROGRESS" && isDeveloper && (
                <ActionBtn onClick={() => actions.submitForTesting.mutate(undefined)}>إرسال للاختبار</ActionBtn>
              )}
              {(ticket.status === "AWAITING_TESTING" || ticket.status === "AWAITING_OWNER_APPROVAL") && (isQA || isRequester) && (
                <ActionBtn onClick={() => actions.approveCompletion.mutate(undefined)}>اعتماد الإكمال</ActionBtn>
              )}
              {ticket.status === "COMPLETED" && isManager && (
                <>
                  <textarea value={closureNotes} onChange={e => setClosureNotes(e.target.value)}
                    placeholder="ملاحظات الإغلاق *" rows={2}
                    className="w-full rounded-xl px-3 py-2 text-xs outline-none resize-none mb-2"
                    style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
                  <ActionBtn onClick={() => actions.close.mutate({ closureNotes })} disabled={!closureNotes.trim()}>إغلاق التذكرة</ActionBtn>
                </>
              )}
              {["CLOSED", "REJECTED"].includes(ticket.status) && isManager && (
                <ActionBtn variant="outline" onClick={() => actions.reopen.mutate(undefined)}>إعادة الفتح</ActionBtn>
              )}
              {isManager && (
                <ActionBtn variant="ghost" onClick={() => actions.archive.mutate(undefined)}>أرشفة</ActionBtn>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>

    {lightboxUrl && (
      <LightboxViewer
        url={lightboxUrl}
        onClose={() => setLightboxUrl(null)}
      />
    )}
    </>
  );
}
