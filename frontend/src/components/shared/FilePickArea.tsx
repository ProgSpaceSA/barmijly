"use client";
import type { LucideIcon } from "lucide-react";

/** Empty-state file picker — fixed height so cover and attachment zones align. */
export function FilePickArea({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled = false,
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-32 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 transition-all disabled:cursor-not-allowed disabled:opacity-60"
      style={{ borderColor: "var(--border)", color: "var(--muted-foreground)" }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.borderColor = "#4F46E5";
        e.currentTarget.style.color = "#4F46E5";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.color = "var(--muted-foreground)";
      }}
    >
      <Icon className="h-6 w-6 shrink-0" aria-hidden />
      <span className="text-center text-sm leading-snug">{label}</span>
      {hint && <span className="font-brm text-center text-xs opacity-60">{hint}</span>}
    </button>
  );
}
