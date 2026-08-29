"use client";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import { Download, FileText, Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FileDropZone } from "@/components/shared/FileDropZone";
import {
  deleteAttachment,
  downloadAttachment,
  fetchAttachmentObjectUrl,
  uploadAttachment,
  type AttachmentOwner,
} from "@/lib/attachments";
import { MEETING_LABELS, TESTING_LABELS } from "@/lib/constants";

export type PanelAttachment = {
  id: string;
  fileName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedById?: string;
};

/**
 * Files hanging off a meeting or a requirement.
 *
 * The two pages ask the same question — drop a file, list what is there, open
 * or download it, delete your own — so they ask it once here. `owner` is what
 * decides which row the API checks the caller against; the panel never knows
 * which one it is looking at.
 */
export function AttachmentsPanel({
  attachments,
  owner,
  refreshKey,
  canUpload = false,
  currentUserId,
  emptyLabel,
  uploadLabel,
  onOpenImage,
}: {
  attachments: PanelAttachment[];
  owner: AttachmentOwner;
  /** The detail query to refetch once a file lands or leaves. */
  refreshKey: QueryKey;
  canUpload?: boolean;
  currentUserId?: string;
  emptyLabel?: string;
  uploadLabel?: string;
  onOpenImage?: (url: string) => void;
}) {
  const qc = useQueryClient();
  const [percent, setPercent] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const uploading = percent !== null;

  const upload = async (files: File[]) => {
    if (!files.length) return;
    setPercent(0);
    try {
      for (const file of files) {
        await uploadAttachment(file, owner, { onUploadProgress: setPercent });
      }
      await qc.refetchQueries({ queryKey: refreshKey });
      toast.success(TESTING_LABELS.saved);
    } catch (e: unknown) {
      const message = (e as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      toast.error(message || TESTING_LABELS.uploadFailed);
    } finally {
      setPercent(null);
    }
  };

  const remove = async (attachmentId: string) => {
    setDeletingId(attachmentId);
    try {
      await deleteAttachment(attachmentId);
      await qc.refetchQueries({ queryKey: refreshKey });
      toast.success(TESTING_LABELS.saved);
    } catch {
      toast.error(TESTING_LABELS.detachFailed);
    } finally {
      setDeletingId(null);
    }
  };

  const open = (attachment: PanelAttachment) => {
    if (attachment.mimeType?.startsWith("image/") && onOpenImage) {
      fetchAttachmentObjectUrl(attachment.id)
        .then(onOpenImage)
        .catch(() => {});
      return;
    }
    void downloadAttachment(attachment.id, attachment.fileName);
  };

  return (
    <div className="min-w-0">
      {canUpload && (
        <FileDropZone onFiles={upload} disabled={uploading}>
          <button
            type="button"
            disabled={uploading}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-3 py-3 text-sm font-medium disabled:opacity-60"
            style={{
              borderColor: "var(--border)",
              color: uploading ? "var(--muted-foreground)" : "#4F46E5",
            }}
          >
            <Paperclip className="h-4 w-4" aria-hidden />
            {uploading
              ? TESTING_LABELS.uploadingPercent(percent ?? 0)
              : (uploadLabel ?? MEETING_LABELS.attachments)}
          </button>
        </FileDropZone>
      )}

      {!attachments.length ? (
        <p className="text-xs" style={{ color: "var(--muted-foreground)" }}>
          {emptyLabel ?? MEETING_LABELS.noAttachments}
        </p>
      ) : (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex min-w-0 items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: "var(--muted)" }}
            >
              <FileText
                className="h-4 w-4 shrink-0"
                style={{ color: "#4F46E5" }}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => open(attachment)}
                className="min-w-0 flex-1 truncate text-start text-sm font-medium"
                style={{ color: "var(--foreground)" }}
              >
                {attachment.fileName}
              </button>
              <button
                type="button"
                onClick={() => void downloadAttachment(attachment.id, attachment.fileName)}
                aria-label={`${TESTING_LABELS.downloadAttachment} ${attachment.fileName}`}
                className="shrink-0 rounded p-1.5"
                style={{ color: "var(--muted-foreground)" }}
              >
                <Download className="h-3.5 w-3.5" aria-hidden />
              </button>
              {canUpload && attachment.uploadedById === currentUserId && (
                <button
                  type="button"
                  disabled={deletingId === attachment.id}
                  onClick={() => void remove(attachment.id)}
                  aria-label={`${MEETING_LABELS.delete} ${attachment.fileName}`}
                  className="shrink-0 rounded p-1.5 disabled:opacity-60"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
