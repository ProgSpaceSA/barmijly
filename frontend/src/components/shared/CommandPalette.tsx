"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Search, Ticket as TicketIcon, LayoutDashboard, Users, Building2, Bug, CalendarDays, ClipboardList } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import type { Action } from "@/lib/permissions";
import { MEETING_LABELS, TESTING_LABELS } from "@/lib/constants";
import { BugEditorDialog } from "@/components/testing/BugEditorDialog";
import { MeetingEditorDialog } from "@/components/meetings/MeetingEditorDialog";
import { RequirementEditorDialog } from "@/components/meetings/RequirementEditorDialog";

type PaletteDialog = "bug" | "meeting" | "requirement";

interface Result {
  id: string;
  label: string;
  sub?: string;
  href?: string;
  icon?: React.ReactNode;
  /** Opens a create dialog instead of navigating. */
  openDialog?: PaletteDialog;
}

type QuickLinkDef = {
  id: string;
  label: string;
  href?: string;
  icon: React.ReactNode;
  action: Action | null;
  openDialog?: PaletteDialog;
};

/**
 * Frequent destinations (list and create). When a new user-facing flow is a
 * logical quick-access item, add it here with the same action as the sidebar.
 * `action: null` means every signed-in user gets the shortcut.
 */
const QUICK_LINKS: QuickLinkDef[] = [
  { id: "dash",    label: "لوحة التحكم",      href: "/dashboard",  icon: <LayoutDashboard className="w-4 h-4" />, action: null },
  { id: "new",     label: "تذكرة جديدة",       href: "/tickets/new", icon: <TicketIcon className="w-4 h-4" />,     action: "ticket:create" },
  { id: "new-bug", label: TESTING_LABELS.newBug, icon: <Bug className="w-4 h-4" />, action: "bug:create", openDialog: "bug" },
  { id: "meetings", label: MEETING_LABELS.meetingsTitle, href: "/meetings", icon: <CalendarDays className="w-4 h-4" />, action: "meeting:read" },
  { id: "new-meeting", label: MEETING_LABELS.newMeeting, icon: <CalendarDays className="w-4 h-4" />, action: "meeting:manage", openDialog: "meeting" },
  { id: "new-requirement", label: MEETING_LABELS.newRequirement, icon: <ClipboardList className="w-4 h-4" />, action: "requirement:create", openDialog: "requirement" },
  { id: "users",   label: "المستخدمون",        href: "/users",      icon: <Users className="w-4 h-4" />,           action: "user:read" },
  { id: "co",      label: "الشركات والأنظمة",  href: "/companies",  icon: <Building2 className="w-4 h-4" />,       action: "structure:manage" },
];

export function CommandPalette() {
  const { can: allowed } = usePermissions();
  const [dialog, setDialog] = useState<PaletteDialog | null>(null);
  // Same gate as the sidebar: a shortcut to a page the role cannot open is a
  // dead end, and ctrl+k is the one way around a hidden nav link.
  const quickLinks = useMemo(
    (): Result[] =>
      QUICK_LINKS.filter((l) => l.action === null || allowed(l.action)).map((l) => ({
        id: l.id,
        label: l.label,
        href: l.href,
        icon: l.icon,
        openDialog: l.openDialog,
      })),
    [allowed],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>(quickLinks);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults(quickLinks);
      setActive(0);
    }
  }, [open, quickLinks]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(quickLinks); return; }
    setLoading(true);
    try {
      const res = await api.get("/tickets", { params: { search: q, limit: 8 } });
      const tickets: Result[] = (res.data.data || []).map((t: any) => ({
        id: t.id,
        label: t.title,
        sub: t.ticketNumber ? `BRM-${String(t.ticketNumber).padStart(4, "0")}` : t.id.slice(0, 8),
        href: `/tickets/${t.id}`,
        icon: <TicketIcon className="w-4 h-4" />,
      }));
      setResults(tickets.length ? tickets : [{ id: "none", label: "لا توجد نتائج" }]);
    } catch {
      setResults(quickLinks);
    } finally {
      setLoading(false);
    }
  }, [quickLinks]);

  useEffect(() => {
    const t = setTimeout(() => search(query), 200);
    return () => clearTimeout(t);
  }, [query, search]);

  const select = (r: Result | undefined) => {
    if (!r || r.id === "none") return;
    if (r.openDialog) {
      setOpen(false);
      setDialog(r.openDialog);
      return;
    }
    if (r.href) {
      setOpen(false);
      router.push(r.href);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === "Enter")     { select(results[active]); }
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-start justify-center p-4 pt-[12vh] sm:pt-[15vh]"
          style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="palette-modal brm-modal max-w-lg rounded-2xl overflow-hidden"
            style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Search input */}
            <div className="flex shrink-0 items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
              <Search className="w-4 h-4 shrink-0" style={{ color: "var(--muted-foreground)" }} />
              <input
                ref={inputRef}
                value={query}
                onChange={e => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={handleKey}
                placeholder="ابحث عن تذكرة أو انتقل إلى..."
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "var(--foreground)", fontFamily: "'Cairo', sans-serif" }}
                dir="rtl"
              />
              {loading && <div className="w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />}
              <kbd className="font-brm text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}>ESC</kbd>
            </div>

            {/* Results */}
            <div className="max-h-72 flex-1 overflow-y-auto py-1">
              {results.map((r, i) => {
                const disabled = r.id === "none";
                return (
                  <button
                    key={r.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => select(r)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-right transition-colors disabled:cursor-default"
                    style={{
                      background: i === active ? "var(--muted)" : "transparent",
                      color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
                    }}
                    onMouseEnter={() => setActive(i)}
                  >
                    <span style={{ color: "var(--muted-foreground)" }}>{r.icon}</span>
                    <span className="flex-1 truncate">{r.label}</span>
                    {r.sub && <span className="font-brm text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>{r.sub}</span>}
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div className="hidden shrink-0 gap-4 border-t px-4 py-2 sm:flex" style={{ borderColor: "var(--border)" }}>
              {[["↑↓", "تنقل"], ["↵", "فتح"], ["ESC", "إغلاق"]].map(([k, l]) => (
                <span key={k} className="flex items-center gap-1 font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
                  <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: "var(--muted)" }}>{k}</kbd> {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {dialog === "bug" && <BugEditorDialog onClose={() => setDialog(null)} />}
      {dialog === "meeting" && <MeetingEditorDialog onClose={() => setDialog(null)} />}
      {dialog === "requirement" && <RequirementEditorDialog onClose={() => setDialog(null)} />}
    </>
  );
}
