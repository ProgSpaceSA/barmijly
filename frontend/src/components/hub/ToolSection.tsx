"use client";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { HUB_LABELS } from "@/lib/constants";

/**
 * Collapsible group of tools (e.g. "AI coding", "Newly added").
 * Starts open so browsing a category does not need an extra click.
 */
export function ToolSection({
  title,
  hint,
  count,
  defaultOpen = true,
  children,
}: {
  title: string;
  hint?: string;
  count: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section
      className="overflow-hidden rounded-xl"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-start sm:px-4"
      >
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`}
          style={{ color: "var(--muted-foreground)" }}
          aria-hidden
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold" style={{ color: "var(--foreground)" }}>
            {title}
          </span>
          {hint ? (
            <span className="block text-xs" style={{ color: "var(--muted-foreground)" }}>
              {hint}
            </span>
          ) : null}
        </span>
        <span
          className="shrink-0 rounded-md px-1.5 py-0.5 text-[0.65rem] font-bold tabular-nums"
          style={{
            background: "rgba(79,70,229,0.10)",
            color: "#818CF8",
            border: "1px solid rgba(79,70,229,0.25)",
          }}
          aria-label={`${count} ${HUB_LABELS.toolCountInSection}`}
        >
          {count}
        </span>
      </button>
      {open ? (
        <div
          className="flex flex-col gap-2 border-t px-3 py-2.5 sm:px-4 sm:py-3"
          style={{ borderColor: "var(--border)" }}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
