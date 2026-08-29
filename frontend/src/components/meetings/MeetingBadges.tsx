"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import {
  MEETING_LABELS,
  MEETING_STATUS_COLORS,
  MEETING_STATUS_LABELS,
  MEETING_TYPE_LABELS,
  POINT_KIND_COLORS,
  POINT_KIND_LABELS,
  REQUIREMENT_SOURCE_LABELS,
  REQUIREMENT_STATUS_LABELS,
  requirementStatusColor,
} from "@/lib/constants";
import { formatMeetingCode, formatRequirementCode } from "@/lib/utils";

/**
 * Chips for the meetings surface.
 *
 * They carry their colour inline rather than through a `data-*` hook like the
 * QA chips do: these five palettes exist nowhere else, and a stylesheet entry
 * per status would put the colour a file away from the label it belongs to.
 */
function Chip({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold leading-4"
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      <span
        className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span className="truncate">{children}</span>
    </span>
  );
}

export function MeetingStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  return (
    <Chip color={MEETING_STATUS_COLORS[status] ?? "#0EA5E9"}>
      {MEETING_STATUS_LABELS[status] ?? status}
    </Chip>
  );
}

export function MeetingTypeBadge({ type }: { type?: string | null }) {
  if (!type) return null;
  return <Chip color="#8B5CF6">{MEETING_TYPE_LABELS[type] ?? type}</Chip>;
}

/** What a minutes line is — narration, a decision, a risk, or an ask. */
export function PointKindBadge({ kind }: { kind?: string | null }) {
  if (!kind) return null;
  return (
    <Chip color={POINT_KIND_COLORS[kind] ?? "#94A3B8"}>{POINT_KIND_LABELS[kind] ?? kind}</Chip>
  );
}

export function RequirementStatusBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  return (
    <Chip color={requirementStatusColor(status)}>
      {REQUIREMENT_STATUS_LABELS[status] ?? status}
    </Chip>
  );
}

export function RequirementSourceBadge({ source }: { source?: string | null }) {
  if (!source) return null;
  return <Chip color="#0EA5E9">{REQUIREMENT_SOURCE_LABELS[source] ?? source}</Chip>;
}

/**
 * `MTG-0007` / `REQ-0114`, isolated LTR inside the RTL page so the digits never
 * reorder around the dash. Click copies — same pattern as tickets and bugs.
 */
export function MeetingCodeBadge({
  kind,
  value,
}: {
  kind: "meeting" | "requirement";
  value?: number | null;
}) {
  const code = kind === "meeting" ? formatMeetingCode(value) : formatRequirementCode(value);
  const [copied, setCopied] = useState(false);
  if (!code) return null;

  const copy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      toast.success(MEETING_LABELS.copiedCode);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(MEETING_LABELS.copyFailed);
    }
  };

  return (
    <button
      type="button"
      dir="ltr"
      onClick={copy}
      title={MEETING_LABELS.copyCode}
      aria-label={`${MEETING_LABELS.copyCode} ${code}`}
      className="brm-ticket-code ltr-isolate inline-flex h-6 shrink-0 items-center gap-1 rounded-full border-0 px-2.5 font-brm text-xs font-semibold leading-4 transition-all"
    >
      {code}
      {copied ? (
        <Check className="h-2.5 w-2.5" aria-hidden />
      ) : (
        <Copy className="h-2.5 w-2.5 opacity-50" aria-hidden />
      )}
    </button>
  );
}
