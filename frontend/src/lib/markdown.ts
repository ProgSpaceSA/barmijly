/**
 * Ticket descriptions are stored as Markdown source — plain text, exactly what
 * the writer typed. Nothing here parses Markdown for display (that is
 * `react-markdown`'s job inside `<Markdown>`); this module owns the two things
 * a renderer cannot do: painting the source with syntax colours behind the
 * editor, and rewriting the source when someone presses a toolbar button.
 *
 * Every function is pure and works on `(value, selection)`, so the editor stays
 * a thin controlled component and the interesting cases are unit-testable.
 */

// ── Source highlighting ────────────────────────────────────────────────────

export type MarkdownTokenKind =
  | "text"
  | "marker"
  | "heading"
  | "code"
  | "quote"
  | "strong"
  | "em"
  | "del"
  | "link"
  | "url"
  | "task"
  | "rule";

export type MarkdownToken = { kind: MarkdownTokenKind; value: string };

const FENCE = /^(\s{0,3})(```|~~~)(.*)$/;
const THEMATIC_BREAK = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const HEADING = /^(\s{0,3}#{1,6}[ \t]+)/;
const BLOCKQUOTE = /^(\s{0,3}>+[ \t]?)/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])([ \t]+)/;
const TASK_BOX = /^(\[[ xX]\][ \t]+)/;
const TABLE_ROW = /^\s{0,3}\|.*\|\s*$/;
const TABLE_DIVIDER = /^\s{0,3}\|[\s|:-]+\|\s*$/;

/**
 * Splits Markdown source into coloured runs. Concatenating every `value` must
 * reproduce the input character for character — the editor paints these spans
 * underneath a transparent `<textarea>`, so one dropped or added glyph would
 * slide the whole line out from under the caret.
 */
export function highlightMarkdown(source: string): MarkdownToken[] {
  const out: MarkdownToken[] = [];
  const push = (kind: MarkdownTokenKind, value: string) => {
    if (!value) return;
    const last = out[out.length - 1];
    if (last && last.kind === kind) last.value += value;
    else out.push({ kind, value });
  };

  const lines = source.split("\n");
  let openFence: string | null = null;

  lines.forEach((line, index) => {
    if (index > 0) push("text", "\n");

    if (openFence !== null) {
      const closing = FENCE.exec(line);
      if (closing && closing[2] === openFence) {
        push("marker", line);
        openFence = null;
      } else {
        push("code", line);
      }
      return;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      push("marker", line);
      openFence = fence[2];
      return;
    }

    for (const token of lineTokens(line)) push(token.kind, token.value);
  });

  return out;
}

function lineTokens(line: string): MarkdownToken[] {
  const out: MarkdownToken[] = [];
  const push = (kind: MarkdownTokenKind, value: string) => {
    if (value) out.push({ kind, value });
  };

  let rest = line;

  const quote = BLOCKQUOTE.exec(rest);
  if (quote) {
    push("quote", quote[1]);
    rest = rest.slice(quote[1].length);
  }

  if (THEMATIC_BREAK.test(rest)) {
    push("rule", rest);
    return out;
  }

  if (TABLE_DIVIDER.test(rest)) {
    push("marker", rest);
    return out;
  }

  const heading = HEADING.exec(rest);
  if (heading) {
    push("marker", heading[1]);
    // Heading text gets its own colour, but inline syntax inside it still wins.
    for (const token of inlineTokens(rest.slice(heading[1].length))) {
      push(token.kind === "text" ? "heading" : token.kind, token.value);
    }
    return out;
  }

  const item = LIST_ITEM.exec(rest);
  if (item) {
    push("marker", item[0]);
    rest = rest.slice(item[0].length);
    const task = TASK_BOX.exec(rest);
    if (task) {
      push("task", task[1]);
      rest = rest.slice(task[1].length);
    }
  }

  if (TABLE_ROW.test(rest)) {
    for (const cell of rest.split(/(\|)/)) {
      if (cell === "|") push("marker", cell);
      else for (const token of inlineTokens(cell)) push(token.kind, token.value);
    }
    return out;
  }

  for (const token of inlineTokens(rest)) push(token.kind, token.value);
  return out;
}

const INLINE_CODE = /^(`+)([\s\S]*?)\1/;
const STRONG = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/;
const EMPHASIS = /^(\*|_)(?=\S)([^\n]*?\S)\1/;
const STRIKE = /^(~~)(?=\S)([\s\S]*?\S)\1/;
const LINK = /^(!?)\[([^\]]*)\]\(([^()\s]*(?:\([^()]*\)[^()\s]*)*)((?:\s+"[^"]*")?)\)/;
const AUTOLINK = /^<(https?:\/\/[^>\s]+|[^\s@<>]+@[^\s@<>]+)>/;
const BARE_URL = /^https?:\/\/[^\s<>)\]]+/;

function inlineTokens(text: string): MarkdownToken[] {
  const out: MarkdownToken[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) out.push({ kind: "text", value: buffer });
    buffer = "";
  };
  const push = (kind: MarkdownTokenKind, value: string) => {
    if (value) out.push({ kind, value });
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    const ahead = text.slice(i);

    if (ch === "\\" && i + 1 < text.length) {
      buffer += text.slice(i, i + 2);
      i += 2;
      continue;
    }

    if (ch === "`") {
      const code = INLINE_CODE.exec(ahead);
      if (code) {
        flush();
        push("code", code[0]);
        i += code[0].length;
        continue;
      }
    }

    if (ch === "*" || ch === "_") {
      const strong = STRONG.exec(ahead);
      if (strong) {
        flush();
        push("marker", strong[1]);
        push("strong", strong[2]);
        push("marker", strong[1]);
        i += strong[0].length;
        continue;
      }
      const em = EMPHASIS.exec(ahead);
      if (em) {
        flush();
        push("marker", em[1]);
        push("em", em[2]);
        push("marker", em[1]);
        i += em[0].length;
        continue;
      }
    }

    if (ch === "~") {
      const del = STRIKE.exec(ahead);
      if (del) {
        flush();
        push("marker", del[1]);
        push("del", del[2]);
        push("marker", del[1]);
        i += del[0].length;
        continue;
      }
    }

    if (ch === "[" || (ch === "!" && text[i + 1] === "[")) {
      const link = LINK.exec(ahead);
      if (link) {
        flush();
        push("marker", `${link[1]}[`);
        push("link", link[2]);
        push("marker", "](");
        push("url", link[3] + link[4]);
        push("marker", ")");
        i += link[0].length;
        continue;
      }
    }

    if (ch === "<") {
      const auto = AUTOLINK.exec(ahead);
      if (auto) {
        flush();
        push("url", auto[0]);
        i += auto[0].length;
        continue;
      }
    }

    if ((ch === "h" || ch === "H") && !/[\w/]/.test(text[i - 1] ?? "")) {
      const bare = BARE_URL.exec(ahead);
      if (bare) {
        flush();
        push("url", bare[0]);
        i += bare[0].length;
        continue;
      }
    }

    buffer += ch;
    i += 1;
  }

  flush();
  return out;
}

// ── Editing commands ───────────────────────────────────────────────────────

export type Selection = { start: number; end: number };
export type EditResult = { value: string; start: number; end: number };

/** Offset of the start of the line the given offset sits on. */
function lineStart(value: string, offset: number): number {
  return value.lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
}

/** Offset of the end of that line, excluding the newline itself. */
function lineEnd(value: string, offset: number): number {
  const next = value.indexOf("\n", offset);
  return next === -1 ? value.length : next;
}

/**
 * Wraps or unwraps the selection with an inline token (`**`, `_`, `` ` ``, `~~`).
 *
 * Whitespace is pushed outside the markers — `**bold **` renders as literal
 * asterisks, and double-clicking a word usually drags a space along with it.
 */
export function toggleWrap(value: string, sel: Selection, token: string): EditResult {
  const raw = value.slice(sel.start, sel.end);
  const leading = raw.length - raw.trimStart().length;
  const trailing = raw.length - raw.trimEnd().length;
  const start = sel.start + leading;
  const end = raw.trim() ? sel.end - trailing : sel.end;
  const inner = value.slice(start, end);

  // Already wrapped inside the selection: all of `**bold**` is selected.
  if (inner.length >= token.length * 2 && inner.startsWith(token) && inner.endsWith(token)) {
    const stripped = inner.slice(token.length, inner.length - token.length);
    return {
      value: value.slice(0, start) + stripped + value.slice(end),
      start,
      end: start + stripped.length,
    };
  }

  // Wrapped just outside it: `**bold**` with only `bold` selected.
  const before = value.slice(Math.max(0, start - token.length), start);
  const after = value.slice(end, end + token.length);
  if (before === token && after === token) {
    return {
      value: value.slice(0, start - token.length) + inner + value.slice(end + token.length),
      start: start - token.length,
      end: end - token.length,
    };
  }

  const next = value.slice(0, start) + token + inner + token + value.slice(end);
  return inner
    ? { value: next, start: start + token.length, end: end + token.length }
    : { value: next, start: start + token.length, end: start + token.length };
}

export type LinePrefix = {
  /** Matches the prefix this command owns, so pressing it twice removes it. */
  match: RegExp;
  /** Built per line, so ordered lists can count. */
  build: (index: number) => string;
  /** Prefixes this one replaces — a bullet should convert, not stack. */
  replaces?: RegExp;
};

/**
 * Adds, removes, or swaps a line prefix across every line the selection covers.
 * Pressing the same button twice undoes it; pressing a different block button
 * converts the line instead of stacking two markers on it.
 */
export function toggleLinePrefix(value: string, sel: Selection, prefix: LinePrefix): EditResult {
  const from = lineStart(value, sel.start);
  const to = lineEnd(value, sel.end);
  const block = value.slice(from, to);
  const lines = block.split("\n");
  const meaningful = lines.filter((line) => line.trim().length > 0);
  const allMatch = meaningful.length > 0 && meaningful.every((line) => prefix.match.test(line));

  let counter = 0;
  const nextLines = lines.map((line) => {
    if (!line.trim() && lines.length > 1) return line;
    if (allMatch) return line.replace(prefix.match, "$1");
    const bare = prefix.replaces
      ? line.replace(prefix.replaces, "$1")
      : line.replace(prefix.match, "$1");
    const indent = /^\s*/.exec(bare)?.[0] ?? "";
    return indent + prefix.build(counter++) + bare.slice(indent.length);
  });

  const next = nextLines.join("\n");
  const headDelta = nextLines[0].length - lines[0].length;
  const collapsed = sel.start === sel.end;

  return {
    value: value.slice(0, from) + next + value.slice(to),
    start: collapsed ? Math.max(from, sel.start + headDelta) : from,
    end: collapsed ? Math.max(from, sel.start + headDelta) : to + (next.length - block.length),
  };
}

/** Any list marker, used so one block command replaces another cleanly. */
const ANY_LIST = /^(\s*)(?:[-*+]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?/;

export const BULLET_PREFIX: LinePrefix = {
  match: /^(\s*)[-*+][ \t]+(?!\[[ xX]\][ \t])/,
  build: () => "- ",
  replaces: ANY_LIST,
};

export const NUMBER_PREFIX: LinePrefix = {
  match: /^(\s*)\d{1,9}[.)][ \t]+/,
  build: (index) => `${index + 1}. `,
  replaces: ANY_LIST,
};

export const TASK_PREFIX: LinePrefix = {
  match: /^(\s*)[-*+][ \t]+\[[ xX]\][ \t]+/,
  build: () => "- [ ] ",
  replaces: ANY_LIST,
};

export const QUOTE_PREFIX: LinePrefix = {
  match: /^(\s*)>[ \t]?/,
  build: () => "> ",
};

export function headingPrefix(level: number): LinePrefix {
  return {
    match: new RegExp(`^(\\s*)#{${level}}[ \\t]+`),
    build: () => `${"#".repeat(level)} `,
    replaces: /^(\s*)#{1,6}[ \t]+/,
  };
}

/**
 * What Enter should type when the caret sits inside a list, task list, or
 * quote. Returns `null` for ordinary prose so the browser's own Enter stays in
 * charge — including its undo stack.
 */
export function continueBlock(value: string, caret: number): EditResult | null {
  const from = lineStart(value, caret);
  const line = value.slice(from, caret);

  const item = /^(\s*)([-*+]|(\d{1,9})([.)]))([ \t]+)(\[[ xX]\][ \t]+)?(.*)$/.exec(line);
  if (item) {
    const [, indent, bullet, digits, delimiter, gap, task, content] = item;
    // An empty item means "this list is finished" — clear the marker rather
    // than laying down another one, outdenting first when it is nested.
    if (!content.trim()) {
      const cleared = indent.length >= 2 ? indent.slice(2) : "";
      return {
        value: value.slice(0, from) + cleared + value.slice(caret),
        start: from + cleared.length,
        end: from + cleared.length,
      };
    }
    const marker = digits ? `${Number(digits) + 1}${delimiter}` : bullet;
    const insert = `\n${indent}${marker}${gap}${task ? "[ ] " : ""}`;
    return {
      value: value.slice(0, caret) + insert + value.slice(caret),
      start: caret + insert.length,
      end: caret + insert.length,
    };
  }

  const quote = /^(\s*)(>+)([ \t]?)(.*)$/.exec(line);
  if (quote) {
    const [, indent, arrows, gap, content] = quote;
    if (!content.trim()) {
      return { value: value.slice(0, from) + value.slice(caret), start: from, end: from };
    }
    const insert = `\n${indent}${arrows}${gap || " "}`;
    return {
      value: value.slice(0, caret) + insert + value.slice(caret),
      start: caret + insert.length,
      end: caret + insert.length,
    };
  }

  return null;
}

const INDENT = "  ";

/** Tab / Shift+Tab across every line the selection touches. */
export function indentLines(value: string, sel: Selection, outdent: boolean): EditResult {
  const from = lineStart(value, sel.start);
  const to = lineEnd(value, sel.end);
  const block = value.slice(from, to);

  let headDelta = 0;
  const next = block
    .split("\n")
    .map((line, index) => {
      if (outdent) {
        const removed = /^[ \t]{1,2}/.exec(line)?.[0] ?? "";
        if (index === 0) headDelta = -removed.length;
        return line.slice(removed.length);
      }
      if (index === 0) headDelta = INDENT.length;
      return INDENT + line;
    })
    .join("\n");

  const collapsed = sel.start === sel.end;
  return {
    value: value.slice(0, from) + next + value.slice(to),
    start: Math.max(from, sel.start + headDelta),
    end: collapsed ? Math.max(from, sel.start + headDelta) : to + (next.length - block.length),
  };
}

/**
 * Drops a whole block (table, code fence, divider) at the caret — always on its
 * own line, always followed by a newline so the next paragraph is not swallowed
 * into it. `$0` inside the snippet marks where the caret should land.
 */
export function insertBlock(value: string, sel: Selection, snippet: string): EditResult {
  const from = lineStart(value, sel.start);
  const currentLine = value.slice(from, lineEnd(value, sel.end));
  const at = currentLine.trim() ? lineEnd(value, sel.end) : from;

  const before = value.slice(0, at);
  const after = value.slice(at);
  const lead = before && !before.endsWith("\n") ? "\n\n" : "";
  const tail = after.startsWith("\n") || !after ? "" : "\n";

  const caretAt = snippet.indexOf("$0");
  const body = caretAt === -1 ? snippet : snippet.replace("$0", "");
  const caret = at + lead.length + (caretAt === -1 ? body.length : caretAt);

  return { value: `${before}${lead}${body}${tail}${after}`, start: caret, end: caret };
}

/** Inline insert that keeps whatever is selected — the link command. */
export function insertLink(value: string, sel: Selection, url = ""): EditResult {
  const text = value.slice(sel.start, sel.end);
  const body = `[${text}](${url})`;
  const next = value.slice(0, sel.start) + body + value.slice(sel.end);
  // The caret goes wherever there is still typing to do: the URL if the label
  // is already written, otherwise the label.
  const caret = text ? sel.start + text.length + 3 + url.length : sel.start + 1;
  return { value: next, start: caret, end: caret };
}

const URL_ONLY = /^(https?:\/\/|mailto:)\S+$/i;

/**
 * Pasting a URL over selected text should link it, the way every modern editor
 * behaves. Returns `null` when the paste is not a bare URL, so the default
 * paste happens instead.
 */
export function linkPastedUrl(value: string, sel: Selection, pasted: string): EditResult | null {
  const url = pasted.trim();
  if (sel.start === sel.end || !URL_ONLY.test(url)) return null;
  const text = value.slice(sel.start, sel.end);
  if (URL_ONLY.test(text.trim())) return null;
  return insertLink(value, sel, url);
}

/** Word and character counts for the editor footer. */
export function markdownStats(source: string): { words: number; chars: number } {
  const trimmed = source.trim();
  return { words: trimmed ? trimmed.split(/\s+/).length : 0, chars: source.length };
}
