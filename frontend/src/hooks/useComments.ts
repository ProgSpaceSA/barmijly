"use client";
import { useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryKey } from "@tanstack/react-query";
import api from "@/lib/api";
import { qk } from "@/lib/query-keys";
import type { AttachmentOwner } from "@/lib/attachments";

/** The two things a comment thread can hang off. */
export type CommentParent = { kind: "ticket"; id: string } | { kind: "requirement"; id: string };
type CommentRow = { id: string } & Record<string, unknown>;
type CommentParentDetail = { comments?: CommentRow[] } & Record<string, unknown>;

/** `/tickets/:id/comments` or `/requirements/:id/comments`. */
export function commentBasePath(parent: CommentParent): string {
  return parent.kind === "ticket"
    ? `/tickets/${parent.id}/comments`
    : `/requirements/${parent.id}/comments`;
}

/**
 * The upload owner for a file posted with a comment.
 *
 * The parent id rides along beside `commentId` because the API resolves scope
 * from whichever owner it is given, and a comment attachment has to answer to
 * the same row the comment does.
 */
export function commentAttachmentOwner(
  parent: CommentParent,
  commentId: string,
): AttachmentOwner {
  return parent.kind === "ticket"
    ? { ticketId: parent.id, commentId }
    : { requirementId: parent.id, commentId };
}

/** The cache entry the thread was read out of. */
export function commentParentKey(parent: CommentParent): QueryKey {
  return parent.kind === "ticket"
    ? qk.ticket.detail(parent.id)
    : qk.requirements.detail(parent.id);
}

/**
 * Posting, editing and deleting a comment on either parent.
 *
 * Deliberately quiet: a comment can carry attachments, and the thread only
 * refreshes and reports once every upload has landed. Toasting or invalidating
 * inside the mutation would announce a half-uploaded comment — which is why
 * `refresh` is handed back for the caller to run at the end.
 */
export function useComments(parent: CommentParent) {
  const qc = useQueryClient();
  const base = commentBasePath(parent);
  const parentKey = commentParentKey(parent);

  const refresh = useCallback(async () => {
    // Prefix, so the activity log picks the comment up in the same pass as the
    // thread — they are two views of the write that just landed.
    await qc.refetchQueries({ queryKey: parentKey, type: "all" });
    // A comment also shows on its author's profile.
    qc.invalidateQueries({ queryKey: qk.users.all });
  }, [qc, parentKey]);

  const add = useMutation({
    mutationFn: (data: { content: string; visibility?: string; mentions?: string[] }) =>
      api.post(base, data).then((r) => r.data as CommentRow),
    onSuccess: (created) => {
      qc.setQueryData<CommentParentDetail>(parentKey, (current) =>
        current
          ? { ...current, comments: [...(current.comments ?? []), created] }
          : current,
      );
    },
  });

  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: string; content: string; mentions?: string[] }) =>
      api.patch(`${base}/${id}`, data).then((r) => r.data as CommentRow),
    onSuccess: (updated) => {
      qc.setQueryData<CommentParentDetail>(parentKey, (current) =>
        current
          ? {
              ...current,
              comments: (current.comments ?? []).map((comment) =>
                comment.id === updated.id ? updated : comment,
              ),
            }
          : current,
      );
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`${base}/${id}`).then((r) => r.data),
    onSuccess: (_result, id) => {
      qc.setQueryData<CommentParentDetail>(parentKey, (current) =>
        current
          ? {
              ...current,
              comments: (current.comments ?? []).filter((comment) => comment.id !== id),
            }
          : current,
      );
    },
  });

  return { add, update, remove, refresh, basePath: base };
}
