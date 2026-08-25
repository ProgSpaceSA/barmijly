import api from "@/lib/api";

/**
 * Attachments are fetched through `GET /attachments/:id/file`, which checks the
 * caller against the ticket scope. The raw `/uploads/...` path the API stores
 * is served statically and answers to anyone holding the URL, so it must not be
 * used for ticket files — only for public assets like company logos.
 *
 * Because the authorised route needs an `Authorization` header and `<img src>`
 * cannot send one, the bytes are fetched with the API client and handed to the
 * browser as an object URL.
 */
export function attachmentPath(attachmentId: string): string {
  return `/attachments/${attachmentId}/file`;
}

/** Fetches an attachment and returns an object URL. Revoke it when done. */
export async function fetchAttachmentObjectUrl(attachmentId: string): Promise<string> {
  const res = await api.get(attachmentPath(attachmentId), { responseType: "blob" });
  return URL.createObjectURL(res.data as Blob);
}

/** Saves an attachment to disk under its original name. */
export async function downloadAttachment(attachmentId: string, fileName: string): Promise<void> {
  const url = await fetchAttachmentObjectUrl(attachmentId);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Give the click a tick to start before the handle goes away.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export type AttachmentOwner = Partial<
  Record<
    "ticketId" | "commentId" | "taskId" | "testCaseId" | "bugId" | "testStepId" | "suiteId",
    string
  >
>;

/**
 * Uploads one file against whichever owner is given. The API takes the owner
 * as a query param and resolves scope from it, so callers never have to know
 * which check applies to a step versus a ticket.
 */
export async function uploadAttachment(
  file: File,
  owner: AttachmentOwner,
  options?: { onUploadProgress?: (percent: number) => void },
) {
  const form = new FormData();
  form.append("file", file);
  const params = new URLSearchParams(
    Object.entries(owner).filter(([, v]) => Boolean(v)) as [string, string][],
  );
  const res = await api.post(`/attachments/upload?${params.toString()}`, form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (event) => {
      if (!options?.onUploadProgress) return;
      const percent = event.total ? Math.round((event.loaded / event.total) * 100) : 0;
      options.onUploadProgress(percent);
    },
  });
  return res.data;
}

/** Removes one attachment row and its file. */
export async function deleteAttachment(attachmentId: string) {
  await api.delete(`/attachments/${attachmentId}`);
}
