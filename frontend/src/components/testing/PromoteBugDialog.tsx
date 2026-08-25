"use client";
import { useState } from "react";
import { Ticket as TicketIcon, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { TESTING_LABELS } from "@/lib/constants";
import { formatBugCode } from "@/lib/utils";

/**
 * Title picker before promote. The ticket lands at DRAFT with whatever title
 * the reporter confirms here — often the bug code plus its title.
 */
export function PromoteBugDialog({
  bug,
  pending = false,
  onClose,
  onConfirm,
}: {
  bug: { id: string; bugNumber?: number | null; title: string };
  pending?: boolean;
  onClose: () => void;
  onConfirm: (title: string) => void;
}) {
  const [title, setTitle] = useState(
    () => `(${formatBugCode(bug.bugNumber) ?? "BUG"}) ${bug.title}`,
  );

  const ready = title.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={TESTING_LABELS.promoteTitle}
        className="palette-modal brm-modal w-full max-w-md overflow-hidden rounded-2xl"
        style={{
          background: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex shrink-0 items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{ background: "rgba(79,70,229,0.12)" }}
            >
              <TicketIcon className="h-5 w-5" style={{ color: "#818CF8" }} aria-hidden />
            </div>
            <h2 className="text-base font-bold" style={{ color: "var(--foreground)" }}>
              {TESTING_LABELS.promoteTitle}
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
          <div className="min-w-0">
            <p className="font-brm mb-1 text-xs" style={{ color: "var(--muted-foreground)" }}>
              {TESTING_LABELS.promoteTitleLabel}
            </p>
            <Input
              value={title}
              aria-label={TESTING_LABELS.promoteTitleLabel}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 text-sm"
              disabled={pending}
            />
          </div>
          <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {TESTING_LABELS.promoteHint}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                if (!ready) return;
                onConfirm(title.trim());
              }}
              disabled={!ready || pending}
              className="flex-1 rounded-xl py-2.5 text-sm font-semibold disabled:opacity-60"
              style={{
                background: "rgba(79,70,229,0.12)",
                color: "#818CF8",
                border: "1px solid rgba(79,70,229,0.35)",
              }}
            >
              {pending ? TESTING_LABELS.promoting : TESTING_LABELS.promoteConfirm}
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
