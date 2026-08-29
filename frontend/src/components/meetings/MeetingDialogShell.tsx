"use client";
import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { MEETING_LABELS } from "@/lib/constants";

/**
 * The modal chrome every meetings dialog shares — header, close, scroll body.
 *
 * Four dialogs on this surface (new meeting, capture, new requirement, promote)
 * were otherwise going to repeat forty lines of overlay markup each, and the
 * fifth would have drifted.
 */
export function MeetingDialogShell({
  title,
  icon: Icon,
  pending = false,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  icon?: LucideIcon;
  pending?: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`brm-modal flex max-h-[90vh] w-full max-w-full flex-col overflow-hidden rounded-2xl ${
          wide ? "sm:max-w-2xl" : "sm:max-w-lg"
        }`}
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex min-w-0 items-center gap-3">
            {Icon && (
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: "rgba(79,70,229,0.12)" }}
              >
                <Icon className="h-5 w-5" style={{ color: "#818CF8" }} aria-hidden />
              </div>
            )}
            <h2 className="truncate text-base font-bold" style={{ color: "var(--foreground)" }}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label={MEETING_LABELS.close}
            className="shrink-0 disabled:opacity-50"
            style={{ color: "var(--muted-foreground)" }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">{children}</div>

        {footer && (
          <div className="shrink-0 p-5 pt-0">
            <div className="flex gap-3">{footer}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Primary / secondary buttons, so every dialog footer reads the same. */
export function DialogActions({
  confirmLabel,
  pendingLabel,
  pending = false,
  disabled = false,
  onConfirm,
  onClose,
}: {
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  disabled?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled || pending}
        className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
        style={{
          background: "rgba(79,70,229,0.12)",
          color: "#818CF8",
          border: "1px solid rgba(79,70,229,0.35)",
        }}
      >
        {pending ? (pendingLabel ?? MEETING_LABELS.saving) : confirmLabel}
      </button>
      <button
        type="button"
        onClick={onClose}
        disabled={pending}
        className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
        style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
      >
        {MEETING_LABELS.cancel}
      </button>
    </>
  );
}

/** A labelled field row — the label sits above, RTL, muted. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="font-brm mb-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
        {label}
      </p>
      {children}
      {hint && (
        <p className="mt-1 text-xs" style={{ color: "var(--muted-foreground)", opacity: 0.7 }}>
          {hint}
        </p>
      )}
    </div>
  );
}
