"use client";
import { useState } from "react";
import { AtSign, Check, FileText, Lock, Pencil, Trash2 } from "lucide-react";
import { RelativeTime } from "@/components/shared/RelativeTime";
import { MentionText } from "@/components/shared/MentionText";
import { CommentComposer, type CommentSubmit } from "@/components/tickets/CommentComposer";
import { UserNameWithYou } from "@/components/shared/UserNameWithYou";
import { COMMENT_LABELS, ROLE_COLORS, ROLE_LABELS } from "@/lib/constants";
import { avatarTint, cn, formatBytes } from "@/lib/utils";
import { downloadAttachment, fetchAttachmentObjectUrl } from "@/lib/attachments";
import { AttachmentImage } from "@/components/shared/AttachmentImage";
import { inferWritingDir, type MentionUser } from "@/lib/mentions";

/** Only an edit moves `updatedAt`, so a gap past the write itself means edited. */
const EDIT_THRESHOLD_MS = 2000;

const isImage = (mimeType: string) => mimeType?.startsWith("image/");

export function CommentItem({
  comment,
  users,
  currentUserId,
  currentUserName,
  editing,
  grouped = false,
  readOnly = false,
  onStartEdit,
  onCancelEdit,
  onSubmitEdit,
  onDelete,
  onOpenImage,
}: {
  comment: any;
  users: MentionUser[];
  currentUserId?: string;
  currentUserName?: string;
  editing: boolean;
  /** Same author, moments later — the header and avatar are already on screen. */
  grouped?: boolean;
  /** Imported from a linked requirement — show only, no edit/delete. */
  readOnly?: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSubmitEdit: (payload: CommentSubmit) => Promise<void>;
  onDelete: () => Promise<void>;
  onOpenImage: (url: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const author = comment.author ?? {};
  const isMine = !!currentUserId && author.id === currentUserId;
  const isInternal = comment.visibility === "INTERNAL";
  const fromRequirement = Boolean(comment.fromRequirement);
  const mentionsMe = !!currentUserId && (comment.mentions ?? []).includes(currentUserId);
  const wasEdited =
    new Date(comment.updatedAt).getTime() - new Date(comment.createdAt).getTime() >
    EDIT_THRESHOLD_MS;
  const writingDir = inferWritingDir(comment.content);

  const images = (comment.attachments ?? []).filter((a: any) => isImage(a.mimeType));
  const documents = (comment.attachments ?? []).filter((a: any) => !isImage(a.mimeType));
  const roleColor = ROLE_COLORS[author.role] ?? "#64748B";
  const tint = avatarTint(author.id);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div
      className={cn(
        "brm-comment flex gap-3",
        mentionsMe && "brm-comment-mentioned",
        !mentionsMe && isInternal && "brm-comment-internal",
      )}
    >
      {grouped ? (
        <div className="w-8 shrink-0" aria-hidden="true" />
      ) : (
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
          style={{ background: `color-mix(in srgb, ${tint} 20%, transparent)`, color: tint }}
          aria-hidden="true"
        >
          {author.firstName?.[0]}
          {author.lastName?.[0]}
        </div>
      )}

      <div className="flex-1 min-w-0 relative">
        {isMine && !editing && !readOnly && (
          confirming ? (
            <div className="brm-comment-confirm" role="group" aria-label={COMMENT_LABELS.deleteConfirm}>
              <p>{COMMENT_LABELS.deleteConfirm}</p>
              <div className="brm-comment-confirm-actions">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="brm-comment-confirm-btn brm-comment-confirm-btn-danger"
                >
                  <Check className="w-3 h-3" /> {COMMENT_LABELS.delete}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="brm-comment-confirm-btn"
                >
                  {COMMENT_LABELS.cancel}
                </button>
              </div>
            </div>
          ) : (
            <div className="brm-comment-actions flex items-center gap-0.5">
              <button
                type="button"
                onClick={onStartEdit}
                title={COMMENT_LABELS.edit}
                aria-label={COMMENT_LABELS.edit}
                className="brm-icon-btn"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                title={COMMENT_LABELS.delete}
                aria-label={COMMENT_LABELS.delete}
                className="brm-icon-btn brm-icon-btn-danger"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )
        )}

        {!grouped && (
          <div className="flex items-center gap-2 mb-1 flex-wrap" style={{ color: "var(--foreground)" }}>
            <UserNameWithYou
              person={author}
              currentUserId={currentUserId}
              className="inline-flex items-center gap-2 flex-wrap text-sm font-semibold"
            />

            {author.role && (
              <span
                className="text-xs px-1.5 py-0.5 rounded font-medium"
                style={{
                  color: roleColor,
                  background: `color-mix(in srgb, ${roleColor} 14%, transparent)`,
                }}
              >
                {ROLE_LABELS[author.role] ?? author.role}
              </span>
            )}

            {isInternal && (
              <span className="brm-badge brm-badge-internal">
                <Lock className="w-3 h-3" /> {COMMENT_LABELS.internal}
              </span>
            )}

            {fromRequirement && (
              <span
                className="text-xs px-1.5 py-0.5 rounded font-medium"
                style={{
                  color: "#818CF8",
                  background: "rgba(79,70,229,0.12)",
                  border: "1px solid rgba(79,70,229,0.35)",
                }}
              >
                {COMMENT_LABELS.fromRequirement}
              </span>
            )}

            {mentionsMe && (
              <span className="brm-badge brm-badge-mention">
                <AtSign className="w-3 h-3" /> {COMMENT_LABELS.mentionedYou}
              </span>
            )}

            <RelativeTime date={comment.createdAt} />

            {wasEdited && (
              <span
                className="text-xs"
                style={{ color: "var(--muted-foreground)" }}
                title={COMMENT_LABELS.edited}
              >
                · {COMMENT_LABELS.edited}
              </span>
            )}
          </div>
        )}

        {editing ? (
          <CommentComposer
            users={users}
            currentUserId={currentUserId}
            currentUserName={currentUserName}
            initialContent={comment.content}
            initialDirection={writingDir}
            placeholder={COMMENT_LABELS.editPlaceholder}
            submitLabel={COMMENT_LABELS.save}
            onSubmit={onSubmitEdit}
            onCancel={onCancelEdit}
            resetOnSubmit={false}
            autoFocus
            compact
          />
        ) : (
          <p
            className="brm-comment-body text-sm"
            style={{ color: "var(--foreground)" }}
            dir={writingDir}
          >
            <MentionText
              content={comment.content}
              users={users}
              currentUserId={currentUserId}
              dir={writingDir}
            />
          </p>
        )}

        {!editing && images.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {images.map((attachment: any) => (
              <button
                key={attachment.id}
                type="button"
                onClick={() =>
                  fetchAttachmentObjectUrl(attachment.id).then(onOpenImage).catch(() => {})
                }
                className="brm-attach-tile w-28 h-20"
                title={attachment.fileName}
              >
                <AttachmentImage
                  attachmentId={attachment.id}
                  alt={attachment.fileName}
                  className="w-full h-full object-cover hover:opacity-90 transition-opacity"
                />
              </button>
            ))}
          </div>
        )}

        {!editing && documents.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {documents.map((attachment: any) => (
              <button
                key={attachment.id}
                type="button"
                onClick={() => downloadAttachment(attachment.id, attachment.fileName)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors"
                style={{
                  background: "var(--muted)",
                  border: "1px solid var(--border)",
                  color: "var(--muted-foreground)",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#4F46E5")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--muted-foreground)")}
              >
                <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "#4F46E5" }} />
                <span className="truncate max-w-48" style={{ color: "var(--foreground)" }}>
                  {attachment.fileName}
                </span>
                <span className="font-brm opacity-60 shrink-0">
                  {formatBytes(attachment.fileSize)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
