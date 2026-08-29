/**
 * Mentions are stored as plain text inside the comment body (`@أحمد علي`), with
 * the authoritative user ids kept alongside in `mentions`. Rendering therefore
 * resolves names against a known list instead of trusting a regex: a handle the
 * list cannot explain is ordinary text, which is what makes an edited-away
 * mention fall back to plain text on its own.
 */

export type MentionUser = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  role?: string | null;
};

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; user: MentionUser };

/** Letters and digits in any script — `\w` alone would treat Arabic as a break. */
const WORD_CHAR = /[\p{L}\p{N}_]/u;

/**
 * What may sit in front of an `@` inside an email address. Arabic letters are
 * deliberately not on the list: `و@أحمد` is "and @Ahmad", a normal way to write
 * Arabic, while `sara@brm.sa` is an address and must never light up blue.
 */
const EMAIL_LOCAL_CHAR = /[A-Za-z0-9._%+-]/;

/** Any Unicode space — NBSP, narrow NBSP, etc. Typed names rarely match the chip's NBSP. */
const SPACE = /\s/u;

/** Invisible marks — isolates (U+2066–2069) show up as ⁦/⁧; these do not. */
const LRM = "\u200E";
const RLM = "\u200F";

export function stripBidiIsolates(content: string): string {
  return content.replace(/[\u2066\u2067\u2068\u2069]/g, "");
}

export function stripWritingDirMarks(content: string): string {
  return content.replace(/[\u200E\u200F]/g, "");
}

/** Editor text: no hidden marks. Direction is encoded only on save. */
export function sanitizeCommentText(content: string): string {
  return stripWritingDirMarks(stripBidiIsolates(content));
}

export function encodeWritingDir(content: string, dir: "auto" | "ltr" | "rtl"): string {
  const body = sanitizeCommentText(content);
  if (dir === "rtl") return RLM + body;
  if (dir === "ltr") return LRM + body;
  return body;
}

export function mentionName(user: MentionUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
}

/**
 * A non-breaking space keeps first + last name on one chip so `@جود العنزي`
 * cannot wrap into two half-pills. Direction of `@` follows the comment, not
 * a mark stored in the text.
 */
export function mentionToken(user: MentionUser): string {
  return `@${[user.firstName, user.lastName].filter(Boolean).join("\u00A0")}`;
}

/**
 * Saved comments start with LRM/RLM when the writer picked LTR/RTL. Without a
 * mark, the first strong letter wins — the same rule `dir="auto"` uses.
 */
export function inferWritingDir(content: string): "ltr" | "rtl" {
  const cleaned = stripBidiIsolates(content);
  if (cleaned.startsWith(RLM)) return "rtl";
  if (cleaned.startsWith(LRM)) return "ltr";
  for (const ch of stripWritingDirMarks(cleaned)) {
    if (/\p{Script=Arabic}|\p{Script=Hebrew}/u.test(ch)) return "rtl";
    if (/\p{L}/u.test(ch)) return "ltr";
  }
  return "rtl";
}

/**
 * Every spelling a stored comment may hold for one person. The thread used to
 * write `@FirstLast`, so those keep resolving rather than turning grey the day
 * the format changed. Older comments also used a breaking space in the name.
 */
function handleVariants(user: MentionUser): string[] {
  const first = (user.firstName ?? "").trim();
  const last = (user.lastName ?? "").trim();
  const full = mentionName(user);
  const glued = [first, last].filter(Boolean).join("\u00A0");
  return [...new Set([full, glued, `${first}${last}`, `${first}_${last}`].filter((v) => v.length > 0))];
}

export type MentionHandleEntry = { handle: string; user: MentionUser };

export function mentionHandleTable(users: MentionUser[]): MentionHandleEntry[] {
  const table: MentionHandleEntry[] = [];
  for (const user of users) {
    if (!user?.id) continue;
    for (const handle of handleVariants(user)) {
      table.push({ handle, user });
    }
  }
  // Longest first, so "@أحمد علي" wins over a colleague spelled "@أحمد".
  return table.sort((a, b) => b.handle.length - a.handle.length);
}

/**
 * How many characters of `rest` spell `handle`, treating every Unicode space as
 * equal (regular space ↔ NBSP ↔ narrow NBSP). Returns null when they diverge.
 */
function matchHandleLength(rest: string, handle: string): number | null {
  let ri = 0;
  for (let hi = 0; hi < handle.length; hi++) {
    const h = handle[hi]!;
    const r = rest[ri];
    if (r === undefined) return null;
    if (SPACE.test(h)) {
      if (!SPACE.test(r)) return null;
      ri += 1;
      continue;
    }
    if (r.toLowerCase() !== h.toLowerCase()) return null;
    ri += 1;
  }
  return ri;
}

/**
 * Splits a comment body into plain runs and resolved mentions. Anything that
 * does not spell a candidate exactly — a half-deleted name, an email address,
 * a person who lost access — stays in the text run.
 */
export function splitMentions(
  content: string,
  users: MentionUser[],
  table = mentionHandleTable(users),
): MentionSegment[] {
  const body = sanitizeCommentText(content);
  if (!body) return [];
  if (!table.length) return [{ type: "text", value: body }];

  const segments: MentionSegment[] = [];
  let buffer = "";
  let i = 0;

  while (i < body.length) {
    if (body[i] === "@" && !EMAIL_LOCAL_CHAR.test(body[i - 1] ?? "")) {
      const rest = body.slice(i + 1);
      const hit = table.find((entry) => {
        const len = matchHandleLength(rest, entry.handle);
        return len !== null && !WORD_CHAR.test(rest[len] ?? "");
      });
      if (hit) {
        const len = matchHandleLength(rest, hit.handle)!;
        if (buffer) {
          segments.push({ type: "text", value: buffer });
          buffer = "";
        }
        segments.push({
          type: "mention",
          value: `@${rest.slice(0, len)}`,
          user: hit.user,
        });
        i += 1 + len;
        continue;
      }
    }
    buffer += body[i];
    i += 1;
  }

  if (buffer) segments.push({ type: "text", value: buffer });
  return segments;
}

/** The ids a body still spells out — what the composer sends as `mentions`. */
export function mentionedIdsIn(
  content: string,
  users: MentionUser[],
  table = mentionHandleTable(users),
): string[] {
  const ids = new Set<string>();
  for (const segment of splitMentions(content, users, table)) {
    if (segment.type === "mention") ids.add(segment.user.id);
  }
  return [...ids];
}

/**
 * The `@…` fragment the caret is sitting in, or null when the caret is elsewhere.
 *
 * Spaces are allowed so Arabic/Latin full names (`@محمد مجدي`) keep the picker
 * open; a blank line or a double space ends the query.
 */
export function findMentionQuery(
  content: string,
  caret: number,
  users: MentionUser[] = [],
  table = mentionHandleTable(users),
): { query: string; start: number } | null {
  const before = content.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) return null;
  if (EMAIL_LOCAL_CHAR.test(before[at - 1] ?? "")) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || /\n/.test(query) || /  /.test(query)) return null;

  for (const entry of table) {
    const length = matchHandleLength(query, entry.handle);
    if (length === null || length < entry.handle.length) continue;
    if (WORD_CHAR.test(query[length] ?? "")) continue;
    const after = query[length];
    if (after === undefined || SPACE.test(after)) return null;
  }

  if (/\s$/.test(query) && users.length) {
    const needle = query.replace(/\s+/gu, " ").trim();
    if (needle && !users.some((user) => matchesMentionQuery(user, needle))) return null;
  }

  return { query, start: at };
}

/** Replaces the half-typed `@…` with the picked person and reports the caret. */
export function applyMention(
  content: string,
  from: number,
  to: number,
  user: MentionUser,
): { content: string; caret: number } {
  const token = `${mentionToken(user)} `;
  const prefix = sanitizeCommentText(content.slice(0, from));
  const suffix = sanitizeCommentText(content.slice(to));
  return {
    content: prefix + token + suffix,
    caret: prefix.length + token.length,
  };
}

export function matchesMentionQuery(user: MentionUser, query: string): boolean {
  const needle = query.replace(/\s+/gu, " ").trim().toLowerCase();
  if (!needle) return true;
  return (
    mentionName(user).toLowerCase().includes(needle) ||
    (user.email ?? "").toLowerCase().includes(needle)
  );
}

/** Merge mentionable + already-mentioned people so saved chips keep their colour. */
export function mergeMentionUsers(
  mentionable: MentionUser[],
  extra: Array<MentionUser | null | undefined> = [],
): MentionUser[] {
  const byId = new Map<string, MentionUser>();
  for (const user of [...mentionable, ...extra]) {
    if (user?.id) byId.set(user.id, user);
  }
  return [...byId.values()];
}
