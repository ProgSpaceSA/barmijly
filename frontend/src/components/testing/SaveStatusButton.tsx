"use client";
import { Check, Loader2 } from "lucide-react";
import { TESTING_LABELS } from "@/lib/constants";

/**
 * Persistent save chrome — always visible on the left.
 * Idle / nothing pending → «تم الحفظ» with a check.
 * In flight → spinner + «جارٍ الحفظ...».
 */
export function SaveStatusButton({ saving }: { saving: boolean }) {
  return (
    <span
      role="status"
      aria-live="polite"
      aria-label={saving ? TESTING_LABELS.saving : TESTING_LABELS.saved}
      className="ms-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold"
      style={{
        minHeight: 32,
        background: saving ? "rgba(79,70,229,0.10)" : "rgba(16,185,129,0.10)",
        color: saving ? "#818CF8" : "#10B981",
        border: saving
          ? "1px solid rgba(79,70,229,0.25)"
          : "1px solid rgba(16,185,129,0.25)",
      }}
    >
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : (
        <Check className="h-3.5 w-3.5" aria-hidden />
      )}
      {saving ? TESTING_LABELS.saving : TESTING_LABELS.saved}
    </span>
  );
}
