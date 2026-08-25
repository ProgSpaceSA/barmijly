"use client";
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { toast } from "sonner";
import { OrderedStepList } from "./OrderedStepList";
import type { TestStep } from "./StepRow";
import { TESTING_LABELS } from "@/lib/constants";
import api from "@/lib/api";
import { uploadAttachment } from "@/lib/attachments";

/** Local-only step ids — not sent to the API until the bug exists. */
export function newDraftStep(order: number): TestStep {
  return {
    id: `draft-${crypto.randomUUID()}`,
    order,
    body: "",
  };
}

function revokeLocalShot(step: TestStep) {
  if (step.localShot?.previewUrl) URL.revokeObjectURL(step.localShot.previewUrl);
}

/**
 * Repro steps while the bug is still being composed.
 *
 * Bodies and optional screenshots live in React state; on save the parent
 * creates the bug, posts each non-empty line, then uploads each local shot
 * against the new step id.
 *
 * `onChange` is a setState dispatcher so every keystroke applies against the
 * latest draft list — a plain array callback goes stale under fast typing.
 */
export function DraftReproSteps({
  steps,
  onChange,
}: {
  steps: TestStep[];
  onChange: Dispatch<SetStateAction<TestStep[]>>;
}) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const stepsRef = useRef(steps);
  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  // Revoke blob URLs if the list is unmounted mid-compose.
  useEffect(
    () => () => {
      for (const step of stepsRef.current) revokeLocalShot(step);
    },
    [],
  );

  return (
    <>
      <OrderedStepList
        steps={steps}
        label={TESTING_LABELS.reproSteps}
        liveUpdate
        onAdd={() =>
          onChange((prev) => {
            const order = prev.length ? Math.max(...prev.map((s) => s.order)) + 1 : 0;
            return [...prev, newDraftStep(order)];
          })
        }
        onDelete={(id) =>
          onChange((prev) => {
            const doomed = prev.find((s) => s.id === id);
            if (doomed) revokeLocalShot(doomed);
            return prev
              .filter((s) => s.id !== id)
              .sort((a, b) => a.order - b.order)
              .map((s, i) => ({ ...s, order: i }));
          })
        }
        onBodyChange={(id, body) =>
          onChange((prev) => prev.map((s) => (s.id === id ? { ...s, body } : s)))
        }
        onReorder={(id, to) => {
          onChange((prev) => {
            const sorted = [...prev].sort((a, b) => a.order - b.order);
            const from = sorted.findIndex((s) => s.id === id);
            if (from < 0 || from === to) return prev;
            const next = [...sorted];
            const [moved] = next.splice(from, 1);
            next.splice(to, 0, moved);
            return next.map((s, i) => ({ ...s, order: i }));
          });
        }}
        onAttach={(id, file) => {
          if (!file.type.startsWith("image/")) {
            toast.error(TESTING_LABELS.uploadFailed);
            return;
          }
          const previewUrl = URL.createObjectURL(file);
          onChange((prev) =>
            prev.map((s) => {
              if (s.id !== id) return s;
              revokeLocalShot(s);
              return {
                ...s,
                localShot: { file, previewUrl, fileName: file.name },
              };
            }),
          );
          toast.success(TESTING_LABELS.screenshotAdded);
        }}
        onOpenLocalShot={(url) => setLightboxUrl(url)}
      />

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.85)" }}
          onClick={() => setLightboxUrl(null)}
          role="presentation"
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </>
  );
}

/**
 * Create server steps from local draft lines, in order.
 * Skips blanks with no screenshot. Uploads each local shot onto its new step.
 */
export async function persistDraftSteps(bugId: string, drafts: TestStep[]) {
  for (const step of [...drafts].sort((a, b) => a.order - b.order)) {
    const body = step.body.trim();
    if (!body && !step.localShot) continue;
    const created = await api
      .post(`/bugs/${bugId}/steps`, {
        // A shot-only line still needs a body on the API — use a dash.
        body: body || "—",
      })
      .then((r) => r.data as { id: string });
    if (step.localShot) {
      try {
        await uploadAttachment(step.localShot.file, { testStepId: created.id });
      } finally {
        revokeLocalShot(step);
      }
    }
  }
}
