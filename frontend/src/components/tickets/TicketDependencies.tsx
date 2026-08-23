"use client";
import Link from "next/link";
import { AlertTriangle, Link2, Plus, X } from "lucide-react";
import { useMemo, useState } from "react";
import { BrmPanel } from "@/components/shared/BrmPanel";
import { ThemeSelect } from "@/components/shared/ThemeSelect";
import {
  DEPENDENCY_LABELS,
  DEPENDENCY_TYPE_LABELS,
  RELATION_OPTIONS,
  SELECT_PLACEHOLDERS,
  TICKET_STATUS_COLORS,
  TICKET_STATUS_LABELS,
} from "@/lib/constants";
import { useDependencyActions, useTicketDependencies, useTickets } from "@/hooks/useTickets";
import { formatTicketCode } from "@/lib/utils";
import { toast } from "sonner";

type TicketSummary = { id: string; ticketNumber: number; title: string; status: string };
type Relation = {
  type: string;
  createdAt?: string;
  blockingTicket?: TicketSummary;
  blockedTicket?: TicketSummary;
};

type RelationRow = {
  key: string;
  type: string;
  side: "blockedBy" | "blocking";
  ticket: TicketSummary;
  createdAt: string;
  needed: boolean;
};

const relationItems = RELATION_OPTIONS.map((o) => ({ value: o.value, label: o.label }));

/** COMPLETED and CLOSED are the two statuses that satisfy a blocking relation. */
const SATISFIED = ["COMPLETED", "CLOSED"];

/** Section order — blocking constraints first, then soft links. */
const RELATION_BLOCKS: {
  label: string;
  tone: "depends" | "blocks" | "relates" | "duplicates";
  match: (row: RelationRow) => boolean;
}[] = [
  { label: DEPENDENCY_LABELS.blockedBy, tone: "depends", match: (r) => r.type === "BLOCKS" && r.side === "blockedBy" },
  { label: DEPENDENCY_LABELS.blocking, tone: "blocks", match: (r) => r.type === "BLOCKS" && r.side === "blocking" },
  { label: DEPENDENCY_TYPE_LABELS.RELATES_TO, tone: "relates", match: (r) => r.type === "RELATES_TO" },
  { label: RELATION_OPTIONS[3].label, tone: "duplicates", match: (r) => r.type === "DUPLICATES" && r.side === "blockedBy" },
  { label: RELATION_OPTIONS[4].label, tone: "duplicates", match: (r) => r.type === "DUPLICATES" && r.side === "blocking" },
];

function hasExistingRelation(
  blockedBy: Relation[],
  blocking: Relation[],
  otherTicketId: string,
  type: string,
) {
  return blockedBy.some((d) => d.type === type && d.blockingTicket?.id === otherTicketId)
    || blocking.some((d) => d.type === type && d.blockedTicket?.id === otherTicketId);
}

function toRows(blockedBy: Relation[], blocking: Relation[]): RelationRow[] {
  const rows: RelationRow[] = [];
  for (const d of blockedBy) {
    if (!d.blockingTicket) continue;
    rows.push({
      key: `by-${d.type}-${d.blockingTicket.id}`,
      type: d.type,
      side: "blockedBy",
      ticket: d.blockingTicket,
      createdAt: d.createdAt ?? "",
      needed: d.type === "BLOCKS" && !SATISFIED.includes(d.blockingTicket.status),
    });
  }
  for (const d of blocking) {
    if (!d.blockedTicket) continue;
    rows.push({
      key: `ing-${d.type}-${d.blockedTicket.id}`,
      type: d.type,
      side: "blocking",
      ticket: d.blockedTicket,
      createdAt: d.createdAt ?? "",
      needed: false,
    });
  }
  return rows;
}

function sortRelationRows(a: RelationRow, b: RelationRow) {
  if (a.needed !== b.needed) return a.needed ? -1 : 1;
  return (b.createdAt || "").localeCompare(a.createdAt || "");
}

function TicketRow({
  ticket,
  needed,
  onRemove,
}: {
  ticket: TicketSummary;
  needed?: boolean;
  onRemove?: () => void;
}) {
  const code = formatTicketCode(ticket.ticketNumber) ?? `#${ticket.ticketNumber}`;
  return (
    <div className="flex items-center gap-2 py-1.5 border-0 shadow-none">
      {needed && (
        <span className="brm-count shrink-0" data-tone="danger">
          {DEPENDENCY_LABELS.required}
        </span>
      )}
      <Link
        href={`/tickets/${ticket.id}`}
        className="brm-ticket-link min-w-0 flex-1 text-sm inline-flex items-baseline gap-1.5 flex-wrap"
        style={{ color: "var(--foreground)" }}
      >
        <span className="font-brm text-xs shrink-0 whitespace-nowrap" dir="ltr" style={{ color: "var(--muted-foreground)" }}>
          {code}
        </span>
        {" "}
        <span className="min-w-0 break-words">{ticket.title}</span>
      </Link>
      <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${TICKET_STATUS_COLORS[ticket.status] ?? ""}`}>
        {TICKET_STATUS_LABELS[ticket.status] ?? ticket.status}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="brm-quiet-btn shrink-0"
          aria-label={`${DEPENDENCY_LABELS.remove} ${code}`}
        >
          <X className="w-3.5 h-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}

/**
 * How this ticket relates to others, in both directions.
 *
 * A relation carries a kind: only `BLOCKS` is a constraint — the API refuses
 * `start` and `submit-for-testing` while a blocking prerequisite is unfinished.
 * `RELATES_TO` and `DUPLICATES` are navigation aids, so they are listed but never gate anything.
 */
export function TicketDependencies({
  ticketId,
  systemId,
  canManage,
}: {
  ticketId: string;
  systemId?: string | null;
  canManage: boolean;
}) {
  const { data } = useTicketDependencies(ticketId);
  const actions = useDependencyActions(ticketId);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState("");
  const [relation, setRelation] = useState<string>(RELATION_OPTIONS[0].value);
  const [confirmRemove, setConfirmRemove] = useState<TicketSummary | null>(null);
  const chosen = RELATION_OPTIONS.find((o) => o.value === relation) ?? RELATION_OPTIONS[0];
  const removing = actions.remove.isPending;

  const pickerFilters = useMemo(() => {
    if (!picking || !systemId) return {};
    const filters: Record<string, string> = { systemId, limit: "100" };
    if (search.trim()) filters.search = search.trim();
    return filters;
  }, [picking, systemId, search]);

  const { data: candidates, isLoading: candidatesLoading } = useTickets(pickerFilters);

  const ticketChoices = useMemo(
    () => (candidates?.data ?? []).filter((t: TicketSummary) => t.id !== ticketId),
    [candidates, ticketId],
  );

  const blockedBy = (data?.blockedBy ?? []) as Relation[];
  const blocking = (data?.blocking ?? []) as Relation[];
  const relationBlocks = useMemo(() => {
    const rows = toRows(blockedBy, blocking);
    return RELATION_BLOCKS
      .map((block) => ({
        label: block.label,
        tone: block.tone,
        rows: rows.filter(block.match).sort(sortRelationRows),
      }))
      .filter((block) => block.rows.length > 0);
  }, [data]);
  const unmet = useMemo(
    () => toRows(blockedBy, blocking).filter((r) => r.needed).length,
    [data],
  );
  const hasRelations = relationBlocks.length > 0;

  const confirmRemoveRelation = () => {
    if (!confirmRemove) return;
    actions.remove.mutate(confirmRemove.id, {
      onSuccess: () => setConfirmRemove(null),
    });
  };

  if (!canManage && !hasRelations) return null;

  return (
    <div
      className="rounded-xl p-4 sm:p-5 space-y-3"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-sm flex items-center gap-2" style={{ color: "var(--foreground)" }}>
          <Link2 className="w-4 h-4" aria-hidden />
          {DEPENDENCY_LABELS.section}
          {unmet > 0 && (
            <span className="brm-count" data-tone="danger">
              {`${unmet} ${DEPENDENCY_LABELS.unmet}`}
            </span>
          )}
        </h3>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              if (picking) {
                setPicking(false);
                setSearch("");
              } else {
                setPicking(true);
              }
            }}
            className="brm-tone-btn"
            data-tone={picking ? "neutral" : "brand"}
          >
            {picking ? DEPENDENCY_LABELS.cancel : <><Plus className="w-3.5 h-3.5" aria-hidden />{DEPENDENCY_LABELS.add}</>}
          </button>
        )}
      </div>

      {picking && canManage && (
        <BrmPanel embedded>
          <ThemeSelect
            value={relation}
            onChange={setRelation}
            placeholder={SELECT_PLACEHOLDERS.relation}
            items={relationItems}
            aria-label={DEPENDENCY_LABELS.relation}
            triggerClassName="h-9 min-h-9 text-sm"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={DEPENDENCY_LABELS.pick}
            aria-label={DEPENDENCY_LABELS.pick}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "var(--input)", border: "1px solid var(--border)", color: "var(--foreground)" }}
            disabled={!systemId}
          />
          {!systemId && (
            <p className="text-sm px-1" style={{ color: "var(--muted-foreground)" }}>
              {DEPENDENCY_LABELS.emptySystem}
            </p>
          )}
          <ul className="max-h-56 overflow-y-auto overscroll-contain rounded-lg m-0 p-0 list-none">
            {systemId && candidatesLoading && (
              <li className="text-sm px-2 py-2" style={{ color: "var(--muted-foreground)" }}>
                {DEPENDENCY_LABELS.loading}
              </li>
            )}
            {systemId && !candidatesLoading && ticketChoices.length === 0 && (
              <li className="text-sm px-2 py-2" style={{ color: "var(--muted-foreground)" }}>
                {search.trim() ? DEPENDENCY_LABELS.noResults : DEPENDENCY_LABELS.emptySystem}
              </li>
            )}
            {systemId && !candidatesLoading && ticketChoices.map((t: TicketSummary) => {
                const code = formatTicketCode(t.ticketNumber) ?? `#${t.ticketNumber}`;
                return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => {
                      if (hasExistingRelation(blockedBy, blocking, t.id, chosen.type)) {
                        toast.info(DEPENDENCY_LABELS.alreadyAdded);
                        return;
                      }
                      actions.add.mutate(
                        { otherTicketId: t.id, direction: chosen.direction, type: chosen.type },
                        { onSuccess: () => { setPicking(false); setSearch(""); } },
                      );
                    }}
                    className="brm-list-choice text-start"
                  >
                    <span className="font-brm text-xs whitespace-nowrap" dir="ltr" style={{ color: "var(--muted-foreground)" }}>
                      {code}
                    </span>
                    {" "}
                    <span>{t.title}</span>
                  </button>
                </li>
              );
              })}
          </ul>
        </BrmPanel>
      )}

      {!hasRelations && (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{DEPENDENCY_LABELS.none}</p>
      )}

      {relationBlocks.map((block) => (
        <div key={block.label} className="space-y-1.5">
          <p className="brm-relation-label" data-tone={block.tone}>
            {block.label}
          </p>
          <div className="flex flex-col gap-1 divide-none [&>*]:border-0">
            {block.rows.map((row) => (
              <TicketRow
                key={row.key}
                ticket={row.ticket}
                needed={row.needed}
                onRemove={canManage ? () => setConfirmRemove(row.ticket) : undefined}
              />
            ))}
          </div>
        </div>
      ))}

      {confirmRemove && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
          onClick={() => { if (!removing) setConfirmRemove(null); }}
        >
          <div
            className="palette-modal brm-modal max-w-md rounded-2xl overflow-hidden"
            style={{ background: "var(--card)", border: "1px solid var(--border)", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-4 sm:px-6 sm:py-5" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "rgba(239,68,68,0.12)" }}>
                  <AlertTriangle className="w-5 h-5" style={{ color: "#EF4444" }} />
                </div>
                <div>
                  <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>{DEPENDENCY_LABELS.remove}</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
                    <span className="font-brm whitespace-nowrap" dir="ltr">
                      {formatTicketCode(confirmRemove.ticketNumber) ?? `#${confirmRemove.ticketNumber}`}
                    </span>
                    {` ${confirmRemove.title}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmRemove(null)}
                disabled={removing}
                className="transition-colors disabled:opacity-50"
                style={{ color: "var(--muted-foreground)" }}
                aria-label={DEPENDENCY_LABELS.close}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm" style={{ color: "var(--foreground)" }}>{DEPENDENCY_LABELS.removeConfirm}</p>
              <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>{DEPENDENCY_LABELS.removeHint}</p>
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={confirmRemoveRelation}
                  disabled={removing}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60"
                  style={{ background: "rgba(239,68,68,0.1)", color: "#EF4444", border: "1px solid rgba(239,68,68,0.3)" }}
                >
                  {removing ? DEPENDENCY_LABELS.removing : DEPENDENCY_LABELS.removeAction}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmRemove(null)}
                  disabled={removing}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                  style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
                >
                  {DEPENDENCY_LABELS.cancel}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
