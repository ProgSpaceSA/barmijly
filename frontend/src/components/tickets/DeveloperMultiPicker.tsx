"use client";
import { Check, Crown } from "lucide-react";
import { ASSIGNEE_LABELS } from "@/lib/constants";

type Developer = { id: string; firstName: string; lastName: string };

const fullName = (d: Developer) => `${d.firstName} ${d.lastName}`.trim();

/**
 * Pick the developers who will work a ticket, and which of them leads.
 *
 * A checkbox list rather than a dropdown: assignment is now a set, and a
 * single-select control cannot express "these three, and Sara runs it". The
 * lead is chosen inside the same list so the two decisions stay together —
 * picking a lead who is not on the ticket is not a state worth allowing.
 */
export function DeveloperMultiPicker({
  developers,
  selected,
  leadId,
  onToggle,
  onSetLead,
}: {
  developers: Developer[];
  selected: string[];
  leadId: string;
  onToggle: (id: string) => void;
  onSetLead: (id: string) => void;
}) {
  return (
    <div>
      <p className="font-brm text-xs mb-1.5" style={{ color: "var(--muted-foreground)" }}>
        {ASSIGNEE_LABELS.section}
      </p>
      <ul
        className="max-h-52 overflow-y-auto overscroll-contain rounded-xl divide-y"
        style={{ background: "var(--muted)", border: "1px solid var(--border)", borderColor: "var(--border)" }}
      >
        {developers.length === 0 && (
          <li className="text-xs px-3 py-2.5" style={{ color: "var(--muted-foreground)" }}>
            {ASSIGNEE_LABELS.empty}
          </li>
        )}
        {developers.map((d) => {
          const isOn = selected.includes(d.id);
          const isLead = isOn && leadId === d.id;
          return (
            <li key={d.id} className="flex items-center gap-2 px-2.5 py-2">
              <button
                type="button"
                onClick={() => onToggle(d.id)}
                aria-pressed={isOn}
                aria-label={fullName(d)}
                className="flex items-center gap-2 flex-1 min-w-0 text-start"
              >
                <span
                  className="w-4 h-4 rounded-[6px] border flex items-center justify-center shrink-0"
                  style={{
                    borderColor: isOn ? "#4F46E5" : "var(--border)",
                    background: isOn ? "#4F46E5" : "transparent",
                  }}
                >
                  {isOn && <Check className="w-3 h-3 text-white" strokeWidth={3} aria-hidden />}
                </span>
                <span className="text-xs break-words" style={{ color: "var(--foreground)" }}>
                  {fullName(d)}
                </span>
              </button>

              {isOn && (
                <button
                  type="button"
                  onClick={() => onSetLead(d.id)}
                  className="brm-quiet-btn shrink-0"
                  title={ASSIGNEE_LABELS.leadHint}
                  aria-label={`${ASSIGNEE_LABELS.makeLead}: ${fullName(d)}`}
                  aria-pressed={isLead}
                  style={isLead ? { color: "#818CF8" } : undefined}
                >
                  <Crown className="w-3.5 h-3.5" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {selected.length > 0 && (
        <p className="text-xs mt-1" style={{ color: "var(--muted-foreground)" }}>
          {`${ASSIGNEE_LABELS.lead}: ${
            fullName(developers.find((d) => d.id === leadId) ?? developers[0] ?? { id: "", firstName: "", lastName: "" })
          }`}
        </p>
      )}
    </div>
  );
}
