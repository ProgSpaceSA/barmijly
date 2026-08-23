"use client";
import { formatAbsoluteTime, formatRelativeTime, parseTimestamp } from "@/lib/dates";

export function RelativeTime({ date, className, label }: { date: string | Date; className?: string; label?: string }) {
  const d = parseTimestamp(date);
  if (Number.isNaN(d.getTime())) return null;

  const relative = formatRelativeTime(d);
  const absolute = formatAbsoluteTime(d);

  return (
    <time
      dateTime={d.toISOString()}
      title={label ? `${label} — ${absolute}` : absolute}
      className={`font-brm cursor-help ${className ?? ""}`}
      style={{
        color: "var(--muted-foreground)",
        ...(className?.match(/\btext-(xs|sm|base|lg)\b/) ? {} : { fontSize: "0.7rem" }),
      }}
    >
      {relative}
    </time>
  );
}
