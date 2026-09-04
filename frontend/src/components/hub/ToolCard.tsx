"use client";
import { useState } from "react";
import { Check, ChevronDown, ExternalLink, Pencil, PowerOff, X } from "lucide-react";
import { Markdown } from "@/components/shared/Markdown";
import {
  HUB_LABELS,
  TOOL_CATEGORY_LABELS,
  TOOL_STATUS_COLORS,
  TOOL_STATUS_LABELS,
  TOOL_TEAM_LABELS,
} from "@/lib/constants";
import type { Tool } from "@/hooks/useTools";

function personName(person?: { firstName: string; lastName: string } | null) {
  if (!person) return "";
  return [person.firstName, person.lastName].filter(Boolean).join(" ");
}

/**
 * One tool as a compact row: name, when to use it, who asked and who
 * approved. Getting-started steps stay folded so the catalogue stays short.
 */
export function ToolCard({
  tool,
  canManage,
  pending = false,
  onEdit,
  onApprove,
  onDecline,
  onRetire,
}: {
  tool: Tool;
  canManage: boolean;
  pending?: boolean;
  onEdit?: (tool: Tool) => void;
  onApprove?: (tool: Tool) => void;
  onDecline?: (tool: Tool) => void;
  onRetire?: (tool: Tool) => void;
}) {
  const [open, setOpen] = useState(false);
  const awaiting = tool.status === "REQUESTED";
  const live = tool.status === "APPROVED";
  const decided = Boolean(tool.decidedBy);

  return (
    <article
      className="rounded-xl px-3 py-2.5 sm:px-4"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <a
              href={tool.website}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-0 max-w-full items-center gap-1 truncate text-sm font-bold hover:underline"
              style={{ color: "var(--foreground)" }}
              aria-label={`${tool.name} — ${HUB_LABELS.visitSite}`}
            >
              <span className="truncate">{tool.name}</span>
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden style={{ color: "var(--muted-foreground)" }} />
            </a>
            <span
              className={`rounded-md px-1.5 py-0.5 text-[0.65rem] font-semibold ${
                TOOL_STATUS_COLORS[tool.status] ?? ""
              }`}
            >
              {TOOL_STATUS_LABELS[tool.status] ?? tool.status}
            </span>
            {tool.categories.map((category) => (
              <span
                key={category}
                className="rounded-md px-1.5 py-0.5 text-[0.65rem] font-medium"
                style={{
                  background: "rgba(79,70,229,0.10)",
                  color: "#818CF8",
                  border: "1px solid rgba(79,70,229,0.25)",
                }}
              >
                {TOOL_CATEGORY_LABELS[category] ?? category}
              </span>
            ))}
            {(tool.teams ?? []).map((team) => (
              <span
                key={team}
                className="rounded-md px-1.5 py-0.5 text-[0.65rem] font-medium"
                style={{
                  background: "rgba(14,165,233,0.10)",
                  color: "#38BDF8",
                  border: "1px solid rgba(14,165,233,0.25)",
                }}
              >
                {TOOL_TEAM_LABELS[team] ?? team}
              </span>
            ))}
          </div>

          <p className="mt-1 line-clamp-1 text-sm" style={{ color: "var(--foreground)" }}>
            <span className="font-brm text-[0.65rem]" style={{ color: "var(--muted-foreground)" }}>
              {HUB_LABELS.whenToUse}:{" "}
            </span>
            {tool.description}
          </p>

          {tool.requestedBy && (
            <p
              className="font-brm mt-1 text-[0.7rem]"
              style={{ color: "var(--muted-foreground)", opacity: 0.75 }}
            >
              {HUB_LABELS.requestedBy}: {personName(tool.requestedBy)}
              {decided ? ` · ${HUB_LABELS.decidedBy}: ${personName(tool.decidedBy)}` : ""}
            </p>
          )}
        </div>

        {canManage && (
          <div className="flex shrink-0 flex-wrap justify-end gap-1">
            {awaiting && onApprove && (
              <button
                type="button"
                onClick={() => onApprove(tool)}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold disabled:opacity-60"
                style={{
                  background: "rgba(16,185,129,0.12)",
                  color: "#10B981",
                  border: "1px solid rgba(16,185,129,0.35)",
                }}
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                {HUB_LABELS.approve}
              </button>
            )}
            {awaiting && onDecline && (
              <button
                type="button"
                onClick={() => onDecline(tool)}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold disabled:opacity-60"
                style={{
                  background: "rgba(239,68,68,0.10)",
                  color: "#EF4444",
                  border: "1px solid rgba(239,68,68,0.30)",
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                {HUB_LABELS.decline}
              </button>
            )}
            {live && onRetire && (
              <button
                type="button"
                onClick={() => onRetire(tool)}
                disabled={pending}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold disabled:opacity-60"
                style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
              >
                <PowerOff className="h-3.5 w-3.5" aria-hidden />
                {HUB_LABELS.retire}
              </button>
            )}
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(tool)}
                disabled={pending}
                aria-label={HUB_LABELS.editTool}
                className="inline-flex items-center rounded-lg px-2 py-1 disabled:opacity-60"
                style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
              >
                <Pencil className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>
        )}
      </div>

      {tool.decisionNote && (
        <p
          className="mt-2 rounded-lg px-2.5 py-1.5 text-xs leading-relaxed"
          style={{ background: "var(--muted)", color: "var(--muted-foreground)" }}
        >
          <span className="font-semibold">{HUB_LABELS.declineReason}: </span>
          {tool.decisionNote}
        </p>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-1.5 inline-flex items-center gap-1 text-[0.7rem] font-semibold"
        style={{ color: "var(--muted-foreground)" }}
        aria-expanded={open}
      >
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
        {open ? HUB_LABELS.hideSteps : HUB_LABELS.showSteps}
      </button>

      {open && (
        <div className="mt-1.5">
          <Markdown content={tool.gettingStarted} className="text-sm" />
        </div>
      )}
    </article>
  );
}
