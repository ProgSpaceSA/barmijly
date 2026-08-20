"use client";
import { formatDistanceToNow, format } from "date-fns";
import { ar } from "date-fns/locale";

export function RelativeTime({ date, className, label }: { date: string | Date; className?: string; label?: string }) {
  const d = typeof date === "string" ? new Date(date) : date;
  const relative = formatDistanceToNow(d, { addSuffix: true, locale: ar });
  const absolute = format(d, "yyyy/MM/dd HH:mm");

  return (
    <time
      dateTime={d.toISOString()}
      title={label ? `${label} — ${absolute}` : absolute}
      className={`font-brm cursor-help ${className ?? ""}`}
      style={{ fontSize: "0.7rem", color: "var(--muted-foreground)" }}
    >
      {relative}
    </time>
  );
}
