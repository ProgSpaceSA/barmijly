"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Inline picker panel — muted card with a titled header and cancel control.
 *
 * Used for expandable flows (add relation, pick-from-list) rather than a
 * full-screen overlay. Matches the «العلاقات» picker layout.
 */
export function BrmPanel({
  title,
  icon: Icon,
  cancelLabel,
  onClose,
  embedded = false,
  children,
}: {
  title?: string;
  icon?: LucideIcon;
  cancelLabel?: string;
  onClose?: () => void;
  /** Inside a card that already has a section header — skip the duplicate row. */
  embedded?: boolean;
  children: ReactNode;
}) {
  const showHeader = !embedded && title && cancelLabel && onClose;

  return (
    <div className="brm-panel space-y-2 rounded-xl p-3" style={{ background: "var(--muted)" }}>
      {showHeader && (
        <div className="flex items-center justify-between gap-2">
          <h4 className="font-semibold text-sm flex items-center gap-2 min-w-0" style={{ color: "var(--foreground)" }}>
            {Icon && <Icon className="w-4 h-4 shrink-0" aria-hidden />}
            <span className="truncate">{title}</span>
          </h4>
          <button type="button" onClick={onClose} className="brm-tone-btn shrink-0" data-tone="neutral">
            {cancelLabel}
          </button>
        </div>
      )}
      {children}
    </div>
  );
}
