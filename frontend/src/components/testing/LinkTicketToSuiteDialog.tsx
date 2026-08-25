"use client";
import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useSuiteActions } from "@/hooks/useTestSuites";
import { useTickets } from "@/hooks/useTickets";
import { TESTING_LABELS } from "@/lib/constants";
import { formatTicketCode } from "@/lib/utils";

type TicketRow = {
  id: string;
  title: string;
  ticketNumber?: number | null;
  status?: string;
};

/**
 * «ربط بتذكرة» from the suite workspace — inverse of LinkSuiteDialog.
 *
 * Each row is a checkbox: checked means linked. Check/uncheck mutates
 * immediately; linked ids are kept optimistically so the UI updates before
 * the suite query settles.
 */
export function LinkTicketToSuiteDialog({
  suiteId,
  systemId,
  companyId,
  linkedTicketIds = [],
  onClose,
}: {
  suiteId: string;
  systemId: string;
  companyId?: string;
  linkedTicketIds?: string[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [linked, setLinked] = useState(() => new Set(linkedTicketIds));
  const filters: Record<string, string> = {
    systemId,
    limit: "50",
    ...(companyId ? { companyId } : {}),
  };
  const { data, isLoading } = useTickets(filters);
  const actions = useSuiteActions(suiteId);

  const linkedKey = [...linkedTicketIds].sort().join(",");
  useEffect(() => {
    setLinked(new Set(linkedTicketIds));
    // Only when the id set actually changes — parent maps a new array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- linkedKey is the source of truth
  }, [linkedKey]);

  const pending = actions.linkTicket.isPending || actions.unlinkTicket.isPending;
  const q = search.trim().toLowerCase();
  const rows: TicketRow[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data)
      ? data
      : [];
  const tickets = rows.filter((t) =>
    q ? t.title.toLowerCase().includes(q) || String(t.ticketNumber ?? "").includes(q) : true,
  );

  const toggle = (ticketId: string, isLinked: boolean) => {
    if (pending) return;
    setLinked((prev) => {
      const next = new Set(prev);
      if (isLinked) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
    if (isLinked) {
      actions.unlinkTicket.mutate(
        { id: suiteId, ticketId },
        {
          onError: () =>
            setLinked((prev) => {
              const next = new Set(prev);
              next.add(ticketId);
              return next;
            }),
        },
      );
    } else {
      actions.linkTicket.mutate(
        { id: suiteId, ticketId },
        {
          onError: () =>
            setLinked((prev) => {
              const next = new Set(prev);
              next.delete(ticketId);
              return next;
            }),
        },
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={TESTING_LABELS.linkTicket}
        className="brm-modal flex max-h-[85vh] w-full max-w-full flex-col overflow-hidden rounded-2xl sm:max-w-lg"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>
            {TESTING_LABELS.linkTicket}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={TESTING_LABELS.close}
            style={{ color: "var(--muted-foreground)" }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="shrink-0 px-5 pt-4">
          <div className="relative">
            <Search
              className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2"
              style={{ insetInlineStart: 10, color: "var(--muted-foreground)" }}
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={TESTING_LABELS.searchTickets}
              aria-label={TESTING_LABELS.searchTickets}
              className="h-9 ps-8 text-sm"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-5">
          {isLoading && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.loading}
            </p>
          )}

          {!isLoading && !tickets.length && (
            <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.noTicketsInSystem}
            </p>
          )}

          {tickets.map((ticket) => {
            const isLinked = linked.has(ticket.id);
            const code = formatTicketCode(ticket.ticketNumber);
            const label = `${code ?? ""} ${ticket.title}`.trim();
            return (
              <label
                key={ticket.id}
                className="flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2"
                style={{
                  background: "var(--muted)",
                  minHeight: 44,
                  opacity: pending ? 0.7 : 1,
                }}
              >
                <input
                  type="checkbox"
                  checked={isLinked}
                  disabled={pending}
                  onChange={() => toggle(ticket.id, isLinked)}
                  aria-label={label}
                  className="h-4 w-4 shrink-0 rounded border accent-[var(--primary,#4F46E5)]"
                />
                {code && (
                  <span
                    dir="ltr"
                    className="brm-ticket-code ltr-isolate shrink-0 rounded-full px-2 py-0.5 font-brm text-[0.65rem] font-semibold"
                  >
                    {code}
                  </span>
                )}
                <span
                  className="min-w-0 flex-1 truncate text-xs font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  {ticket.title}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
