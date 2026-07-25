"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import { Search, Ticket as TicketIcon, LayoutDashboard, Users, Building2 } from "lucide-react";

interface Result {
  id: string;
  label: string;
  sub?: string;
  href: string;
  icon?: React.ReactNode;
}

const QUICK_LINKS: Result[] = [
  { id: "dash",    label: "لوحة التحكم",      href: "/dashboard",  icon: <LayoutDashboard className="w-4 h-4" /> },
  { id: "tickets", label: "التذاكر",           href: "/tickets",    icon: <TicketIcon className="w-4 h-4" /> },
  { id: "new",     label: "تذكرة جديدة",       href: "/tickets/new", icon: <TicketIcon className="w-4 h-4" /> },
  { id: "users",   label: "المستخدمون",        href: "/users",      icon: <Users className="w-4 h-4" /> },
  { id: "co",      label: "الشركات والأنظمة",  href: "/companies",  icon: <Building2 className="w-4 h-4" /> },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>(QUICK_LINKS);
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
      setResults(QUICK_LINKS);
      setActive(0);
    }
  }, [open]);

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults(QUICK_LINKS); return; }
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
      setResults(QUICK_LINKS);
    } finally {
      setLoading(false);
    }
  }, []);

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
