"use client";
import { useMemo } from "react";
import { splitMentions, mentionName, type MentionUser } from "@/lib/mentions";
import { ROLE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Renders a comment body with resolved mentions highlighted.
 *
 * `dir` is the comment's writing direction so `@` sits on the right in Arabic
 * and on the left in English, instead of each name picking its own side.
 *
 * `isolate={false}` is for the composer's highlight layer, which mirrors a live
 * <textarea>. A textarea applies plain bidi with no isolation, and in HTML any
 * `dir` attribute — `<bdi>` included — turns on `unicode-bidi: isolate`. Adding
 * one here would reorder the painted line away from the caret the textarea is
 * drawing, which is exactly what a mention typed in `auto` mode looked like.
 */
export function MentionText({
  content,
  users,
  className,
  currentUserId,
  dir = "rtl",
  isolate = true,
}: {
  content: string;
  users: MentionUser[];
  className?: string;
  currentUserId?: string;
  dir?: "ltr" | "rtl";
  isolate?: boolean;
}) {
  const segments = useMemo(() => splitMentions(content, users), [content, users]);

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === "text") return <span key={i}>{segment.value}</span>;
        const isSelf = !!currentUserId && segment.user.id === currentUserId;
        const label = [mentionName(segment.user), ROLE_LABELS[segment.user.role ?? ""]]
          .filter(Boolean)
          .join(" — ");
        const classes = cn("brm-mention", isSelf && "brm-mention-self", className);
        return isolate ? (
          <bdi key={i} dir={dir} className={classes} title={label}>
            {segment.value}
          </bdi>
        ) : (
          <span key={i} className={classes}>
            {segment.value}
          </span>
        );
      })}
    </>
  );
}
