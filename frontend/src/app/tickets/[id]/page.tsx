"use client";
import { use, useRef, useState, useEffect, useCallback, useReducer, Fragment } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/AppShell";
import { SkeletonTicketDetail } from "@/components/shared/LoadingSpinner";
import { StatusBadge, PriorityBadge } from "@/components/shared/StatusBadge";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { DueRemaining } from "@/components/shared/DueRemaining";
import { TicketTimeline } from "@/components/tickets/TicketTimeline";
import { useTaskActions, useTicketTasks } from "@/hooks/useTasks";
import { TicketAssignees } from "@/components/tickets/TicketAssignees";
import { TicketPlanPanel } from "@/components/tickets/TicketPlanPanel";
import { PauseReasonField, TicketBlockBanner, TicketBlockPanel } from "@/components/tickets/TicketBlockPanel";
import { TicketDependencies } from "@/components/tickets/TicketDependencies";
import { EstimateChip } from "@/components/tickets/EstimateChip";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import { TicketEstimateSummary } from "@/components/tickets/TicketEstimateSummary";
import { TicketCodeBadge } from "@/components/shared/TicketCodeBadge";
import { useTicket, useTicketAction, useTicketAssignees, useTicketDependencies } from "@/hooks/useTickets";
import { useMarkTicketRead } from "@/hooks/useNotifications";
import { useAuthStore } from "@/store/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { downloadAttachment, fetchAttachmentObjectUrl } from "@/lib/attachments";
import { AttachmentImage } from "@/components/shared/AttachmentImage";
import { FileDropZone } from "@/components/shared/FileDropZone";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserNameWithYou, personFullName } from "@/components/shared/UserNameWithYou";
import { BLOCK_LABELS, COMMENT_LABELS, DEPENDENCY_LABELS, DIFFICULTY_LABELS, ESTIMATE_LABELS, TASK_STATUS_COLORS, TASK_STATUS_LABELS, FORCE_STATUS_LABELS, SELECT_PLACEHOLDERS, TASK_LABELS, TICKET_ACTION_CONFIRM, TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, ASSIGNEE_LABELS, TESTING_LABELS } from "@/lib/constants";
import { canBlockTicket, canResumeTicket } from "@/lib/permissions";
import { formatAbsoluteTime, parseTimestamp } from "@/lib/dates";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import {
  ArrowRight, Clock, CalendarClock, User, Building2, Monitor, Lock,
  Paperclip, FileText, Trash2, Download, Check, AlertTriangle, X, Plus, Pencil, Eye, Loader2,
  ChevronDown, ChevronLeft, UserPlus, CircleCheck, Bug as BugIcon,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import api from "@/lib/api";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import { CodeComment } from "@/components/shared/CodeComment";
import { Markdown } from "@/components/shared/Markdown";
import { CommentThread } from "@/components/tickets/CommentThread";
import { TicketTestingHeaderActions, TicketTestingSection, ticketTestingAttentionCounts } from "@/components/testing/TicketTestingSection";
import { BugEditorDialog } from "@/components/testing/BugEditorDialog";
import { LinkSuiteDialog } from "@/components/testing/LinkSuiteDialog";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { useSuiteActions, useTicketTesting } from "@/hooks/useTestSuites";
import { useCaseActions } from "@/hooks/useTestCases";
import { useBugActions } from "@/hooks/useBugs";
import { formatBytes } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/lib/query-keys";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";
const FILE_BASE = API_BASE.replace("/api", "");

const isImg = (t: string) => t.startsWith("image/");

/**
 * A task's actual hours — plain wall clock between its two timestamps.
 *
 * Tasks have no status history, so unlike a ticket this cannot subtract time
 * spent blocked. It is an upper bound, and only shown once the task is done.
 */
function taskPersonName(
  person: { id?: string; firstName?: string; lastName?: string } | null | undefined,
) {
  return personFullName(person);
}

function taskActualHours(task: { startedAt?: string | null; completedAt?: string | null }): number | null {
  if (!task.startedAt || !task.completedAt) return null;
  const ms = Date.parse(task.completedAt) - Date.parse(task.startedAt);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return Math.round((ms / 3_600_000) * 10) / 10;
}

const PREREQUISITE_SATISFIED = ["COMPLETED", "CLOSED"];

function countUnmetBlockers(
  blockedBy: { type: string; blockingTicket?: { status: string } | null }[] | undefined,
): number {
  return (blockedBy ?? []).filter(
    (d) => d.type === "BLOCKS" && d.blockingTicket && !PREREQUISITE_SATISFIED.includes(d.blockingTicket.status),
  ).length;
}

function joinTaskMeta(parts: React.ReactNode[]) {
  const visible = parts.filter(Boolean);
  if (!visible.length) return null;
  return (
    <span className="flex min-w-0 flex-col gap-1 text-xs leading-snug max-sm:leading-snug sm:inline-flex sm:flex-row sm:flex-wrap sm:items-center sm:leading-none">
      {visible.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span className="hidden px-1 opacity-50 select-none sm:inline" aria-hidden>
              ·
            </span>
          )}
          <span className="inline-flex min-w-0 items-center">{part}</span>
        </Fragment>
      ))}
    </span>
  );
}

function TaskAttributionLine({
  icon: Icon,
  iconColor,
  label,
  person,
  currentUserId,
  dateTime,
}: {
  icon: LucideIcon;
  iconColor: string;
  label: string;
  person?: { id?: string; firstName?: string; lastName?: string } | null;
  currentUserId?: string;
  dateTime?: string | null;
}) {
  if (!person && !dateTime) return null;
  return (
    <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
      <span
        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md"
        style={{ background: `${iconColor}18`, color: iconColor }}
        aria-label={label}
        title={label}
      >
        <Icon className="h-3 w-3" aria-hidden />
      </span>
      <span className="inline-flex min-w-0 max-sm:flex-col max-sm:items-start max-sm:gap-0.5 sm:flex-wrap sm:items-center sm:gap-1">
        {person && (
          <UserNameWithYou person={person} currentUserId={currentUserId} nameClassName="break-words" />
        )}
        {dateTime && (
          <>
            <span className="hidden opacity-50 select-none sm:inline" aria-hidden>·</span>
            <time dateTime={dateTime} className="font-brm max-sm:text-[11px]">
              {formatAbsoluteTime(dateTime)}
            </time>
          </>
        )}
      </span>
    </p>
  );
}

function todayDateInput() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function dateInputValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 10);
}

function emptyTaskDraft() {
  return { title: "", description: "", assignedToId: "", dueDate: todayDateInput(), estimatedHours: "", difficultyLevel: "" };
}

function taskToDraft(task: {
  title?: string;
  description?: string | null;
  assignedTo?: { id?: string } | null;
  dueDate?: string | null;
  estimatedHours?: number | null;
  difficultyLevel?: number | null;
}) {
  return {
    title: task.title ?? "",
    description: task.description ?? "",
    assignedToId: task.assignedTo?.id ?? "",
    dueDate: dateInputValue(task.dueDate) || todayDateInput(),
    estimatedHours: task.estimatedHours != null ? String(task.estimatedHours) : "",
    difficultyLevel: task.difficultyLevel != null ? String(task.difficultyLevel) : "",
  };
}

/** When the ticket was handed to QA — first move into AWAITING_TESTING. */
function ticketDevHandoff(ticket: {
  statusHistory?: Array<{
    toStatus?: string;
    createdAt?: string;
    changedBy?: { id?: string; firstName?: string; lastName?: string } | null;
  }>;
}) {
  const hit = ticket.statusHistory?.find((h) => h.toStatus === "AWAITING_TESTING");
  if (!hit?.createdAt) return null;
  return { at: hit.createdAt, changedBy: hit.changedBy ?? null };
}

function Section({
  title,
  actions,
  children,
}: {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-xl overflow-visible" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      {/* Stack title + actions on narrow screens — long RTL action rows must not
          squeeze the section label (ticket testing buttons are the worst case). */}
      <div
        className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-3 sm:gap-y-2 sm:px-5 sm:py-3.5"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <h3 className="min-w-0 font-semibold text-sm" style={{ color: "var(--foreground)" }}>{title}</h3>
        {actions ? (
          <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
            {actions}
          </div>
        ) : null}
      </div>
      <div className="min-w-0 p-4 sm:p-5">{children}</div>
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

function MetaChip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex h-6 items-center gap-1.5 text-xs px-2.5 rounded-full font-medium leading-4"
      title={label}
      aria-label={label}
      style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
    >
      {children}
    </span>
  );
}

function SidebarMeta({
  field,
  icon,
  children,
}: {
  field: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
      <span title={field} aria-label={field} className="shrink-0 cursor-help">
        {icon}
      </span>
      <span>{children}</span>
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
    <button type="button" onClick={onClick} disabled={disabled}
      className="w-full py-2.5 rounded-xl text-sm font-semibold transition-all cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      style={styles[variant]}>
      {children}
    </button>
  );
}

function Spinner() {
  return <Loader2 className="w-3.5 h-3.5 animate-spin inline-block ml-1" />;
}

type ConfirmKind = "submit" | "resubmit" | "approve" | "needsInfo" | "reject" | "assign" | "start" | "submitForTesting" | "approveCompletion" | "requestChanges" | "closeTicket" | "reopen" | "archive" | "unarchive" | "block" | "hold" | "resume";

function ConfirmModal({
  title,
  subtitle,
  confirm,
  hint,
  actionLabel,
  pendingLabel,
  pending,
  danger,
  confirmDisabled,
  children,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle?: string;
  confirm: string;
  hint?: string;
  actionLabel: string;
  pendingLabel?: string;
  pending: boolean;
  danger?: boolean;
  confirmDisabled?: boolean;
  children?: React.ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      onClick={() => { if (!pending) onClose(); }}
    >
      <div
        className="palette-modal brm-modal max-w-md rounded-2xl overflow-hidden"
        style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: danger ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)" }}
            >
              <AlertTriangle className="w-5 h-5" style={{ color: danger ? "#EF4444" : "#F59E0B" }} />
            </div>
            <div>
              <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>{title}</h2>
              {subtitle && (
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{subtitle}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: "var(--muted-foreground)" }}
            aria-label={TICKET_ACTION_CONFIRM.close}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm" style={{ color: "var(--foreground)" }}>{confirm}</p>
          {children}
          {hint && <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{hint}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending || confirmDisabled}
              className="flex-1 cursor-pointer py-2.5 rounded-xl text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
              style={danger
                ? { background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }
                : { background: "rgba(79,70,229,0.12)", color: "#818CF8", border: "1px solid rgba(79,70,229,0.35)" }}
            >
              {pending ? (pendingLabel ?? TICKET_ACTION_CONFIRM.pending) : actionLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex-1 cursor-pointer py-2.5 rounded-xl text-sm font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-60"
              style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
            >
              {TICKET_ACTION_CONFIRM.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
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
          touchAction: "none",
        }}
        onMouseDown={(e) => { e.preventDefault(); dispatch({ type: "DOWN", x: e.clientX, y: e.clientY }); }}
        onMouseMove={(e) => dispatch({ type: "MOVE", x: e.clientX, y: e.clientY })}
        onMouseUp={() => dispatch({ type: "UP" })}
        onMouseLeave={() => dispatch({ type: "UP" })}
        onTouchStart={(e) => {
          const t = e.touches[0];
          if (t) dispatch({ type: "DOWN", x: t.clientX, y: t.clientY });
        }}
        onTouchMove={(e) => {
          const t = e.touches[0];
          if (t) dispatch({ type: "MOVE", x: t.clientX, y: t.clientY });
        }}
        onTouchEnd={() => dispatch({ type: "UP" })}
        onTouchCancel={() => dispatch({ type: "UP" })}
        onDoubleClick={() => dispatch({ type: s.zoom > 1 ? "RESET" : "ZOOM", factor: 2 })}>

        <img
          src={url} alt={alt ?? ""}
          draggable={false}
          style={{
            maxWidth: "94vw", maxHeight: "78vh",
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
        flexWrap: "wrap",
        padding: "12px 16px",
        paddingBottom: "max(12px, env(safe-area-inset-bottom))",
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
        <div className="hidden sm:block" style={{ width: 1, height: 18, background: "rgba(255,255,255,0.12)", margin: "0 4px" }} />
        <span className="hidden sm:inline" style={{ color: "rgba(255,255,255,0.35)", fontSize: 11 }}>
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
  const [bugDialogOpen, setBugDialogOpen] = useState(false);
  const [linkBugOpen, setLinkBugOpen] = useState(false);
  const [linkSuiteFor, setLinkSuiteFor] = useState<string[] | null>(null);
  const [unlinkSuiteId, setUnlinkSuiteId] = useState<string | null>(null);
  const [unlinkCaseId, setUnlinkCaseId] = useState<string | null>(null);
  const [unlinkBugId, setUnlinkBugId] = useState<string | null>(null);
  const suiteActions = useSuiteActions();
  const caseActions = useCaseActions();
  const bugActions = useBugActions();
  const { data: ticketTesting } = useTicketTesting(allowed("test:read") ? id : "");
  const [approvalNotes, setApprovalNotes] = useState("");
  const [closureNotes, setClosureNotes] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteTask, setConfirmDeleteTask] = useState<{ id: string; title: string } | null>(null);
  const [deletingTask, setDeletingTask] = useState(false);
  const attachInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ticket?.id) return;
    markTicketRead(ticket.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket?.id]);

  // Scoped by ticket: the API returns exactly the people it will accept a
  // mention for, so the picker cannot offer a name that is dropped on save.
  const { data: allUsers } = useQuery({
    queryKey: qk.ticket.mentionable(id),
    queryFn: () => api.get("/users/mentionable", { params: { ticketId: id } }).then(r => r.data),
    enabled: !!id,
    staleTime: 60_000,
  });
  const mentionableUsers: any[] = allUsers ?? [];

  const { data: tasksData } = useTicketTasks(id);
  const { data: ticketAssignees } = useTicketAssignees(id);
  const { data: dependencyData } = useTicketDependencies(id);
  const taskActions = useTaskActions(id);
  const tasks: any[] = tasksData ?? [];
  const myTasks = tasks.filter(t => t.assignedTo?.id === user?.id);
  const unmetBlockerCount = countUnmetBlockers(dependencyData?.blockedBy);

  const { data: systemData } = useQuery({
    queryKey: qk.systems.detail(ticket?.systemId ?? ""),
    queryFn: () => api.get(`/systems/${ticket!.systemId}`).then(r => r.data),
    enabled: !!ticket?.systemId,
  });
  const developerList: any[] = (allUsers ?? [])
    .filter((u: any) => u.role === "DEVELOPER" && u.isActive !== false);

  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(true);
  const [desktopSidebarClosed, setDesktopSidebarClosed] = useState(false);
  const [forceStatusOpen, setForceStatusOpen] = useState(false);
  const [forceStatusReason, setForceStatusReason] = useState("");
  const [confirmForceStatus, setConfirmForceStatus] = useState<string | null>(null);
  const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
  const [taskForm, setTaskForm] = useState(false);
  const [taskFormSeed, setTaskFormSeed] = useState(0);
  const [newTask, setNewTask] = useState(() => emptyTaskDraft());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editTask, setEditTask] = useState(() => emptyTaskDraft());
  const [savingTask, setSavingTask] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(false);
  const [taskFiles, setTaskFiles] = useState<File[]>([]);
  const taskFileRef = useRef<HTMLInputElement>(null);

  const createTask = async () => {
    // A developer may only file a task for themselves, so the picker is hidden
    // for them and the assignee is filled in here instead.
    const assignedToId = canManageTasks ? newTask.assignedToId : user?.id ?? "";
    if (!newTask.title.trim() || !assignedToId) return;
    setSavingTask(true);
    try {
      const taskPayload: Record<string, unknown> = {
        ...Object.fromEntries(
          Object.entries({ ...newTask, assignedToId }).filter(([, v]) => v !== ""),
        ),
        dueDate: newTask.dueDate || todayDateInput(),
      };
      if (newTask.estimatedHours) taskPayload.estimatedHours = parseInt(newTask.estimatedHours, 10);
      if (newTask.difficultyLevel) taskPayload.difficultyLevel = parseInt(newTask.difficultyLevel, 10);
      const created = await taskActions.create.mutateAsync(taskPayload);
      const taskId = created?.id;
      if (taskId && taskFiles.length) {
        for (const file of taskFiles) {
          const fd = new FormData();
          fd.append("file", file);
          await api.post(`/attachments/upload?taskId=${taskId}`, fd, { headers: { "Content-Type": "multipart/form-data" } });
        }
        // The task row was refreshed when it was created, before these landed.
        qc.invalidateQueries({ queryKey: qk.ticket.tasks(id) });
      }
      setNewTask(emptyTaskDraft());
      setTaskFormSeed((s) => s + 1);
      setTaskFiles([]);
      setTaskForm(false);
    } catch {
      // useTaskActions already reports the API's reason.
    } finally { setSavingTask(false); }
  };

  const beginEditTask = (task: any, estimateOnly: boolean) => {
    setTaskForm(false);
    setEditingTaskId(task.id);
    setEditTask(estimateOnly
      ? {
          ...emptyTaskDraft(),
          estimatedHours: task.estimatedHours != null ? String(task.estimatedHours) : "",
          difficultyLevel: task.difficultyLevel != null ? String(task.difficultyLevel) : "",
        }
      : taskToDraft(task));
  };

  const saveEditedTask = async (estimateOnly: boolean) => {
    if (!editingTaskId) return;
    if (!estimateOnly && !editTask.title.trim()) return;
    setSavingTask(true);
    try {
      const payload: { id: string } & Record<string, unknown> = { id: editingTaskId };
      if (estimateOnly) {
        payload.estimatedHours = editTask.estimatedHours ? parseInt(editTask.estimatedHours, 10) : null;
        payload.difficultyLevel = editTask.difficultyLevel ? parseInt(editTask.difficultyLevel, 10) : null;
      } else {
        payload.title = editTask.title.trim();
        payload.description = editTask.description || null;
        payload.assignedToId = editTask.assignedToId;
        payload.dueDate = editTask.dueDate || null;
        payload.estimatedHours = editTask.estimatedHours ? parseInt(editTask.estimatedHours, 10) : null;
        payload.difficultyLevel = editTask.difficultyLevel ? parseInt(editTask.difficultyLevel, 10) : null;
      }
      await taskActions.update.mutateAsync(payload);
      setEditingTaskId(null);
      setEditTask(emptyTaskDraft());
    } catch {
      // useTaskActions already reports the API's reason.
    } finally {
      setSavingTask(false);
    }
  };

  const updateTaskStatus = (taskId: string, status: string) => {
    taskActions.update.mutate({ id: taskId, status });
  };

  const deleteTask = async (taskId: string) => {
    setDeletingTask(true);
    try {
      await taskActions.remove.mutateAsync(taskId);
      setConfirmDeleteTask(null);
    } catch {
      // useTaskActions already reports the API's reason.
    } finally {
      setDeletingTask(false);
    }
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
  const planLocked = ["DRAFT", "NEW", "AWAITING_APPROVAL", "AWAITING_INFO", "REJECTED", "COMPLETED", "CLOSED"].includes(ticket?.status ?? "");
  const canPlanEdit      = canAssign && !planLocked;
  // Developers on the roster may revise hours/difficulty — not the schedule.
  const canEstimateEdit =
    !canPlanEdit &&
    allowed("ticket:update-estimate") &&
    !planLocked &&
    (Array.isArray(ticketAssignees) ? ticketAssignees : []).some(
      (a: { developerId: string }) => a.developerId === user?.id,
    );
  const canVerifyTesting = allowed("ticket:verify-testing");
  const canClose         = allowed("ticket:close");
  const canReopen        = allowed("ticket:reopen");
  const canArchive       = allowed("ticket:archive");
  const canForceStatus   = allowed("ticket:force-status");
  const canManageTasks   = allowed("task:manage");
  const canCreateOwnTask = allowed("task:create-own");
  const openTaskCount = tasks.filter((t: any) => t.status !== "COMPLETED").length;
  const needsPauseReason = confirmKind === "block" || confirmKind === "hold";
  const needsChangesReason = confirmKind === "requestChanges";
  // A decision the requester will read: the note is posted as a public comment,
  // so it is asked for at the moment of deciding rather than parked in the rail.
  const needsApprovalNotes =
    confirmKind === "approve" || confirmKind === "needsInfo" || confirmKind === "reject";
  const needsRequiredReason = needsPauseReason || needsChangesReason;
  const canHold          = allowed("ticket:hold");
  const canPostInternal  = allowed("comment:internal");

  if (isLoading) return <AppShell><SkeletonTicketDetail /></AppShell>;
  if (!ticket)   return <AppShell><p className="text-sm" style={{ color: "var(--muted-foreground)" }}>التذكرة غير موجودة</p></AppShell>;

  // Owner sign-off is the requester's or a system owner's call (req.md §3);
  // leadership may stand in for an absent owner. "مالك النظام" is the role
  // that can already open this ticket, not only the named systemOwnerId.
  const isOwnerSide =
    ticket.creatorId === user?.id ||
    ticket.systemOwnerId === user?.id ||
    user?.role === "SYSTEM_OWNER";
  const canAcceptDelivery = allowed("ticket:accept-delivery") && (isOwnerSide || canClose);
  const assigneeList = Array.isArray(ticketAssignees) ? ticketAssignees : [];
  const isTicketLead = assigneeList.some(
    (a: { developerId: string; isLead: boolean }) => a.developerId === user?.id && a.isLead,
  );
  const canBlock = canBlockTicket(user?.role, isTicketLead);
  const canResume = canResumeTicket(user?.role, ticket.status, isTicketLead);

  const uploadTicketAttachments = async (files: File[]) => {
    if (!files.length) return;
    setUploading(true);
    setUploadPercent(0);
    try {
      for (const file of files) {
        const form = new FormData();
        form.append("file", file);
        await api.post(`/attachments/upload?ticketId=${id}`, form, {
          headers: { "Content-Type": "multipart/form-data" },
          onUploadProgress: (event) => {
            const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
            setUploadPercent(percent);
          },
        });
      }
      qc.invalidateQueries({ queryKey: qk.ticket.detail(id) });
    } finally {
      setUploading(false);
      setUploadPercent(null);
    }
  };

  const handleAttachUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    await uploadTicketAttachments(files);
    e.target.value = "";
  };

  const handleDeleteAttachment = async (aid: string) => {
    try {
      await api.delete(`/attachments/${aid}`);
      qc.invalidateQueries({ queryKey: qk.ticket.detail(id) });
    } catch (e: any) {
      const { toast } = await import("sonner");
      toast.error(e.response?.data?.message || "تعذّر حذف المرفق");
    } finally {
      setConfirmDeleteId(null);
    }
  };

  const closeConfirm = { onSuccess: () => setConfirmKind(null) };
  const runConfirmedAction = () => {
    if (!confirmKind) return;
    switch (confirmKind) {
      case "submit":
      case "resubmit":
        actions.submit.mutate(undefined, closeConfirm);
        break;
      case "approve":
      case "needsInfo":
      case "reject": {
        const decision =
          confirmKind === "approve" ? "APPROVED" : confirmKind === "needsInfo" ? "NEEDS_INFO" : "REJECTED";
        actions.approve.mutate({ decision, notes: approvalNotes }, {
          onSuccess: () => { setConfirmKind(null); setApprovalNotes(""); },
        });
        break;
      }
      case "assign":
        if (!(ticketAssignees?.length ?? 0) || !ticket.estimatedDeadline) return;
        actions.assign.mutate({}, { onSuccess: () => setConfirmKind(null) });
        break;
      case "start":
        actions.startWork.mutate(undefined, closeConfirm);
        break;
      case "submitForTesting":
        actions.submitForTesting.mutate(undefined, closeConfirm);
        break;
      case "approveCompletion":
        actions.approveCompletion.mutate(undefined, closeConfirm);
        break;
      case "requestChanges":
        actions.requestChanges.mutate({ reason: pauseReason.trim() }, {
          onSuccess: () => { setConfirmKind(null); setPauseReason(""); },
        });
        break;
      case "closeTicket":
        actions.close.mutate({ closureNotes }, closeConfirm);
        break;
      case "reopen":
        actions.reopen.mutate(undefined, closeConfirm);
        break;
      case "archive":
        actions.archive.mutate(undefined, closeConfirm);
        break;
      case "unarchive":
        actions.unarchive.mutate(undefined, closeConfirm);
        break;
      case "block":
        actions.block.mutate({ reason: pauseReason.trim() }, {
          onSuccess: () => { setConfirmKind(null); setPauseReason(""); },
        });
        break;
      case "hold":
        actions.hold.mutate({ reason: pauseReason.trim() }, {
          onSuccess: () => { setConfirmKind(null); setPauseReason(""); },
        });
        break;
      case "resume":
        actions.resume.mutate(undefined, closeConfirm);
        break;
    }
  };
  const confirmPending = confirmKind === "submit" || confirmKind === "resubmit" ? actions.submit.isPending
    : confirmKind === "approve" || confirmKind === "needsInfo" || confirmKind === "reject" ? actions.approve.isPending
    : confirmKind === "assign" ? actions.assign.isPending
    : confirmKind === "start" ? actions.startWork.isPending
    : confirmKind === "submitForTesting" ? actions.submitForTesting.isPending
    : confirmKind === "approveCompletion" ? actions.approveCompletion.isPending
    : confirmKind === "requestChanges" ? actions.requestChanges.isPending
    : confirmKind === "block" ? actions.block.isPending
    : confirmKind === "hold" ? actions.hold.isPending
    : confirmKind === "resume" ? actions.resume.isPending
    : confirmKind === "closeTicket" ? actions.close.isPending
    : confirmKind === "reopen" ? actions.reopen.isPending
    : confirmKind === "archive" ? actions.archive.isPending
    : confirmKind === "unarchive" ? actions.unarchive.isPending
    : false;

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
            <img src={`${FILE_BASE}${ticket.coverImageUrl}`} alt="cover" className="w-full max-h-40 object-cover transition-opacity hover:opacity-95 sm:max-h-56" />
          </div>
        )}

        {/* Hero */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {ticket.company && (
              <MetaChip label="الشركة">
                <CompanyLogo company={ticket.company} size="xs" />
                {ticket.company.name}
              </MetaChip>
            )}
            {ticket.system?.name && (
              <MetaChip label="النظام">
                <Monitor className="w-3 h-3" aria-hidden />
                {ticket.system.name}
              </MetaChip>
            )}
            <TicketCodeBadge ticketNumber={ticket.ticketNumber} />
            <StatusBadge status={ticket.status} />
            <PriorityBadge priority={ticket.finalPriority || ticket.priority} />
            <span className="inline-flex h-6 items-center text-xs px-2.5 rounded-full font-medium leading-4"
              style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
              {TICKET_TYPE_LABELS[ticket.type]}
            </span>
            <RelativeTime date={ticket.createdAt} />
          </div>
          <h1 className="text-lg font-bold leading-snug sm:text-xl" style={{ color: "var(--foreground)" }}>{ticket.title}</h1>
        </div>
      </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,56rem)_18rem] lg:justify-start lg:gap-5">

          {/* ── Main column ── */}
          <div className="space-y-4 max-w-4xl">

            <TicketBlockBanner
              status={ticket.status}
              pauseReason={ticket.pauseReason}
              blockedByTicket={ticket.blockedByTicket}
            />

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

            {(() => {
              const devHandoff = ticketDevHandoff(ticket);
              if (!ticket.startedAt && !devHandoff && !ticket.completedAt) return null;
              return (
              <Section title={ESTIMATE_LABELS.workTimingSection}>
                <div className="space-y-4">
                  {ticket.startedAt && (
                    <Field label={ESTIMATE_LABELS.workStarted}>
                      {formatAbsoluteTime(ticket.startedAt)}
                    </Field>
                  )}
                  {devHandoff && (
                    <>
                      {ticket.startedAt && <div className="h-px" style={{ background: "var(--border)" }} />}
                      <Field label={ESTIMATE_LABELS.devFinishedTicket}>
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {devHandoff.changedBy && (
                            <UserNameWithYou person={devHandoff.changedBy} currentUserId={user?.id} />
                          )}
                          <time dateTime={devHandoff.at}>{formatAbsoluteTime(devHandoff.at)}</time>
                        </span>
                      </Field>
                    </>
                  )}
                  {ticket.completedAt && (
                    <>
                      {(ticket.startedAt || devHandoff) && (
                        <div className="h-px" style={{ background: "var(--border)" }} />
                      )}
                      <Field label={ESTIMATE_LABELS.completedAt}>
                        {formatAbsoluteTime(ticket.completedAt)}
                      </Field>
                    </>
                  )}
                </div>
              </Section>
              );
            })()}

            <TicketDependencies ticketId={id} systemId={ticket.systemId} canManage={canAssign} />

            {/* Attachments */}
            <Section title="المرفقات">
              <input ref={attachInputRef} type="file" multiple className="hidden" onChange={handleAttachUpload} />
              <FileDropZone onFiles={uploadTicketAttachments} disabled={uploading} clickToPick={false}>
              {ticketAttachments.length === 0 ? (
                <div className="text-center py-6">
                  <p className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>$ no attachments_</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {imageAttachments.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
                className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-2.5 text-xs font-semibold transition-all disabled:opacity-50"
                style={{ borderColor: "var(--border)", color: uploading ? "var(--muted-foreground)" : "#4F46E5" }}
                onMouseEnter={e => { if (!uploading) { e.currentTarget.style.borderColor = "#4F46E5"; } }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; }}>
                <Paperclip className="w-3.5 h-3.5" />
                {uploading
                  ? (uploadPercent != null
                    ? TESTING_LABELS.uploadingPercent(uploadPercent)
                    : TESTING_LABELS.uploading)
                  : "اضغط أو اسحب لإضافة مرفق"}
              </button>
              </FileDropZone>
            </Section>

            {/* Tasks */}
            {(isManager || canCreateOwnTask || tasks.length > 0) && (
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
                      const isCompleted = t.status === "COMPLETED";
                      const statusColor = TASK_STATUS_COLORS[t.status] ?? TASK_STATUS_COLORS.NEW;
                      const statusLabel = TASK_STATUS_LABELS[t.status] ?? t.status;
                      const canEditFull = canManageTasks;
                      const canEditEstimate = isAssignee && !canManageTasks;
                      const canEditThis = canEditFull || canEditEstimate;
                      const isEditing = editingTaskId === t.id;
                      const estimateOnlyEdit = isEditing && canEditEstimate && !canEditFull;

                      if (isEditing) {
                        return (
                          <div key={t.id} className="space-y-2 px-3 py-2.5 rounded-xl"
                            style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
                            <p className="text-xs font-medium" style={{ color: "var(--muted-foreground)" }}>
                              {estimateOnlyEdit ? TASK_LABELS.editEstimate : TASK_LABELS.edit}
                            </p>
                            {!estimateOnlyEdit && (
                              <>
                                {canManageTasks && (
                                  <>
                                    <Select
                                      value={editTask.assignedToId || null}
                                      onValueChange={(v: string | null) => setEditTask(p => ({ ...p, assignedToId: v ?? "" }))}
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
                                    <p className="text-xs px-1" style={{ color: "var(--muted-foreground)" }}>
                                      {TASK_LABELS.assigneeSync}
                                    </p>
                                  </>
                                )}
                                <input
                                  value={editTask.title}
                                  onChange={e => setEditTask(p => ({ ...p, title: e.target.value }))}
                                  placeholder="عنوان المهمة"
                                  className="w-full rounded-xl px-3 py-2 text-sm outline-none"
                                  style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                                />
                                <textarea
                                  value={editTask.description}
                                  onChange={e => setEditTask(p => ({ ...p, description: e.target.value }))}
                                  placeholder="وصف المهمة (اختياري)"
                                  rows={2}
                                  className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
                                  style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                                />
                                <div>
                                  <p className="font-brm text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>
                                    {TASK_LABELS.dueDate}
                                  </p>
                                  <input
                                    type="date"
                                    aria-label={TASK_LABELS.dueDate}
                                    value={editTask.dueDate}
                                    onChange={e => setEditTask(p => ({ ...p, dueDate: e.target.value }))}
                                    className="w-full min-w-0 max-w-full rounded-xl px-3 py-2 text-sm font-brm outline-none"
                                    style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)", direction: "ltr" }}
                                  />
                                </div>
                              </>
                            )}
                            <div className="flex flex-col gap-2 sm:flex-row">
                              <input
                                type="number"
                                min={0}
                                value={editTask.estimatedHours}
                                onChange={e => setEditTask(p => ({ ...p, estimatedHours: e.target.value }))}
                                placeholder={ESTIMATE_LABELS.hours}
                                aria-label={ESTIMATE_LABELS.hours}
                                className="w-full min-w-0 rounded-xl px-3 py-2 text-sm outline-none sm:flex-1"
                                style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                              />
                              <div className="w-full min-w-0 sm:flex-1">
                                <ThemeSelect
                                  value={editTask.difficultyLevel}
                                  onChange={(value) => setEditTask(p => ({ ...p, difficultyLevel: value }))}
                                  placeholder={SELECT_PLACEHOLDERS.difficulty}
                                  items={Object.entries(DIFFICULTY_LABELS).map(([value, label]) => ({ value, label }))}
                                  aria-label={SELECT_PLACEHOLDERS.difficulty}
                                  triggerClassName="h-9 min-h-9 text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => saveEditedTask(estimateOnlyEdit)}
                                disabled={savingTask || (!estimateOnlyEdit && (!editTask.title.trim() || (canManageTasks && !editTask.assignedToId)))}
                                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                                style={{ background: "linear-gradient(135deg, #4F46E5, #6C5CE7)" }}>
                                {savingTask ? TASK_LABELS.saving : TASK_LABELS.save}
                              </button>
                              <button
                                type="button"
                                onClick={() => { setEditingTaskId(null); setEditTask(emptyTaskDraft()); }}
                                className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                                style={{ color: "var(--muted-foreground)", background: "var(--card)" }}>
                                {TASK_LABELS.cancel}
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={t.id} className="rounded-xl px-3 py-2.5 transition-colors group"
                          style={{
                            background: isCompleted
                              ? "rgba(5, 150, 105, 0.04)"
                              : isAssignee
                                ? "rgba(79,70,229,0.04)"
                                : "var(--muted)",
                            border: isCompleted
                              ? "1px solid rgba(5, 150, 105, 0.35)"
                              : isAssignee
                                ? "1px solid rgba(79,70,229,0.35)"
                                : "1px solid var(--border)",
                          }}>
                          <div className="flex items-start gap-3 min-w-0">
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
                            <div className="flex items-start justify-between gap-2 min-w-0">
                              <p className="min-w-0 flex-1 break-words text-sm font-medium leading-snug" style={{ color: "var(--foreground)" }}>{t.title}</p>
                              <div className="flex shrink-0 items-center gap-0.5">
                                {canEditThis && (
                                  <button
                                    type="button"
                                    onClick={() => beginEditTask(t, canEditEstimate && !canEditFull)}
                                    aria-label={canEditEstimate && !canEditFull ? TASK_LABELS.editEstimate : TASK_LABELS.edit}
                                    title={canEditEstimate && !canEditFull ? TASK_LABELS.editEstimate : TASK_LABELS.edit}
                                    className="brm-icon-btn opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {(isManager || (canCreateOwnTask && t.createdBy?.id === user?.id && isAssignee && t.status === "NEW")) && (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteTask({ id: t.id, title: t.title })}
                                    aria-label={TASK_LABELS.delete}
                                    title={TASK_LABELS.delete}
                                    className="brm-icon-btn brm-icon-btn-danger opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>
                            {t.description && (
                              <p className="mt-0.5 break-words text-xs leading-relaxed" style={{ color: "var(--muted-foreground)" }}>{t.description}</p>
                            )}
                            {t.createdBy && (
                              <TaskAttributionLine
                                icon={UserPlus}
                                iconColor="#818CF8"
                                label={TASK_LABELS.createdBy}
                                person={t.createdBy}
                                currentUserId={user?.id}
                                dateTime={t.createdAt}
                              />
                            )}
                            {t.status === "COMPLETED" && t.completedAt && (
                              <TaskAttributionLine
                                icon={CircleCheck}
                                iconColor="#10B981"
                                label={TASK_LABELS.devFinishedAt}
                                person={t.assignedTo}
                                currentUserId={user?.id}
                                dateTime={t.completedAt}
                              />
                            )}
                            <div className="mt-1 flex min-w-0 max-sm:mt-2 max-sm:flex-col max-sm:gap-1.5 sm:flex-wrap sm:items-center sm:gap-1.5">
                              <span className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
                                style={{ background: `${statusColor}18`, color: statusColor }}>
                                {statusLabel}
                              </span>
                              {isAssignee && (
                                <span className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium"
                                  style={{ background: "rgba(79,70,229,0.12)", color: "#4F46E5", border: "1px solid rgba(79,70,229,0.22)" }}>
                                  {TASK_LABELS.assignedToMe}
                                </span>
                              )}
                              <span className="inline-flex min-w-0 flex-wrap items-center max-sm:w-full" style={{ color: "var(--muted-foreground)" }}>
                                {joinTaskMeta([
                                  !isAssignee && t.status !== "COMPLETED" && taskPersonName(t.assignedTo) ? (
                                    <UserNameWithYou person={t.assignedTo} currentUserId={user?.id} nameClassName="break-words" />
                                  ) : null,
                                  t.status !== "COMPLETED" && t.dueDate ? (
                                    <DueRemaining date={t.dueDate} className="inline-flex items-center text-xs leading-none" />
                                  ) : null,
                                  (t.estimatedHours != null || t.difficultyLevel != null || taskActualHours(t) != null) ? (
                                    <EstimateChip
                                      inline
                                      hours={t.estimatedHours}
                                      difficulty={t.difficultyLevel}
                                      actual={taskActualHours(t)}
                                    />
                                  ) : null,
                                ])}
                              </span>
                            </div>
                            {/* Task attachments */}
                            {(t.attachments ?? []).length > 0 && (
                              <div className="mt-2 flex w-full flex-wrap gap-1.5 overflow-visible">
                                {(t.attachments as any[]).filter(a => isImg(a.mimeType)).map((a: any) => (
                                  <button key={a.id} onClick={() => openAttachment(a.id)} className="self-start">
                                    <AttachmentImage attachmentId={a.id} alt={a.fileName}
                                      className="w-14 h-11 object-cover rounded-lg hover:opacity-90 transition-opacity"
                                      style={{ border: "1px solid var(--border)" }} />
                                  </button>
                                ))}
                                {(t.attachments as any[]).filter(a => !isImg(a.mimeType)).map((a: any) => (
                                  <button key={a.id} onClick={() => downloadAttachment(a.id, a.fileName)}
                                    className="inline-flex w-fit max-w-full items-start gap-1.5 px-2 py-1 rounded-lg text-xs text-start transition-colors whitespace-normal overflow-visible"
                                    style={{ background: "var(--card)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}
                                    onMouseEnter={e => (e.currentTarget.style.color = "#4F46E5")}
                                    onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-foreground)")}>
                                    <FileText className="w-3 h-3 shrink-0 mt-0.5" aria-hidden />
                                    <span className="break-words text-start leading-snug">{a.fileName}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          </div>
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

                {/* Create task form — managers, or a developer adding their own */}
                {(isManager || canCreateOwnTask) && (
                  taskForm ? (
                    <div className="space-y-2 pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                      {!canManageTasks ? (
                        <p className="text-xs px-3 py-2 rounded-xl"
                          style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>
                          المهمة ستُسند إليك · {TASK_LABELS.assigneeSync}
                        </p>
                      ) : (
                      <>
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
                      <p className="text-xs px-1" style={{ color: "var(--muted-foreground)" }}>
                        {TASK_LABELS.assigneeSync}
                      </p>
                      </>
                      )}
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
                      <div>
                        <p className="font-brm text-xs mb-1" style={{ color: "var(--muted-foreground)" }}>
                          {TASK_LABELS.dueDate}
                        </p>
                        <input
                          key={taskFormSeed}
                          type="date"
                          aria-label={TASK_LABELS.dueDate}
                          value={newTask.dueDate}
                          onChange={e => setNewTask(p => ({ ...p, dueDate: e.target.value }))}
                          className="w-full min-w-0 max-w-full rounded-xl px-3 py-2 text-sm font-brm outline-none"
                          style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)", direction: "ltr" }}
                          onFocus={e => (e.target.style.borderColor = "#4F46E5")}
                          onBlur={e => (e.target.style.borderColor = "var(--border)")}
                        />
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row">
                        <input
                          type="number"
                          min={0}
                          value={newTask.estimatedHours}
                          onChange={e => setNewTask(p => ({ ...p, estimatedHours: e.target.value }))}
                          placeholder={ESTIMATE_LABELS.hours}
                          aria-label={ESTIMATE_LABELS.hours}
                          className="w-full min-w-0 rounded-xl px-3 py-2 text-sm outline-none sm:flex-1"
                          style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
                        />
                        <div className="w-full min-w-0 sm:flex-1">
                          <ThemeSelect
                            value={newTask.difficultyLevel}
                            onChange={(value) => setNewTask(p => ({ ...p, difficultyLevel: value }))}
                            placeholder={SELECT_PLACEHOLDERS.difficulty}
                            items={Object.entries(DIFFICULTY_LABELS).map(([value, label]) => ({ value, label }))}
                            aria-label={SELECT_PLACEHOLDERS.difficulty}
                            triggerClassName="h-9 min-h-9 text-sm"
                          />
                        </div>
                      </div>

                      {/* Task file attachments */}
                      <input ref={taskFileRef} type="file" multiple className="hidden"
                        onChange={e => { setTaskFiles(prev => [...prev, ...Array.from(e.target.files ?? [])]); e.target.value = ""; }} />
                      <FileDropZone onFiles={(files) => setTaskFiles(prev => [...prev, ...files])} clickToPick={false}>
                      {taskFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
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
                              <div key={i} className="inline-flex w-fit max-w-full items-start gap-1.5 px-2 py-1 rounded-lg text-xs text-start whitespace-normal"
                                style={{ background: "var(--muted)", color: "var(--muted-foreground)", border: "1px solid var(--border)" }}>
                                <FileText className="w-3 h-3 shrink-0 mt-0.5" style={{ color: "#4F46E5" }} aria-hidden />
                                <span className="break-words text-start leading-snug">{f.name}</span>
                                <button onClick={() => setTaskFiles(prev => prev.filter((_, idx) => idx !== i))}
                                  className="hover:text-red-500 transition-colors"><X className="w-3 h-3" /></button>
                              </div>
                            )
                          ))}
                        </div>
                      )}
                      <button type="button" onClick={() => taskFileRef.current?.click()}
                        className="flex w-full items-center justify-center gap-1 rounded-xl border-2 border-dashed px-3 py-2 text-xs font-medium transition-colors"
                        style={{ color: "var(--muted-foreground)", borderColor: "var(--border)", background: "var(--muted)" }}
                        onMouseEnter={e => { e.currentTarget.style.color = "#4F46E5"; e.currentTarget.style.borderColor = "#4F46E5"; }}
                        onMouseLeave={e => { e.currentTarget.style.color = "var(--muted-foreground)"; e.currentTarget.style.borderColor = "var(--border)"; }}>
                        <Paperclip className="w-3.5 h-3.5" /> اضغط أو اسحب لإرفاق ملف
                      </button>
                      </FileDropZone>

                      <div className="flex gap-2">
                        <button onClick={createTask} disabled={savingTask || !newTask.title.trim() || (canManageTasks && !newTask.assignedToId)}
                          className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                          style={{ background: "linear-gradient(135deg, #4F46E5, #6C5CE7)" }}>
                          {savingTask ? "جارٍ الرفع..." : "إنشاء"}
                        </button>
                        <button onClick={() => { setTaskForm(false); setNewTask(emptyTaskDraft()); setTaskFormSeed((s) => s + 1); setTaskFiles([]); }}
                          className="px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                          style={{ color: "var(--muted-foreground)", background: "var(--muted)" }}>
                          إلغاء
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => { setNewTask(emptyTaskDraft()); setTaskFormSeed((s) => s + 1); setTaskForm(true); }}
                      className="mt-1 flex items-center gap-1.5 text-xs font-semibold transition-colors"
                      style={{ color: "#4F46E5" }}>
                      <Plus className="w-3.5 h-3.5" /> إضافة مهمة
                    </button>
                  )
                )}
              </Section>
            )}

            {/* Testing — suites covering this ticket, its cases, its bugs */}
            {allowed("test:read") && (
              <Section
                title={
                  <span className="inline-flex flex-wrap items-center gap-2">
                    <span>{TESTING_LABELS.ticketSection}</span>
                    {(() => {
                      const attention = ticketTestingAttentionCounts(
                        ticketTesting as
                          | { cases?: { lastResult: string }[]; bugs?: { status: string }[] }
                          | undefined,
                      );
                      return (
                        <>
                          {attention.openBugs > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums"
                              style={{ color: "#F59E0B" }}
                              title={TESTING_LABELS.openBugsAttention}
                            >
                              {attention.openBugs}
                              <BugIcon className="h-3.5 w-3.5" aria-hidden />
                            </span>
                          )}
                          {attention.failedCases > 0 && (
                            <span
                              className="inline-flex items-center gap-1 text-xs font-semibold tabular-nums"
                              style={{ color: "#EF4444" }}
                              title={TESTING_LABELS.failedCasesAttention}
                            >
                              <span aria-hidden>·</span>
                              {attention.failedCases}
                              <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                            </span>
                          )}
                        </>
                      );
                    })()}
                  </span>
                }
                actions={
                  <TicketTestingHeaderActions
                    canAuthor={allowed("test:author")}
                    canFileBug={allowed("bug:create")}
                    canLinkBug={allowed("bug:create")}
                    onFileBug={() => setBugDialogOpen(true)}
                    onLinkBug={() => setLinkBugOpen(true)}
                    onLinkSuite={() =>
                      setLinkSuiteFor(
                        ((ticketTesting as { suites?: { id: string }[] } | undefined)?.suites ?? []).map(
                          (s) => s.id,
                        ),
                      )
                    }
                  />
                }
              >
                <TicketTestingSection
                  ticketId={id}
                  systemId={ticket.systemId}
                  companyId={ticket.companyId}
                  canAuthor={allowed("test:author")}
                  canFileBug={allowed("bug:create")}
                  canLinkBug={allowed("bug:create")}
                  canUnlink={allowed("test:author")}
                  linkBugOpen={linkBugOpen}
                  onLinkBugOpenChange={setLinkBugOpen}
                  onFileBug={() => setBugDialogOpen(true)}
                  onLinkSuite={setLinkSuiteFor}
                  onUnlinkSuite={setUnlinkSuiteId}
                  onUnlinkCase={setUnlinkCaseId}
                  onUnlinkBug={setUnlinkBugId}
                  onOpenImage={openAttachment}
                />
              </Section>
            )}

            {/* Activity — the whole story, not only the status column */}
            <TicketTimeline ticketId={id} />

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
          <div className="min-w-0">

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileSidebarOpen(o => !o)}
              className="lg:hidden w-full flex items-center justify-between px-4 py-3 rounded-xl mb-3 transition-colors"
              style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--foreground)" }}>
              <span className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
                <CodeComment>التفاصيل والإجراءات</CodeComment>
              </span>
              <ChevronDown className="w-4 h-4 transition-transform duration-200" style={{
                color: "var(--muted-foreground)",
                transform: mobileSidebarOpen ? "rotate(180deg)" : "rotate(0deg)",
              }} />
            </button>

            {/* Desktop toggle — stays in this column so the main pane never shifts */}
            <div className="hidden lg:flex justify-start pb-4">
              <button
                type="button"
                onClick={() => setDesktopSidebarClosed(c => !c)}
                aria-expanded={!desktopSidebarClosed}
                aria-controls="ticket-sidebar"
                className="inline-flex w-40 shrink-0 items-center justify-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{ color: "#4F46E5", background: "rgba(79,70,229,0.08)", border: "1px solid rgba(79,70,229,0.15)" }}>
                <ChevronLeft className={`w-3.5 h-3.5 transition-transform ${desktopSidebarClosed ? "" : "rotate-180"}`} />
                {desktopSidebarClosed ? "عرض التفاصيل" : "إخفاء"}
              </button>
            </div>

            {/* Collapsible content: hidden on mobile by default, toggled on desktop */}
            <div
              id="ticket-sidebar"
              className={`min-w-0 space-y-4 ${mobileSidebarOpen ? "block" : "hidden"} ${desktopSidebarClosed ? "lg:hidden" : "lg:block"}`}>

            {/* Ticket info */}
            <div className="min-w-0 rounded-xl p-4 space-y-3 overflow-x-clip" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              {ticket.company && (
                <SidebarMeta field="الشركة" icon={<CompanyLogo company={ticket.company} size="xs" />}>
                  {ticket.company.name}
                </SidebarMeta>
              )}
              {ticket.system?.name && (
                <SidebarMeta field="النظام" icon={<Monitor className="w-3.5 h-3.5" aria-hidden />}>
                  {ticket.system.name}
                </SidebarMeta>
              )}
              {ticket.estimatedDeadline && !canPlanEdit && (
                <SidebarMeta field="تاريخ التسليم المتوقع" icon={<CalendarClock className="w-3.5 h-3.5" aria-hidden />}>
                  {`التسليم: ${format(parseTimestamp(ticket.estimatedDeadline), "d MMM yyyy", { locale: ar })}`}
                </SidebarMeta>
              )}
              <SidebarMeta field="طالب التذكرة" icon={<User className="w-3.5 h-3.5" aria-hidden />}>
                <UserNameWithYou
                  person={{ ...ticket.creator, id: ticket.creatorId }}
                  currentUserId={user?.id}
                />
              </SidebarMeta>
              <SidebarMeta field="تاريخ الإنشاء" icon={<Clock className="w-3.5 h-3.5" aria-hidden />}>
                {formatAbsoluteTime(ticket.createdAt)}
              </SidebarMeta>
              {ticket.completedAt && (
                <SidebarMeta field={ESTIMATE_LABELS.completedAt} icon={<Check className="w-3.5 h-3.5" aria-hidden />}>
                  {formatAbsoluteTime(ticket.completedAt)}
                </SidebarMeta>
              )}

              <TicketPlanPanel
                ticketId={id}
                canEdit={canPlanEdit || canEstimateEdit}
                estimateOnly={canEstimateEdit && !canPlanEdit}
                plan={{
                  scheduledStart: ticket.scheduledStart,
                  estimatedDeadline: ticket.estimatedDeadline,
                  estimatedHours: ticket.estimatedHours,
                  difficultyLevel: ticket.difficultyLevel,
                }}
              />

              <TicketAssignees
                ticketId={id}
                canManage={canAssign && !["DRAFT", "NEW", "AWAITING_APPROVAL", "AWAITING_INFO", "REJECTED", "COMPLETED", "CLOSED"].includes(ticket.status)}
                currentUserId={user?.id}
                developers={developerList}
              />

              <TicketEstimateSummary ticket={ticket} />
            </div>

            {/* Actions */}
            <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
              <p className="font-brm text-xs mb-3" style={{ color: "var(--muted-foreground)" }}>
                <CodeComment>الإجراءات</CodeComment>
              </p>

              {/* Stopping and restarting sits above the workflow buttons: while a
                  ticket is stopped, resuming it is the only move that matters. */}
              <TicketBlockPanel
                status={ticket.status}
                canBlock={canBlock}
                canHold={canHold}
                canResume={canResume}
                onRequest={setConfirmKind}
              />

              {ticket.status === "DRAFT" && ticket.creatorId === user?.id && (
                <ActionBtn onClick={() => setConfirmKind("submit")} disabled={actions.submit.isPending}>
                  إرسال للمراجعة
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
                  <ActionBtn onClick={() => setConfirmKind("resubmit")} disabled={actions.submit.isPending}>
                    إعادة الإرسال للمراجعة
                  </ActionBtn>
                </div>
              )}

              {/* The three decisions read as one group. The note used to sit
                  between them, splitting the group in half; it is asked for in
                  the confirmation instead, where it is about to be used. */}
              {ticket.status === "NEW" && canApprove && (
                <>
                  <ActionBtn onClick={() => setConfirmKind("approve")} disabled={actions.approve.isPending}>
                    اعتماد
                  </ActionBtn>
                  <ActionBtn variant="outline" onClick={() => setConfirmKind("needsInfo")} disabled={actions.approve.isPending}>
                    طلب معلومات
                  </ActionBtn>
                  <ActionBtn variant="danger" onClick={() => setConfirmKind("reject")} disabled={actions.approve.isPending}>
                    رفض
                  </ActionBtn>
                </>
              )}

              {ticket.status === "APPROVED" && canAssign && (
                <>
                  <ActionBtn
                    onClick={() => setConfirmKind("assign")}
                    disabled={!(ticketAssignees?.length ?? 0) || !ticket.estimatedDeadline || actions.assign.isPending}>
                    جدولة
                  </ActionBtn>
                  {!(ticketAssignees?.length ?? 0) && (
                    <p className="font-brm text-xs" style={{ color: "#F59E0B" }}>{ASSIGNEE_LABELS.empty}</p>
                  )}
                  {!ticket.estimatedDeadline && (ticketAssignees?.length ?? 0) > 0 && (
                    <p className="font-brm text-xs" style={{ color: "#F59E0B" }}>حدّد تاريخ التسليم المتوقع في التخطيط أولاً</p>
                  )}
                </>
              )}

              {ticket.status === "SCHEDULED" && isDeveloper && (
                <ActionBtn onClick={() => setConfirmKind("start")} disabled={actions.startWork.isPending}>
                  بدء العمل
                </ActionBtn>
              )}
              {ticket.status === "IN_PROGRESS" && isDeveloper && (
                <div>
                  <ActionBtn
                    onClick={() => setConfirmKind("submitForTesting")}
                    disabled={actions.submitForTesting.isPending || openTaskCount > 0 || unmetBlockerCount > 0}
                  >
                    إرسال للاختبار
                  </ActionBtn>
                  {openTaskCount > 0 && (
                    <p className="font-brm text-xs mt-1.5" style={{ color: "#F59E0B" }}>
                      <CodeComment>{`أكمل ${openTaskCount} مهمة مفتوحة أولاً`}</CodeComment>
                    </p>
                  )}
                  {unmetBlockerCount > 0 && (
                    <p className="font-brm text-xs mt-1.5" style={{ color: "#F59E0B" }}>
                      <CodeComment>{DEPENDENCY_LABELS.unmetSubmitHint}</CodeComment>
                    </p>
                  )}
                </div>
              )}
              {ticket.status === "AWAITING_TESTING" && canVerifyTesting && (
                <ActionBtn
                  variant="outline"
                  onClick={() => setConfirmKind("requestChanges")}
                  disabled={actions.requestChanges.isPending}
                >
                  طلب تعديلات
                </ActionBtn>
              )}
              {((ticket.status === "AWAITING_TESTING" && canVerifyTesting) || (ticket.status === "AWAITING_OWNER_APPROVAL" && canAcceptDelivery)) && (
                <ActionBtn onClick={() => setConfirmKind("approveCompletion")} disabled={actions.approveCompletion.isPending}>
                  اعتماد الإكمال
                </ActionBtn>
              )}
              {ticket.status === "COMPLETED" && canClose && (
                <>
                  <textarea value={closureNotes} onChange={e => setClosureNotes(e.target.value)}
                    placeholder="ملاحظات الإغلاق *" rows={2}
                    className="w-full rounded-xl px-3 py-2 text-xs outline-none resize-none mb-2"
                    style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }} />
                  <ActionBtn onClick={() => setConfirmKind("closeTicket")} disabled={!closureNotes.trim() || actions.close.isPending}>
                    إغلاق التذكرة
                  </ActionBtn>
                </>
              )}
              {["CLOSED", "REJECTED"].includes(ticket.status) && canReopen && (
                <ActionBtn variant="outline" onClick={() => setConfirmKind("reopen")} disabled={actions.reopen.isPending}>
                  إعادة الفتح
                </ActionBtn>
              )}
              {canArchive && !ticket.isArchived && (
                <ActionBtn variant="ghost" onClick={() => setConfirmKind("archive")}>أرشفة</ActionBtn>
              )}
              {canArchive && ticket.isArchived && (
                <ActionBtn
                  variant="outline"
                  onClick={() => setConfirmKind("unarchive")}
                  disabled={actions.unarchive.isPending}
                >
                  إلغاء الأرشفة
                </ActionBtn>
              )}

              {/* Force status — project manager and above */}
              {canForceStatus && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => setForceStatusOpen(o => !o)}
                    className="w-full flex cursor-pointer items-center justify-between text-xs font-semibold transition-colors"
                    style={{ color: "var(--muted-foreground)" }}
                    aria-expanded={forceStatusOpen}
                  >
                    <span className="font-brm">
                      <CodeComment>تغيير الحالة يدوياً</CodeComment>
                    </span>
                    <span style={{ fontSize: 16, lineHeight: 1 }}>{forceStatusOpen ? "−" : "+"}</span>
                  </button>

                  {forceStatusOpen && (
                    <div className="mt-3 space-y-3">
                      <div className="grid grid-cols-2 gap-1.5">
                        {/* Driven off the label map so a new status appears here for free. */}
                        {Object.entries(TICKET_STATUS_LABELS).map(([val, label]) => {
                          const isCurrent = ticket.status === val;
                          return (
                            <button
                              key={val}
                              type="button"
                              disabled={isCurrent || actions.forceStatus.isPending}
                              onClick={() => setConfirmForceStatus(val)}
                              className="cursor-pointer py-1.5 px-2 rounded-lg text-xs font-medium transition-all disabled:cursor-default"
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
    </AppShell>

    {linkSuiteFor && (
      <LinkSuiteDialog
        ticketId={id}
        systemId={ticket.systemId}
        linkedSuiteIds={linkSuiteFor}
        onClose={() => setLinkSuiteFor(null)}
      />
    )}

    {unlinkSuiteId && (
      <ConfirmDialog
        title={TESTING_LABELS.unlinkSuite}
        message={TESTING_LABELS.unlinkSuiteConfirm}
        actionLabel={TESTING_LABELS.unlinkSuite}
        pending={suiteActions.unlinkTicket.isPending}
        danger
        onClose={() => setUnlinkSuiteId(null)}
        onConfirm={() =>
          suiteActions.unlinkTicket.mutate(
            { id: unlinkSuiteId, ticketId: id },
            {
              onSuccess: () => {
                setUnlinkSuiteId(null);
                qc.invalidateQueries({ queryKey: qk.ticket.testing(id) });
              },
            },
          )
        }
      />
    )}

    {unlinkCaseId && (
      <ConfirmDialog
        title={TESTING_LABELS.unlinkCase}
        message={TESTING_LABELS.unlinkCaseConfirm}
        actionLabel={TESTING_LABELS.unlinkCase}
        pending={caseActions.update.isPending}
        danger
        onClose={() => setUnlinkCaseId(null)}
        onConfirm={() =>
          caseActions.update.mutate(
            { id: unlinkCaseId, ticketId: null },
            {
              onSuccess: () => {
                setUnlinkCaseId(null);
                qc.invalidateQueries({ queryKey: qk.ticket.testing(id) });
              },
            },
          )
        }
      />
    )}

    {unlinkBugId && (
      <ConfirmDialog
        title={TESTING_LABELS.unlinkBug}
        message={TESTING_LABELS.unlinkBugConfirm}
        actionLabel={TESTING_LABELS.unlinkBug}
        pending={bugActions.update.isPending}
        danger
        onClose={() => setUnlinkBugId(null)}
        onConfirm={() =>
          bugActions.update.mutate(
            { id: unlinkBugId, ticketId: null },
            {
              onSuccess: () => {
                setUnlinkBugId(null);
                qc.invalidateQueries({ queryKey: qk.ticket.testing(id) });
              },
            },
          )
        }
      />
    )}

    {bugDialogOpen && (
      <BugEditorDialog
        ticketId={id}
        defaultSystemId={ticket.systemId}
        defaultCompanyId={ticket.companyId}
        onClose={() => setBugDialogOpen(false)}
        onSaved={() => {
          void qc.refetchQueries({ queryKey: qk.ticket.testing(id) });
        }}
      />
    )}

    {lightboxUrl && (
      <LightboxViewer
        url={lightboxUrl}
        onClose={() => setLightboxUrl(null)}
      />
    )}

    {confirmDeleteId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}>
        <div className="rounded-2xl p-5 max-w-sm w-full space-y-4 sm:p-6" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
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

    {confirmKind && (
      <ConfirmModal
        title={TICKET_ACTION_CONFIRM[confirmKind].title}
        confirm={TICKET_ACTION_CONFIRM[confirmKind].confirm}
        hint={needsPauseReason ? BLOCK_LABELS.resumeTo : TICKET_ACTION_CONFIRM.hint}
        danger={"danger" in TICKET_ACTION_CONFIRM[confirmKind]}
        actionLabel={TICKET_ACTION_CONFIRM.action}
        pending={confirmPending}
        confirmDisabled={needsRequiredReason && pauseReason.trim().length < 3}
        onConfirm={runConfirmedAction}
        onClose={() => { setConfirmKind(null); setPauseReason(""); setApprovalNotes(""); }}
      >
        {needsPauseReason && (
          <PauseReasonField value={pauseReason} onChange={setPauseReason} />
        )}
        {needsChangesReason && (
          <PauseReasonField
            value={pauseReason}
            onChange={setPauseReason}
            placeholder={BLOCK_LABELS.changesReasonPlaceholder}
          />
        )}
        {needsApprovalNotes && (
          <label className="block">
            <span className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
              {TICKET_ACTION_CONFIRM.notes}
            </span>
            <textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              rows={3}
              autoFocus
              aria-label={TICKET_ACTION_CONFIRM.notes}
              placeholder={TICKET_ACTION_CONFIRM.notesPlaceholder}
              className="w-full mt-1.5 rounded-xl px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--muted)", border: "1px solid var(--border)", color: "var(--foreground)" }}
            />
            <span className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
              {TICKET_ACTION_CONFIRM.notesHint}
            </span>
          </label>
        )}
      </ConfirmModal>
    )}

    {confirmForceStatus && (
      <ConfirmModal
        title={FORCE_STATUS_LABELS.title}
        subtitle={`${TICKET_STATUS_LABELS[ticket.status]} → ${TICKET_STATUS_LABELS[confirmForceStatus]}`}
        confirm={FORCE_STATUS_LABELS.confirm}
        hint={FORCE_STATUS_LABELS.hint}
        actionLabel={FORCE_STATUS_LABELS.action}
        pendingLabel="جارٍ التغيير..."
        pending={actions.forceStatus.isPending}
        onConfirm={() => {
          actions.forceStatus.mutate(
            { status: confirmForceStatus, reason: forceStatusReason || undefined },
            {
              onSuccess: () => {
                setConfirmForceStatus(null);
                setForceStatusReason("");
              },
            },
          );
        }}
        onClose={() => setConfirmForceStatus(null)}
      />
    )}

    {confirmDeleteTask && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
        onClick={() => { if (!deletingTask) setConfirmDeleteTask(null); }}
      >
        <div
          className="palette-modal brm-modal max-w-md rounded-2xl overflow-hidden"
          style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.12)" }}>
                <Trash2 className="w-5 h-5" style={{ color: "#EF4444" }} />
              </div>
              <div>
                <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>{TASK_LABELS.delete}</h2>
                <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>{confirmDeleteTask.title}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setConfirmDeleteTask(null)}
              disabled={deletingTask}
              className="transition-colors disabled:opacity-50"
              style={{ color: "var(--muted-foreground)" }}
              aria-label={TASK_LABELS.close}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <p className="text-sm" style={{ color: "var(--foreground)" }}>{TASK_LABELS.deleteConfirm}</p>
            <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{TASK_LABELS.deleteHint}</p>
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => deleteTask(confirmDeleteTask.id)}
                disabled={deletingTask}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}
              >
                {deletingTask ? "جارٍ الحذف..." : TASK_LABELS.deleteAction}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDeleteTask(null)}
                disabled={deletingTask}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
              >
                {TASK_LABELS.cancel}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    </>
  );
}
