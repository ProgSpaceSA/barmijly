"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, UserPlus, X } from "lucide-react";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { Input } from "@/components/ui/input";
import { SearchableDeveloperSelect } from "@/components/shared/SearchableDeveloperSelect";
import { BrmPanel } from "@/components/shared/BrmPanel";
import { MEETING_LABELS, ROLE_LABELS } from "@/lib/constants";
import { avatarTint } from "@/lib/utils";

export type MeetingAttendee = {
  id: string;
  userId?: string | null;
  name?: string | null;
  jobTitle?: string | null;
  organization?: string | null;
  user?: { id: string; firstName?: string; lastName?: string; role?: string } | null;
};

function asList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: T[] }).data;
  }
  return [];
}

/** An internal attendee reads their name off the account; a guest carries one. */
export function attendeeName(attendee: MeetingAttendee): string {
  const account = [attendee.user?.firstName, attendee.user?.lastName].filter(Boolean).join(" ");
  return account || attendee.name || "";
}

function attendeeInitials(attendee: MeetingAttendee): string {
  const name = attendeeName(attendee);
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}

/**
 * Who was in the room.
 *
 * Two kinds on one list because they are one list in the minutes: colleagues
 * with accounts, and the group CEO who has none and should not need one. The
 * picker offers accounts; the fields below it take a name, a job title and an
 * organisation for everybody else.
 */
export function MeetingAttendees({
  attendees,
  canManage = false,
  pending = false,
  onAdd,
  onRemove,
}: {
  attendees: MeetingAttendee[];
  canManage?: boolean;
  pending?: boolean;
  onAdd?: (data: Record<string, unknown>) => void;
  onRemove?: (attendeeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"internal" | "external">("internal");
  const [userId, setUserId] = useState("");
  const [guest, setGuest] = useState({ name: "", jobTitle: "", organization: "" });

  const { data: usersRaw } = useQuery({
    queryKey: qk.users.list(),
    queryFn: () => api.get("/users").then((r) => r.data),
    enabled: open,
    staleTime: 60_000,
  });
  const seated = new Set(attendees.map((a) => a.userId).filter(Boolean) as string[]);
  const users = asList<{ id: string; firstName: string; lastName: string; role: string }>(
    usersRaw,
  ).filter((u) => !seated.has(u.id));

  const ready = mode === "internal" ? Boolean(userId) : Boolean(guest.name.trim());

  const submit = () => {
    if (!ready || pending) return;
    onAdd?.(
      mode === "internal"
        ? { userId }
        : {
            name: guest.name.trim(),
            ...(guest.jobTitle.trim() ? { jobTitle: guest.jobTitle.trim() } : {}),
            ...(guest.organization.trim() ? { organization: guest.organization.trim() } : {}),
          },
    );
    setUserId("");
    setGuest({ name: "", jobTitle: "", organization: "" });
    setOpen(false);
  };

  return (
    <div className="min-w-0 space-y-2">
      {!attendees.length && (
        <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
          {MEETING_LABELS.noAttendees}
        </p>
      )}

      <ul className="flex flex-col gap-1.5">
        {attendees.map((attendee) => {
          const name = attendeeName(attendee);
          const subtitle =
            attendee.user?.role != null
              ? (ROLE_LABELS[attendee.user.role] ?? attendee.user.role)
              : [attendee.jobTitle, attendee.organization].filter(Boolean).join(" · ");
          const tint = avatarTint(attendee.userId ?? attendee.id);
          const initials = attendeeInitials(attendee);
          return (
            <li
              key={attendee.id}
              className="flex w-full min-w-0 items-center gap-2 rounded-xl px-2 py-2"
              style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                style={{
                  background: `color-mix(in srgb, ${tint} 20%, transparent)`,
                  color: tint,
                }}
                aria-hidden
              >
                {initials || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <span
                  className="block truncate text-xs font-semibold"
                  style={{ color: "var(--foreground)" }}
                >
                  {name}
                </span>
                {subtitle && (
                  <span
                    className="block truncate text-[11px]"
                    style={{ color: "var(--muted-foreground)" }}
                  >
                    {subtitle}
                  </span>
                )}
              </div>
              {canManage && (
                <button
                  type="button"
                  onClick={() => onRemove?.(attendee.id)}
                  disabled={pending}
                  aria-label={`${MEETING_LABELS.removeAttendee} ${name}`}
                  title={MEETING_LABELS.removeAttendee}
                  className="shrink-0 rounded-lg p-1 disabled:opacity-50 hover:bg-black/5 dark:hover:bg-white/5"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {canManage &&
        (open ? (
          <BrmPanel
            title={MEETING_LABELS.addAttendee}
            icon={UserPlus}
            cancelLabel={MEETING_LABELS.cancel}
            onClose={() => setOpen(false)}
          >
            <div className="brm-seg" role="group" aria-label={MEETING_LABELS.addAttendee}>
              <button
                type="button"
                data-on={mode === "internal"}
                onClick={() => setMode("internal")}
              >
                {MEETING_LABELS.internalAttendee}
              </button>
              <button
                type="button"
                data-on={mode === "external"}
                onClick={() => setMode("external")}
              >
                {MEETING_LABELS.externalAttendee}
              </button>
            </div>

            {mode === "internal" ? (
              <SearchableDeveloperSelect
                developers={users}
                value={userId || null}
                onChange={(id) => setUserId(id ?? "")}
                placeholder={MEETING_LABELS.pickUser}
                aria-label={MEETING_LABELS.pickUser}
                triggerClassName="h-9"
                disabled={pending}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <Input
                  value={guest.name}
                  aria-label={MEETING_LABELS.attendeeName}
                  placeholder={MEETING_LABELS.attendeeName}
                  onChange={(e) => setGuest((g) => ({ ...g, name: e.target.value }))}
                  className="h-9 text-sm"
                  disabled={pending}
                />
                <Input
                  value={guest.jobTitle}
                  aria-label={MEETING_LABELS.attendeeJobTitle}
                  placeholder={MEETING_LABELS.attendeeJobTitle}
                  onChange={(e) => setGuest((g) => ({ ...g, jobTitle: e.target.value }))}
                  className="h-9 text-sm"
                  disabled={pending}
                />
                <Input
                  value={guest.organization}
                  aria-label={MEETING_LABELS.attendeeOrganization}
                  placeholder={MEETING_LABELS.attendeeOrganization}
                  onChange={(e) => setGuest((g) => ({ ...g, organization: e.target.value }))}
                  className="h-9 text-sm"
                  disabled={pending}
                />
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={!ready || pending}
              className="w-full rounded-xl py-2 text-sm font-semibold disabled:opacity-60"
              style={{
                background: "rgba(79,70,229,0.12)",
                color: "#818CF8",
                border: "1px solid rgba(79,70,229,0.35)",
              }}
            >
              {pending ? MEETING_LABELS.saving : MEETING_LABELS.add}
            </button>
          </BrmPanel>
        ) : (
          <button type="button" className="brm-add-row" onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {MEETING_LABELS.addAttendee}
          </button>
        ))}
    </div>
  );
}
