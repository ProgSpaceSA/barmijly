"use client";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Search, Ticket as TicketIcon, LayoutDashboard, Users, Building2 } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import type { Action } from "@/lib/permissions";

interface Result {
  id: string;
  label: string;
  sub?: string;
  href: string;
  icon?: React.ReactNode;
}

/** `action: null` means every signed-in user gets the shortcut. */
const QUICK_LINKS: (Result & { action: Action | null })[] = [
  { id: "dash",    label: "لوحة التحكم",      href: "/dashboard",  icon: <LayoutDashboard className="w-4 h-4" />, action: null },
  { id: "tickets", label: "التذاكر",           href: "/tickets",    icon: <TicketIcon className="w-4 h-4" />,      action: null },
  { id: "new",     label: "تذكرة جديدة",       href: "/tickets/new", icon: <TicketIcon className="w-4 h-4" />,     action: "ticket:create" },
  { id: "users",   label: "المستخدمون",        href: "/users",      icon: <Users className="w-4 h-4" />,           action: "user:read" },
  { id: "co",      label: "الشركات والأنظمة",  href: "/companies",  icon: <Building2 className="w-4 h-4" />,       action: "structure:manage" },
];

export function CommandPalette() {
  const { can: allowed } = usePermissions();
  // Same gate as the sidebar: a shortcut to a page the role cannot open is a
  // dead end, and ctrl+k is the one way around a hidden nav link.
  const quickLinks = useMemo(
    () => QUICK_LINKS.filter((l) => l.action === null || allowed(l.action)),
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
      setResults(tickets.length ? tickets : [{ id: "none", label: "لا توجد نتائج", href: "" }]);
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

  const navigate = (href: string) => {
    if (!href) return;
    setOpen(false);
    router.push(href);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActive(a => Math.max(a - 1, 0)); }
    if (e.key === "Enter")     { navigate(results[active]?.href ?? ""); }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={() => setOpen(false)}
    >
      <div
        className="palette-modal w-full max-w-lg rounded-2xl overflow-hidden"
        style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b" style={{ borderColor: "var(--border)" }}>
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
        <div className="max-h-72 overflow-y-auto py-1">
          {results.map((r, i) => (
            <button
              key={r.id}
              onClick={() => navigate(r.href)}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-right transition-colors"
              style={{
                background: i === active ? "var(--muted)" : "transparent",
                color: r.href ? "var(--foreground)" : "var(--muted-foreground)",
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span style={{ color: "var(--muted-foreground)" }}>{r.icon}</span>
              <span className="flex-1 truncate">{r.label}</span>
              {r.sub && <span className="font-brm text-xs shrink-0" style={{ color: "var(--muted-foreground)" }}>{r.sub}</span>}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t flex gap-4" style={{ borderColor: "var(--border)" }}>
          {[["↑↓", "تنقل"], ["↵", "فتح"], ["ESC", "إغلاق"]].map(([k, l]) => (
            <span key={k} className="flex items-center gap-1 font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
              <kbd className="px-1 py-0.5 rounded text-[10px]" style={{ background: "var(--muted)" }}>{k}</kbd> {l}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
