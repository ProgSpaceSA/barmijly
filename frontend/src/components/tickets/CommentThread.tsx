"use client";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { AtSign, Globe, Lock, MessageSquare } from "lucide-react";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { ar } from "date-fns/locale";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import { useAddComment, useDeleteComment, useUpdateComment } from "@/hooks/useTickets";
import { CommentItem } from "@/components/tickets/CommentItem";
import { CommentComposer, type CommentSubmit } from "@/components/tickets/CommentComposer";
import { COMMENT_LABELS } from "@/lib/constants";
import type { MentionUser } from "@/lib/mentions";

/** Isolates a Latin/number run so it keeps its order inside Arabic status copy. */
const ltr = (value: string) => `⁦${value}⁩`;

/** Same author, same channel, within this gap — one visual block, one header. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

type Filter = "ALL" | "INTERNAL" | "MENTIONS";

const errorMessage = (error: any, fallback: string) =>
  error?.response?.data?.message || fallback;

function dayLabel(date: Date) {
  if (isToday(date)) return COMMENT_LABELS.today;
  if (isYesterday(date)) return COMMENT_LABELS.yesterday;
  return format(date, "d MMMM yyyy", { locale: ar });
}

export function CommentThread({
  ticketId,
  comments,
  users,
  currentUserId,
  currentUserName,
  canPostInternal,
  onOpenImage,
}: {
  ticketId: string;
  comments: any[];
  users: MentionUser[];
  currentUserId?: string;
  currentUserName?: string;
  canPostInternal: boolean;
  onOpenImage: (url: string) => void;
}) {
  const qc = useQueryClient();
  const { mutateAsync: addComment } = useAddComment(ticketId);
  const { mutateAsync: updateComment } = useUpdateComment(ticketId);
  const { mutateAsync: deleteComment } = useDeleteComment(ticketId);

  const [visibility, setVisibility] = useState("PUBLIC");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");

  const refresh = useCallback(() => {
    // Prefix, so the activity log picks the comment up in the same pass as the
    // thread — they are two views of the write that just landed.
    qc.invalidateQueries({ queryKey: qk.ticket.detail(ticketId) });
    // A comment also shows on its author's profile.
    qc.invalidateQueries({ queryKey: qk.users.all });
  }, [qc, ticketId]);

  /**
   * Uploads run before the thread refreshes, so the comment and its media land
   * together: from the reader's side nothing is posted until the last byte is
   * in. Returns the names that did not make it, so the caller can say so.
   */
  const uploadAll = useCallback(
    async (files: File[], commentId: string, payload: CommentSubmit) => {
      const failed: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const form = new FormData();
        form.append("file", files[i]);
        payload.setStatus(
          `${COMMENT_LABELS.uploading} ${ltr(`${i + 1}/${files.length}`)}`,
        );
        try {
          await api.post(`/attachments/upload?ticketId=${ticketId}&commentId=${commentId}`, form, {
            headers: { "Content-Type": "multipart/form-data" },
            onUploadProgress: (event) => {
              const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
              payload.setFileProgress(i, percent);
            },
          });
          payload.setFileProgress(i, 100);
        } catch {
          failed.push(files[i].name);
        }
      }
      return failed;
    },
    [ticketId],
  );

  const handleCreate = useCallback(
    async (payload: CommentSubmit) => {
      payload.setStatus(COMMENT_LABELS.posting);

      let created: any;
      try {
        created = await addComment({
          content: payload.content,
          visibility,
          mentions: payload.mentions,
        });
      } catch (error) {
        // Nothing reached the server, so the draft has to survive — rethrowing
        // is what tells the composer to keep it.
        toast.error(errorMessage(error, "تعذّر إضافة التعليق"));
        throw error;
      }

      const failed = payload.files.length ? await uploadAll(payload.files, created.id, payload) : [];

      payload.setStatus(COMMENT_LABELS.refreshing);
      await refresh();

      if (failed.length) toast.error(`تعذّر رفع: ${failed.join("، ")}`);
      else toast.success("تم إضافة التعليق");
    },
    [addComment, refresh, uploadAll, visibility],
  );

  const handleEdit = useCallback(
    (commentId: string) => async (payload: CommentSubmit) => {
      payload.setStatus(COMMENT_LABELS.saving);
      try {
        await updateComment({
          id: commentId,
          content: payload.content,
          mentions: payload.mentions,
        });
      } catch (error) {
        toast.error(errorMessage(error, "تعذّر تعديل التعليق"));
        throw error;
      }

      const failed = payload.files.length ? await uploadAll(payload.files, commentId, payload) : [];

      payload.setStatus(COMMENT_LABELS.refreshing);
      await refresh();
      setEditingId(null);

      if (failed.length) toast.error(`تعذّر رفع: ${failed.join("، ")}`);
      else toast.success("تم تعديل التعليق");
    },
    [refresh, updateComment, uploadAll],
  );

  const handleDelete = useCallback(
    (commentId: string) => async () => {
      try {
        await deleteComment(commentId);
        await refresh();
        toast.success("تم حذف التعليق");
      } catch (error) {
        toast.error(errorMessage(error, "تعذّر حذف التعليق"));
      }
    },
    [deleteComment, refresh],
  );

  const counts = useMemo(
    () => ({
      all: comments.length,
      internal: comments.filter((c) => c.visibility === "INTERNAL").length,
      mentions: currentUserId
        ? comments.filter((c) => (c.mentions ?? []).includes(currentUserId)).length
        : 0,
    }),
    [comments, currentUserId],
  );

  const visible = useMemo(() => {
    if (filter === "INTERNAL") return comments.filter((c) => c.visibility === "INTERNAL");
    if (filter === "MENTIONS") {
      return comments.filter((c) => (c.mentions ?? []).includes(currentUserId));
    }
    return comments;
  }, [comments, currentUserId, filter]);

  /** Day headers and author grouping, decided once per render of the list. */
  const rows = useMemo(
    () =>
      visible.map((comment, i) => {
        const previous = visible[i - 1];
        const at = new Date(comment.createdAt);
        const previousAt = previous ? new Date(previous.createdAt) : null;
        const newDay = !previousAt || !isSameDay(at, previousAt);
        return {
          comment,
          daySeparator: newDay ? dayLabel(at) : null,
          grouped:
            !newDay &&
            !!previous &&
            previous.author?.id === comment.author?.id &&
            previous.visibility === comment.visibility &&
            at.getTime() - (previousAt?.getTime() ?? 0) < GROUP_WINDOW_MS,
        };
      }),
    [visible],
  );

  const visibilityPicker = canPostInternal ? (
    <div className="brm-seg" role="group" aria-label={COMMENT_LABELS.visibility}>
      <button
        type="button"
        data-on={visibility === "PUBLIC"}
        onClick={() => setVisibility("PUBLIC")}
      >
        <Globe className="w-3 h-3" /> {COMMENT_LABELS.public}
      </button>
      <button
        type="button"
        data-tone="internal"
        data-on={visibility === "INTERNAL"}
        onClick={() => setVisibility("INTERNAL")}
      >
        <Lock className="w-3 h-3" /> {COMMENT_LABELS.internal}
      </button>
    </div>
  ) : null;

  return (
    <div>
      {counts.all >= 5 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          {(
            [
              ["ALL", COMMENT_LABELS.filterAll, counts.all, null],
              ["INTERNAL", COMMENT_LABELS.internal, counts.internal, Lock],
              ["MENTIONS", COMMENT_LABELS.filterMentions, counts.mentions, AtSign],
            ] as const
          )
            .filter(([, , count]) => count > 0)
            .map(([key, label, count, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key as Filter)}
                className="brm-tool-btn"
                style={
                  filter === key
                    ? {
                        background: "color-mix(in srgb, #4F46E5 14%, transparent)",
                        color: "#4F46E5",
                        borderColor: "rgba(79,70,229,0.3)",
                      }
                    : { borderColor: "var(--border)" }
                }
              >
                {Icon && <Icon className="w-3 h-3" />}
                {label}
                <span className="font-brm opacity-70">{count}</span>
              </button>
            ))}
        </div>
      )}

      <div className="mb-4">
        {visible.length === 0 ? (
          <div className="brm-thread-empty">
            <span className="icon">
              <MessageSquare className="w-5 h-5" />
            </span>
            <p className="title">
              {counts.all === 0 ? COMMENT_LABELS.empty : COMMENT_LABELS.emptyFilter}
            </p>
            {counts.all === 0 && <p className="hint">{COMMENT_LABELS.emptyHint}</p>}
          </div>
        ) : (
          rows.map(({ comment, daySeparator, grouped }) => (
            <div key={comment.id} className={daySeparator ? undefined : grouped ? "mt-1.5" : "mt-3"}>
              {daySeparator && (
                <div className="brm-day-sep">
                  <span>{daySeparator}</span>
                </div>
              )}
              <CommentItem
                comment={comment}
                users={users}
                currentUserId={currentUserId}
                currentUserName={currentUserName}
                editing={editingId === comment.id}
                grouped={grouped}
                onStartEdit={() => setEditingId(comment.id)}
                onCancelEdit={() => setEditingId(null)}
                onSubmitEdit={handleEdit(comment.id)}
                onDelete={handleDelete(comment.id)}
                onOpenImage={onOpenImage}
              />
            </div>
          ))
        )}
      </div>

      <CommentComposer
        users={users}
        currentUserId={currentUserId}
        currentUserName={currentUserName}
        onSubmit={handleCreate}
        toolbarStart={visibilityPicker}
      />

      {visibility === "INTERNAL" && (
        <p className="brm-hint-internal">
          <Lock className="w-3 h-3 shrink-0" />
          {COMMENT_LABELS.internalHint}
        </p>
      )}
    </div>
  );
}
