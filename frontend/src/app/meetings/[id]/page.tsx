"use client";
import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Archive,
  ArchiveRestore,
  CalendarCheck,
  CalendarDays,
  MapPin,
  Timer,
  XCircle,
} from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { SkeletonTicketDetail } from "@/components/shared/LoadingSpinner";
import { EmptyState } from "@/components/shared/EmptyState";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { CompanyLogo } from "@/components/shared/CompanyLogo";
import {
  MeetingCodeBadge,
  MeetingStatusBadge,
  MeetingTypeBadge,
} from "@/components/meetings/MeetingBadges";
import { MeetingAttendees } from "@/components/meetings/MeetingAttendees";
import { MeetingSystems } from "@/components/meetings/MeetingSystems";
import { MinutesList } from "@/components/meetings/MinutesList";
import { CapturePointDialog } from "@/components/meetings/CapturePointDialog";
import { AttachmentsPanel } from "@/components/meetings/AttachmentsPanel";
import type { MeetingPoint } from "@/components/meetings/PointRow";
import { useMeeting, useMeetingActions } from "@/hooks/useMeetings";
import { usePermissions } from "@/hooks/usePermissions";
import { qk } from "@/lib/query-keys";
import { MEETING_LABELS } from "@/lib/constants";
import { formatAbsoluteTime } from "@/lib/dates";

/** Card shell — same chrome as the ticket page sections. */
function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      className="min-w-0 rounded-xl p-4 sm:p-5"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold" style={{ color: "var(--foreground)" }}>
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ToneButton({
  label,
  icon: Icon,
  tone,
  disabled,
  onClick,
}: {
  label: string;
  icon: typeof CalendarCheck;
  tone: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60"
      style={{
        background: `color-mix(in srgb, ${tone} 12%, transparent)`,
        color: tone,
        border: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`,
        minHeight: 36,
      }}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  );
}

type Confirmation = { title: string; message: string; action: () => void } | null;

export default function MeetingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { can: allowed, user } = usePermissions();
  const { data: meeting, isLoading, isError } = useMeeting(id);
  const actions = useMeetingActions(id);

  const [capturePoint, setCapturePoint] = useState<MeetingPoint | null>(null);
  const [confirm, setConfirm] = useState<Confirmation>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [minutesSaving, setMinutesSaving] = useState(false);

  if (isLoading) {
    return (
      <AppShell>
        <SkeletonTicketDetail />
      </AppShell>
    );
  }

  if (isError || !meeting) {
    return (
      <AppShell>
        <EmptyState
          title={MEETING_LABELS.notFound}
          command="open meeting"
          description={MEETING_LABELS.loadFailed}
          action={{ label: MEETING_LABELS.back, onClick: () => router.push("/meetings") }}
        />
      </AppShell>
    );
  }

  const canManage = allowed("meeting:manage");
  const canCapture = allowed("requirement:create");
  const editable =
    canManage && !meeting.isArchived && meeting.status !== "CANCELLED";
  const organizer = [meeting.organizer?.firstName, meeting.organizer?.lastName]
    .filter(Boolean)
    .join(" ");

  return (
    <AppShell>
      <button
        type="button"
        onClick={() => router.push("/meetings")}
        className="mb-4 inline-flex items-center gap-1.5 text-sm"
        style={{ color: "var(--muted-foreground)" }}
      >
        <ArrowRight className="h-4 w-4" aria-hidden />
        {MEETING_LABELS.back}
      </button>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <MeetingCodeBadge kind="meeting" value={meeting.meetingNumber} />
        <MeetingTypeBadge type={meeting.type} />
        <MeetingStatusBadge status={meeting.status} />
        {meeting.isArchived && (
          <span className="text-xs" style={{ color: "var(--muted-foreground)" }}>
            {MEETING_LABELS.archivedOnly}
          </span>
        )}
      </div>

      <h1
        className="mb-3 text-xl font-bold sm:text-2xl"
        style={{ color: "var(--foreground)" }}
      >
        {meeting.title}
      </h1>

      <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2">
        {meeting.heldAt && (
          <span
            className="flex items-center gap-1.5 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            <CalendarDays className="h-4 w-4" aria-hidden />
            {formatAbsoluteTime(meeting.heldAt)}
          </span>
        )}
        {meeting.durationMins != null && (
          <span
            className="flex items-center gap-1.5 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            <Timer className="h-4 w-4" aria-hidden />
            <span className="tabular-nums">{meeting.durationMins}</span>
            {MEETING_LABELS.duration}
          </span>
        )}
        {meeting.location && (
          <span
            className="flex items-center gap-1.5 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            <MapPin className="h-4 w-4" aria-hidden />
            {meeting.location}
          </span>
        )}
        {organizer && (
          <span className="text-sm" style={{ color: "var(--muted-foreground)" }}>
            {MEETING_LABELS.organizer}: {organizer}
          </span>
        )}
        {meeting.company && (
          <span
            className="flex items-center gap-1.5 text-sm"
            style={{ color: "var(--muted-foreground)" }}
          >
            <CompanyLogo company={meeting.company} size="xs" />
            {meeting.company.name}
          </span>
        )}
      </div>

      {canManage && (
        <div className="mb-5 flex flex-wrap gap-2">
          {meeting.status === "SCHEDULED" && !meeting.isArchived && (
            <>
              <ToneButton
                label={MEETING_LABELS.markHeld}
                icon={CalendarCheck}
                tone="#10B981"
                disabled={actions.hold.isPending}
                onClick={() =>
                  setConfirm({
                    title: MEETING_LABELS.markHeld,
                    message: MEETING_LABELS.markHeldConfirm,
                    action: () => void actions.hold.mutateAsync(id),
                  })
                }
              />
              <ToneButton
                label={MEETING_LABELS.cancelMeeting}
                icon={XCircle}
                tone="#EF4444"
                disabled={actions.cancel.isPending}
                onClick={() =>
                  setConfirm({
                    title: MEETING_LABELS.cancelMeeting,
                    message: MEETING_LABELS.cancelMeetingConfirm,
                    action: () => void actions.cancel.mutateAsync(id),
                  })
                }
              />
            </>
          )}
          {meeting.isArchived ? (
            <ToneButton
              label={MEETING_LABELS.unarchiveMeeting}
              icon={ArchiveRestore}
              tone="#4F46E5"
              disabled={actions.unarchive.isPending}
              onClick={() => void actions.unarchive.mutateAsync(id)}
            />
          ) : (
            <ToneButton
              label={MEETING_LABELS.archiveMeeting}
              icon={Archive}
              tone="#94A3B8"
              disabled={actions.archive.isPending}
              onClick={() =>
                setConfirm({
                  title: MEETING_LABELS.archiveMeeting,
                  message: MEETING_LABELS.archiveMeetingConfirm,
                  action: () => void actions.archive.mutateAsync(id),
                })
              }
            />
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-4">
          {meeting.description && (
            <Section title={MEETING_LABELS.agenda}>
              <p
                className="whitespace-pre-wrap text-sm leading-relaxed"
                style={{ color: "var(--foreground)" }}
              >
                {meeting.description}
              </p>
            </Section>
          )}

          <Section
            title={MEETING_LABELS.minutePoints}
            action={
              minutesSaving || actions.updatePoint.isPending ? (
                <span
                  className="text-xs font-medium"
                  style={{ color: "#818CF8" }}
                  role="status"
                >
                  {MEETING_LABELS.saving}
                </span>
              ) : null
            }
          >
            <MinutesList
              points={(meeting.points ?? []) as MeetingPoint[]}
              readOnly={!editable}
              canCapture={canCapture && !meeting.isArchived}
              capturingId={actions.capturePoint.isPending ? capturePoint?.id : null}
              onSavingChange={setMinutesSaving}
              onAdd={() => void actions.addPoint.mutateAsync({ id })}
              onBodyChange={(pointId, body) =>
                actions.updatePoint.mutateAsync({ id, pointId, body })
              }
              onKindChange={(pointId, kind) =>
                void actions.updatePoint.mutateAsync({ id, pointId, kind })
              }
              onReorder={(pointId, order) =>
                void actions.reorderPoints.mutateAsync({ id, pointId, order })
              }
              onDelete={(pointId) =>
                setConfirm({
                  title: MEETING_LABELS.deletePoint,
                  message: MEETING_LABELS.deletePointConfirm,
                  action: () => void actions.removePoint.mutateAsync({ id, pointId }),
                })
              }
              onCapture={setCapturePoint}
            />
          </Section>
        </div>

        <div className="min-w-0 space-y-4">
          <Section title={MEETING_LABELS.attendees}>
            <MeetingAttendees
              attendees={meeting.attendees ?? []}
              canManage={editable}
              pending={actions.addAttendee.isPending || actions.removeAttendee.isPending}
              onAdd={(data) => void actions.addAttendee.mutateAsync({ id, ...data })}
              onRemove={(attendeeId) =>
                setConfirm({
                  title: MEETING_LABELS.removeAttendee,
                  message: MEETING_LABELS.removeAttendeeConfirm,
                  action: () =>
                    void actions.removeAttendee.mutateAsync({ id, attendeeId }),
                })
              }
            />
          </Section>

          <Section title={MEETING_LABELS.systems}>
            <MeetingSystems
              companyId={meeting.companyId}
              links={meeting.systems ?? []}
              canManage={editable}
              pending={actions.setSystems.isPending}
              onSave={(systemIds) => void actions.setSystems.mutateAsync({ id, systemIds })}
            />
          </Section>

          <Section title={MEETING_LABELS.meetingAttachments}>
            <AttachmentsPanel
              attachments={meeting.attachments ?? []}
              owner={{ meetingId: id }}
              refreshKey={qk.meetings.detail(id)}
              canUpload={editable}
              currentUserId={user?.id}
              uploadLabel={MEETING_LABELS.addMeetingFile}
              onOpenImage={setLightboxUrl}
            />
          </Section>
        </div>
      </div>

      {capturePoint && (
        <CapturePointDialog
          point={capturePoint}
          companyId={meeting.companyId}
          pending={actions.capturePoint.isPending}
          onClose={() => setCapturePoint(null)}
          onConfirm={(data) => {
            void actions.capturePoint
              .mutateAsync({ id, pointId: capturePoint.id, ...data })
              .then(() => setCapturePoint(null));
          }}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          actionLabel={MEETING_LABELS.confirm}
          onConfirm={() => {
            confirm.action();
            setConfirm(null);
          }}
          onClose={() => setConfirm(null)}
        />
      )}

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.8)" }}
          role="presentation"
          onClick={() => setLightboxUrl(null)}
        >
          <img
            src={lightboxUrl}
            alt=""
            className="max-h-full max-w-full rounded-xl object-contain"
          />
        </div>
      )}
    </AppShell>
  );
}
