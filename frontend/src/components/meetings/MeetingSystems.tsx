"use client";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Boxes, Check } from "lucide-react";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { BrmPanel } from "@/components/shared/BrmPanel";
import { MEETING_LABELS } from "@/lib/constants";

export type MeetingSystemLink = { system: { id: string; name: string } };

function asList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

/**
 * Which systems the meeting covered.
 *
 * The API replaces the whole set on save, so the picker is a checklist of the
 * company's systems rather than an add/remove pair — the reader sees the final
 * answer and confirms it once, instead of watching four separate writes.
 */
export function MeetingSystems({
  companyId,
  links,
  canManage = false,
  pending = false,
  onSave,
}: {
  companyId: string;
  links: MeetingSystemLink[];
  canManage?: boolean;
  pending?: boolean;
  onSave?: (systemIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const selectedIds = links.map((row) => row.system.id);
  const [picked, setPicked] = useState<string[]>(selectedIds);

  // The panel opens on the current set, not on whatever was picked last time.
  useEffect(() => {
    if (open) setPicked(links.map((row) => row.system.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const { data: systemsRaw } = useQuery({
    queryKey: qk.systems.byCompany(companyId),
    queryFn: () => api.get(`/systems?companyId=${companyId}`).then((r) => r.data),
    enabled: open && !!companyId,
    staleTime: 60_000,
  });
  const systems = asList<{ id: string; name: string }>(systemsRaw);

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  return (
    <div className="min-w-0 space-y-2">
      {links.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {links.map((row) => (
            <li
              key={row.system.id}
              className="inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold"
              style={{
                background: "color-mix(in srgb, #8B5CF6 14%, transparent)",
                color: "#A78BFA",
                border: "1px solid color-mix(in srgb, #8B5CF6 35%, transparent)",
              }}
            >
              <span className="truncate">{row.system.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          {MEETING_LABELS.noSystems}
        </p>
      )}

      {canManage &&
        (open ? (
          <BrmPanel
            title={MEETING_LABELS.pickSystems}
            icon={Boxes}
            cancelLabel={MEETING_LABELS.cancel}
            onClose={() => setOpen(false)}
          >
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {systems.map((system) => {
                const on = picked.includes(system.id);
                return (
                  <button
                    key={system.id}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggle(system.id)}
                    className="flex min-w-0 items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-start text-sm"
                    style={{
                      background: on ? "rgba(79,70,229,0.12)" : "transparent",
                      color: on ? "#818CF8" : "var(--foreground)",
                      border: `1px solid ${on ? "rgba(79,70,229,0.35)" : "var(--border)"}`,
                    }}
                  >
                    <span className="truncate">{system.name}</span>
                    {on && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  </button>
                );
              })}
              {!systems.length && (
                <p className="py-2 text-sm" style={{ color: "var(--muted-foreground)" }}>
                  {MEETING_LABELS.noSystems}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                onSave?.(picked);
                setOpen(false);
              }}
              disabled={pending}
              className="w-full rounded-xl py-2 text-sm font-semibold disabled:opacity-60"
              style={{
                background: "rgba(79,70,229,0.12)",
                color: "#818CF8",
                border: "1px solid rgba(79,70,229,0.35)",
              }}
            >
              {pending ? MEETING_LABELS.saving : MEETING_LABELS.saveSystems}
            </button>
          </BrmPanel>
        ) : (
          <button type="button" className="brm-add-row" onClick={() => setOpen(true)}>
            <Boxes className="h-3.5 w-3.5" aria-hidden />
            {MEETING_LABELS.pickSystems}
          </button>
        ))}
    </div>
  );
}
