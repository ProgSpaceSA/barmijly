import { COMMENT_LABELS } from "@/lib/constants";

export type PersonLike = {
  id?: string;
  firstName?: string;
  lastName?: string;
} | null | undefined;

export function personFullName(person: PersonLike): string {
  if (!person) return "";
  return `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim();
}

/** Show the person's name like everyone else, with a small «أنت» badge when it is the viewer. */
export function UserNameWithYou({
  person,
  currentUserId,
  className,
  nameClassName,
}: {
  person: PersonLike;
  currentUserId?: string;
  className?: string;
  nameClassName?: string;
}) {
  const name = personFullName(person);
  const isMe = !!currentUserId && person?.id === currentUserId;
  if (!name && !isMe) return null;

  return (
    <span className={className ?? "inline-flex items-center gap-1.5 flex-wrap min-w-0"}>
      {name && (
        <span dir="auto" className={nameClassName}>{name}</span>
      )}
      {isMe && (
        <span className="brm-badge brm-badge-you shrink-0">{COMMENT_LABELS.you}</span>
      )}
    </span>
  );
}
