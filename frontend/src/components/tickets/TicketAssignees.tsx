"use client";
import { Crown, Plus, X } from "lucide-react";
import { useState } from "react";
import { ASSIGNEE_LABELS, COMMENT_LABELS, SELECT_PLACEHOLDERS } from "@/lib/constants";
import { UserNameWithYou, personFullName } from "@/components/shared/UserNameWithYou";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAssigneeActions, useTicketAssignees } from "@/hooks/useTickets";

type Developer = { id: string; firstName: string; lastName: string };
type Assignment = {
  developerId: string;
  isLead: boolean;
  developer?: Developer;
};

const fullName = (d?: Developer) => personFullName(d);

/**
 * The ticket roster: everyone working it, with the lead marked.
 *
 * A ticket used to have exactly one developer, so the sidebar just read
 * `assignments[0]`. Membership is now derived — holding a task puts you here —
 * plus whoever leadership adds by hand, and only the lead moves the ticket.
 */
export function TicketAssignees({
  ticketId,
  canManage,
  currentUserId,
  developers,
}: {
  ticketId: string;
  canManage: boolean;
  currentUserId?: string;
  developers: Developer[];
}) {
  const { data } = useTicketAssignees(ticketId);
  const actions = useAssigneeActions(ticketId);
  const [adding, setAdding] = useState<string | null>(null);

  const roster: Assignment[] = Array.isArray(data) ? data : [];
  const onTicket = new Set(roster.map((a) => a.developerId));
  const available = developers.filter((d) => !onTicket.has(d.id));

  // Base UI resolves the trigger label from `items`. Without it the trigger
  // renders the raw value, which for a developer is a bare UUID.
  const pickerItems = [
    { value: null, label: SELECT_PLACEHOLDERS.developer },
    ...available.map((d) => ({ value: d.id, label: fullName(d) })),
  ];

  return (
    <div className="space-y-2.5 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
      <p className="font-brm text-xs" style={{ color: "var(--muted-foreground)" }}>
        {ASSIGNEE_LABELS.section}
      </p>

      {roster.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>{ASSIGNEE_LABELS.empty}</p>
      )}

      {roster.map((a) => {
        const name = fullName(a.developer);
        const roleLabel = a.isLead ? ASSIGNEE_LABELS.lead : ASSIGNEE_LABELS.contributor;
        return (
          <div key={a.developerId} className="flex items-start gap-2.5">
            <span
              className="brm-person"
              data-lead={a.isLead || undefined}
              title={`${roleLabel}: ${name}`}
              aria-label={`${roleLabel}: ${name}`}
            >
              {a.developer?.firstName?.[0] ?? "؟"}
            </span>

            {/* The rail is 18rem and these names run long ("DeveloperAll
                AllCompanies"). Wrapping beats truncating: a half-shown name is
                not something you can act on. */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium break-words" style={{ color: "var(--foreground)" }}>
                <UserNameWithYou person={{ ...a.developer, id: a.developerId }} currentUserId={currentUserId} />
              </p>
              <p className="text-xs flex items-center gap-1" style={{ color: "var(--muted-foreground)" }}>
                {a.isLead && <Crown className="w-3 h-3 shrink-0" aria-hidden />}
                {roleLabel}
              </p>
            </div>

            {canManage && (
              <div className="flex items-center shrink-0">
                {!a.isLead && (
                  <button
                    type="button"
                    onClick={() => actions.setLead.mutate(a.developerId)}
                    disabled={actions.setLead.isPending}
                    className="brm-quiet-btn"
                    title={ASSIGNEE_LABELS.makeLead}
                    aria-label={`${ASSIGNEE_LABELS.makeLead}: ${name}`}
                  >
                    <Crown className="w-3.5 h-3.5" aria-hidden />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => actions.remove.mutate(a.developerId)}
                  disabled={actions.remove.isPending}
                  className="brm-quiet-btn"
                  aria-label={`${ASSIGNEE_LABELS.remove} ${name}`}
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {canManage && available.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)_2.25rem] items-center gap-2 pt-0.5">
          <Select value={adding} onValueChange={(v: string | null) => setAdding(v)} items={pickerItems}>
            <SelectTrigger className="h-9 w-full min-w-0 text-sm" aria-label={ASSIGNEE_LABELS.add}>
              <SelectValue placeholder={SELECT_PLACEHOLDERS.developer} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={null}>{SELECT_PLACEHOLDERS.developer}</SelectItem>
              {available.map((d) => (
                <SelectItem key={d.id} value={d.id}>{fullName(d)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <button
            type="button"
            disabled={!adding || actions.add.isPending}
            onClick={() => {
              if (adding) actions.add.mutate(adding, { onSuccess: () => setAdding(null) });
            }}
            className="brm-tone-btn size-9 shrink-0 p-0"
            data-tone="brand"
            aria-label={ASSIGNEE_LABELS.add}
          >
            <Plus className="w-4 h-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
