"use client";
import { AlertTriangle, X } from "lucide-react";
import { TESTING_LABELS } from "@/lib/constants";

/**
 * Shared confirm shell for the QA surface — same chrome as ticket confirms,
 * without a native `window.confirm`.
 */
export function ConfirmDialog({
  title,
  message,
  actionLabel,
  pendingLabel,
  pending = false,
  danger = false,
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  actionLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
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
        className="palette-modal brm-modal w-full max-w-md overflow-hidden rounded-2xl"
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
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: danger ? "rgba(239,68,68,0.12)" : "rgba(245,158,11,0.12)",
              }}
            >
              <AlertTriangle
                className="h-5 w-5"
                style={{ color: danger ? "#EF4444" : "#F59E0B" }}
                aria-hidden
              />
            </div>
            <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>
              {title}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label={TESTING_LABELS.close}
            className="disabled:opacity-50"
            style={{ color: "var(--muted-foreground)" }}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm" style={{ color: "var(--foreground)" }}>
            {message}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={pending}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
              style={
                danger
                  ? {
                      background: "rgba(239,68,68,0.1)",
                      color: "#EF4444",
                      border: "1px solid rgba(239,68,68,0.3)",
                    }
                  : {
                      background: "rgba(79,70,229,0.12)",
                      color: "#818CF8",
                      border: "1px solid rgba(79,70,229,0.35)",
                    }
              }
            >
              {pending ? (pendingLabel ?? TESTING_LABELS.saving) : actionLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
              style={{ border: "1px solid var(--border)", color: "var(--muted-foreground)" }}
            >
              {TESTING_LABELS.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
