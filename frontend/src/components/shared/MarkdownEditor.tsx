"use client";
import {
  useCallback, useDeferredValue, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Bold, Code, Eye, Heading1, Heading2, Heading3, Image as ImageIcon,
  Italic, Languages, Link2, List, ListOrdered, ListTodo, Minus, Pencil, CircleQuestionMark,
  Quote, SquareCode, Strikethrough, Table,
} from "lucide-react";
import { Markdown } from "@/components/shared/Markdown";
import { MARKDOWN_CHEATSHEET, MARKDOWN_LABELS, EDITOR_DIRECTION_LABELS } from "@/lib/constants";
import {
  BULLET_PREFIX, NUMBER_PREFIX, QUOTE_PREFIX, TASK_PREFIX, continueBlock, headingPrefix,
  highlightMarkdown, indentLines, insertBlock, insertLink, linkPastedUrl, markdownStats,
  toggleLinePrefix, toggleWrap, type EditResult, type Selection,
} from "@/lib/markdown";

/**
 * A Markdown editor for long ticket prose.
 *
 * The text stays a real `<textarea>` — native undo, native spellcheck, native
 * bidi, and a caret the browser places itself. Colour is painted by a mirror
 * layer sitting exactly underneath it, the same trick the comment composer
 * uses. That constrains the highlight to properties which cannot change how
 * text wraps: colour, background, opacity, and underline are safe; a bigger
 * font or a bolder weight would wrap sooner than the textarea and slide the
 * paint off the glyphs.
 *
 * Everything that rewrites the source lives in `@/lib/markdown` as pure
 * functions, so the component only has to own focus, selection, and menus.
 */

export type MarkdownEditorMode = "write" | "preview";
export type EditorDirection = "auto" | "rtl" | "ltr";

const DIRECTION_CYCLE: EditorDirection[] = ["auto", "rtl", "ltr"];
const SLASH_MENU_HEIGHT = 300;

const TABLE_SNIPPET = [
  `| ${MARKDOWN_LABELS.tableHeader} 1 | ${MARKDOWN_LABELS.tableHeader} 2 |`,
  "| --- | --- |",
  `| $0 | ${MARKDOWN_LABELS.tableCell} |`,
].join("\n");

/** `/` at the start of the line the caret is on — the slash-menu trigger. */
export function findSlashQuery(
  value: string,
  caret: number,
): { query: string; start: number } | null {
  const from = value.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const line = value.slice(from, caret);
  const match = /^([ \t]*)\/([\p{L}\p{N}_-]*)$/u.exec(line);
  if (!match) return null;
  return { query: match[2], start: from + match[1].length };
}

type Command = {
  id: string;
  label: string;
  icon: ReactNode;
  /** Rewrites the source. */
  run: (value: string, sel: Selection) => EditResult;
  shortcut?: string;
  /** Extra words the slash menu matches on, so English and Arabic both work. */
  keywords?: string;
  /** Offered by the slash menu — block commands only. */
  inSlash?: boolean;
};

function buildCommands(): Command[] {
  const L = MARKDOWN_LABELS;
  return [
    { id: "bold", label: L.bold, icon: <Bold className="w-3.5 h-3.5" />, shortcut: "Ctrl+B", keywords: "bold عريض", run: (v, s) => toggleWrap(v, s, "**") },
    { id: "italic", label: L.italic, icon: <Italic className="w-3.5 h-3.5" />, shortcut: "Ctrl+I", keywords: "italic مائل", run: (v, s) => toggleWrap(v, s, "*") },
    { id: "strike", label: L.strike, icon: <Strikethrough className="w-3.5 h-3.5" />, shortcut: "Ctrl+Shift+X", keywords: "strike شطب", run: (v, s) => toggleWrap(v, s, "~~") },
    { id: "code", label: L.code, icon: <Code className="w-3.5 h-3.5" />, shortcut: "Ctrl+E", keywords: "code كود", run: (v, s) => toggleWrap(v, s, "`") },
    { id: "link", label: L.link, icon: <Link2 className="w-3.5 h-3.5" />, shortcut: "Ctrl+K", keywords: "link رابط", inSlash: true, run: (v, s) => insertLink(v, s) },

    { id: "h1", label: L.heading1, icon: <Heading1 className="w-3.5 h-3.5" />, keywords: "h1 heading عنوان", inSlash: true, run: (v, s) => toggleLinePrefix(v, s, headingPrefix(1)) },
    { id: "h2", label: L.heading2, icon: <Heading2 className="w-3.5 h-3.5" />, keywords: "h2 heading عنوان", inSlash: true, run: (v, s) => toggleLinePrefix(v, s, headingPrefix(2)) },
    { id: "h3", label: L.heading3, icon: <Heading3 className="w-3.5 h-3.5" />, keywords: "h3 heading عنوان", inSlash: true, run: (v, s) => toggleLinePrefix(v, s, headingPrefix(3)) },

    { id: "bullet", label: L.bulletList, icon: <List className="w-3.5 h-3.5" />, shortcut: "Ctrl+Shift+8", keywords: "list قائمة نقطية", inSlash: true, run: (v, s) => toggleLinePrefix(v, s, BULLET_PREFIX) },
    { id: "number", label: L.numberList, icon: <ListOrdered className="w-3.5 h-3.5" />, shortcut: "Ctrl+Shift+7", keywords: "ordered مرقمة", inSlash: true, run: (v, s) => toggleLinePrefix(v, s, NUMBER_PREFIX) },
    { id: "task", label: L.taskList, icon: <ListTodo className="w-3.5 h-3.5" />, keywords: "todo task مهام", inSlash: true, run: (v, s) => toggleLinePrefix(v, s, TASK_PREFIX) },
    { id: "quote", label: L.quote, icon: <Quote className="w-3.5 h-3.5" />, shortcut: "Ctrl+Shift+9", keywords: "quote اقتباس", inSlash: true, run: (v, s) => toggleLinePrefix(v, s, QUOTE_PREFIX) },

    { id: "fence", label: L.codeBlock, icon: <SquareCode className="w-3.5 h-3.5" />, shortcut: "Ctrl+Shift+C", keywords: "code block كتلة كود", inSlash: true, run: (v, s) => insertBlock(v, s, "```\n$0\n```") },
    { id: "table", label: L.table, icon: <Table className="w-3.5 h-3.5" />, keywords: "table جدول", inSlash: true, run: (v, s) => insertBlock(v, s, TABLE_SNIPPET) },
    { id: "divider", label: L.divider, icon: <Minus className="w-3.5 h-3.5" />, keywords: "divider hr فاصل", inSlash: true, run: (v, s) => insertBlock(v, s, "---") },
    { id: "image", label: L.image, icon: <ImageIcon className="w-3.5 h-3.5" />, keywords: "image صورة", inSlash: true, run: (v, s) => insertImage(v, s) },
  ];
}

/** `![alt](…)` with the caret parked on the URL, which is the part nobody knows. */
function insertImage(value: string, sel: Selection): EditResult {
  const alt = value.slice(sel.start, sel.end);
  const body = `![${alt}](${MARKDOWN_LABELS.linkPlaceholder})`;
  const caret = sel.start + alt.length + 4;
  return {
    value: value.slice(0, sel.start) + body + value.slice(sel.end),
    start: caret,
    end: caret + MARKDOWN_LABELS.linkPlaceholder.length,
  };
}

/** Toolbar groups, so related buttons sit together with a hairline between. */
const TOOLBAR_GROUPS = [
  ["bold", "italic", "strike", "code"],
  ["h1", "h2", "h3"],
  ["bullet", "number", "task", "quote"],
  ["link", "image", "fence", "table", "divider"],
];

export type MarkdownEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  /** Rows of text before the box starts scrolling. */
  minHeight?: number;
  maxHeight?: number;
  autoFocus?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
  ariaLabel?: string;
  /** Prefix for root-relative images in the preview. */
  baseUrl?: string;
};

export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  minHeight = 180,
  maxHeight = 520,
  autoFocus = false,
  disabled = false,
  invalid = false,
  id,
  ariaLabel,
  baseUrl,
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<MarkdownEditorMode>("write");
  const [direction, setDirection] = useState<EditorDirection>("auto");
  const [focused, setFocused] = useState(false);
  const [cheatsheet, setCheatsheet] = useState(false);
  const [slash, setSlash] = useState<{ query: string; start: number } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashBox, setSlashBox] = useState<{ top: number; left: number; width: number } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const slashListRef = useRef<HTMLDivElement>(null);
  const pendingSelection = useRef<Selection | null>(null);

  const menuId = useId();
  const hintId = useId();

  const commands = useMemo(() => buildCommands(), []);
  const byId = useMemo(() => new Map(commands.map((c) => [c.id, c])), [commands]);

  const tokens = useMemo(() => highlightMarkdown(value), [value]);
  const stats = useMemo(() => markdownStats(value), [value]);

  // The preview re-parses the whole document; letting React serve a slightly
  // stale one keeps typing at full speed on long descriptions.
  const previewSource = useDeferredValue(value);

  // ── Selection handoff ───────────────────────────────────────────────────
  // Commands are pure, so they hand back where the caret belongs. The textarea
  // only gets that value after React has re-rendered with the new text.
  useLayoutEffect(() => {
    const next = pendingSelection.current;
    if (!next) return;
    pendingSelection.current = null;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(next.start, next.end);
  });

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, minHeight), maxHeight)}px`;
    if (mirrorRef.current) mirrorRef.current.scrollTop = el.scrollTop;
  }, [value, minHeight, maxHeight, mode]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = inputRef.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);

  // Direction is not remembered between descriptions, for the same reason the
  // comment composer stopped remembering it: a stored choice commits the next
  // writer to a direction nobody picked for the text they are about to write.
  //
  // The composer's Ctrl+Shift gesture is deliberately absent here — it fires on
  // Shift going down while Ctrl is held, which is the first half of every
  // Ctrl+Shift list shortcut a document editor needs.

  // ── Commands ────────────────────────────────────────────────────────────
  const apply = useCallback(
    (result: EditResult) => {
      pendingSelection.current = { start: result.start, end: result.end };
      onChange(result.value);
    },
    [onChange],
  );

  const selectionNow = useCallback((): Selection => {
    const el = inputRef.current;
    return {
      start: el?.selectionStart ?? value.length,
      end: el?.selectionEnd ?? value.length,
    };
  }, [value.length]);

  const runCommand = useCallback(
    (command: Command) => {
      if (disabled) return;
      apply(command.run(value, selectionNow()));
    },
    [apply, disabled, selectionNow, value],
  );

  // ── Slash menu ──────────────────────────────────────────────────────────
  const slashOptions = useMemo(() => {
    if (!slash) return [];
    const needle = slash.query.toLowerCase();
    return commands
      .filter((c) => c.inSlash)
      .filter(
        (c) =>
          !needle ||
          c.label.toLowerCase().includes(needle) ||
          (c.keywords ?? "").toLowerCase().includes(needle),
      );
  }, [commands, slash]);

  const placeSlashMenu = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const above = rect.top;
    const below = window.innerHeight - rect.bottom;
    const height = Math.min(SLASH_MENU_HEIGHT, Math.max(above, below) - 12);
    setSlashBox({
      top: above > below ? Math.max(8, rect.top - height - 8) : rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  useEffect(() => {
    if (!slash) {
      setSlashBox(null);
      return;
    }
    placeSlashMenu();
    window.addEventListener("scroll", placeSlashMenu, true);
    window.addEventListener("resize", placeSlashMenu);
    return () => {
      window.removeEventListener("scroll", placeSlashMenu, true);
      window.removeEventListener("resize", placeSlashMenu);
    };
  }, [slash, placeSlashMenu]);

  useEffect(() => setSlashIndex(0), [slash?.query]);

  // The menu scrolls once every block command is listed, so arrowing past the
  // fold has to bring the row along — inside the list only, never the page.
  useLayoutEffect(() => {
    const list = slashListRef.current;
    if (!list || !slash) return;
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    if (!active) return;
    const listBox = list.getBoundingClientRect();
    const rowBox = active.getBoundingClientRect();
    if (rowBox.bottom > listBox.bottom) list.scrollTop += rowBox.bottom - listBox.bottom;
    else if (rowBox.top < listBox.top) list.scrollTop -= listBox.top - rowBox.top;
  }, [slash, slashIndex]);

  const syncSlash = useCallback((next: string, caret: number) => {
    setSlash(findSlashQuery(next, caret));
  }, []);

  /** Runs a slash pick against the source with the `/query` already deleted. */
  const pickSlash = useCallback(
    (command: Command) => {
      if (!slash) return;
      const caret = inputRef.current?.selectionStart ?? value.length;
      const cleaned = value.slice(0, slash.start) + value.slice(caret);
      setSlash(null);
      apply(command.run(cleaned, { start: slash.start, end: slash.start }));
    },
    [apply, slash, value],
  );

  // ── Keyboard ────────────────────────────────────────────────────────────
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slash && slashOptions.length) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashIndex((i) => (i + 1) % slashOptions.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashIndex((i) => (i - 1 + slashOptions.length) % slashOptions.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          pickSlash(slashOptions[slashIndex]);
          return;
        }
      }

      if (e.key === "Escape") {
        if (slash) {
          e.preventDefault();
          setSlash(null);
        } else if (cheatsheet) {
          e.preventDefault();
          setCheatsheet(false);
        }
        return;
      }

      const mod = e.ctrlKey || e.metaKey;

      // Most of this company types on an Arabic layout, where `e.key` for the
      // B key is `ب`. `e.code` names the physical key instead, so Ctrl+B keeps
      // working without asking anyone to switch layouts first.
      const physical =
        /^Key([A-Z])$/.exec(e.code)?.[1].toLowerCase() ?? /^Digit(\d)$/.exec(e.code)?.[1] ?? "";
      const typed = e.key.toLowerCase();

      if (mod && !e.altKey) {
        const shortcuts: Record<string, string> = e.shiftKey
          ? { x: "strike", c: "fence", "7": "number", "8": "bullet", "9": "quote" }
          : { b: "bold", i: "italic", e: "code", k: "link" };
        const command = byId.get(shortcuts[typed] ?? shortcuts[physical] ?? "");
        if (command) {
          e.preventDefault();
          runCommand(command);
          return;
        }
        if (e.shiftKey && (typed === "p" || physical === "p")) {
          e.preventDefault();
          setMode((m) => (m === "write" ? "preview" : "write"));
          return;
        }
      }

      if (mod && e.altKey && ["1", "2", "3"].includes(physical || typed)) {
        e.preventDefault();
        runCommand(byId.get(`h${physical || typed}`)!);
        return;
      }

      const el = e.currentTarget;
      const sel = { start: el.selectionStart, end: el.selectionEnd };

      if (e.key === "Tab") {
        // Tab only indents where indenting is the obvious intent. Everywhere
        // else it has to keep moving focus, or the field becomes a keyboard trap.
        const lineFrom = value.lastIndexOf("\n", Math.max(0, sel.start - 1)) + 1;
        const inList = /^\s*([-*+]|\d{1,9}[.)])[ \t]/.test(value.slice(lineFrom));
        const multiline = value.slice(sel.start, sel.end).includes("\n");
        if (!inList && !multiline) return;
        e.preventDefault();
        apply(indentLines(value, sel, e.shiftKey));
        return;
      }

      if (e.key === "Enter" && !e.shiftKey && !mod) {
        const continued = continueBlock(value, sel.start);
        if (continued && sel.start === sel.end) {
          e.preventDefault();
          apply(continued);
        }
      }
    },
    [apply, byId, cheatsheet, pickSlash, runCommand, slash, slashIndex, slashOptions, value],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;
      const el = e.currentTarget;
      const linked = linkPastedUrl(value, { start: el.selectionStart, end: el.selectionEnd }, text);
      if (!linked) return;
      e.preventDefault();
      apply(linked);
    },
    [apply, value],
  );

  const toolbarDisabled = disabled || mode === "preview";

  return (
    <div className="brm-mdedit" data-focused={focused} data-invalid={invalid} data-mode={mode}>
      <div className="brm-mdedit-toolbar" role="toolbar" aria-label={MARKDOWN_LABELS.toolbar}>
        <div className="brm-mdedit-tools">
          {TOOLBAR_GROUPS.map((group, index) => (
            <div className="brm-mdedit-group" key={group[0]} data-first={index === 0}>
              {group.map((commandId) => {
                const command = byId.get(commandId)!;
                return (
                  <button
                    key={command.id}
                    type="button"
                    className="brm-mdedit-btn"
                    disabled={toolbarDisabled}
                    title={command.shortcut ? `${command.label} · ${command.shortcut}` : command.label}
                    aria-label={command.label}
                    // Keep the caret where it is — a toolbar press must not steal focus.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => runCommand(command)}
                  >
                    {command.icon}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="brm-mdedit-right">
          <button
            type="button"
            className="brm-mdedit-btn"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              setDirection(
                DIRECTION_CYCLE[(DIRECTION_CYCLE.indexOf(direction) + 1) % DIRECTION_CYCLE.length],
              )
            }
            title={`${MARKDOWN_LABELS.direction} — ${EDITOR_DIRECTION_LABELS[direction]}`}
            aria-label={`${MARKDOWN_LABELS.direction} — ${EDITOR_DIRECTION_LABELS[direction]}`}
          >
            <Languages className="w-3.5 h-3.5" />
            <span className="font-brm text-[0.6rem]">
              {direction === "auto" ? "AUTO" : direction.toUpperCase()}
            </span>
          </button>

          <button
            type="button"
            className="brm-mdedit-btn"
            data-on={cheatsheet}
            aria-expanded={cheatsheet}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setCheatsheet((open) => !open)}
            title={MARKDOWN_LABELS.help}
            aria-label={MARKDOWN_LABELS.help}
          >
            <CircleQuestionMark className="w-3.5 h-3.5" />
          </button>

          <div className="brm-seg brm-mdedit-seg">
            <button
              type="button"
              data-on={mode === "write"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMode("write")}
            >
              <Pencil className="w-3 h-3" />
              {MARKDOWN_LABELS.write}
            </button>
            <button
              type="button"
              data-on={mode === "preview"}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setMode("preview")}
            >
              <Eye className="w-3 h-3" />
              {MARKDOWN_LABELS.preview}
            </button>
          </div>
        </div>
      </div>

      {cheatsheet && (
        <div className="brm-mdedit-cheats">
          {MARKDOWN_CHEATSHEET.map((row) => (
            <span key={row.syntax} className="brm-mdedit-cheat">
              <code dir="ltr">{row.syntax}</code>
              <span>{row.label}</span>
            </span>
          ))}
        </div>
      )}

      {mode === "write" ? (
        <div className="brm-editor brm-mdedit-body">
          {/* Colour layer. Plain spans on purpose — a `<bdi>` here would isolate
              each run and reorder mixed text differently from the textarea. */}
          <div
            ref={mirrorRef}
            className="brm-editor-layer brm-editor-mirror brm-mdedit-mirror"
            dir={direction}
            aria-hidden="true"
          >
            {tokens.map((token, i) =>
              token.kind === "text" ? (
                <span key={i}>{token.value}</span>
              ) : (
                <span key={i} className={`brm-md-tok brm-md-tok-${token.kind}`}>
                  {token.value}
                </span>
              ),
            )}
            {value === "" || value.endsWith("\n") ? " " : null}
          </div>

          <textarea
            ref={inputRef}
            id={id}
            className="brm-editor-layer brm-editor-input brm-mdedit-input"
            dir={direction}
            value={value}
            placeholder={placeholder}
            disabled={disabled}
            spellCheck
            aria-label={ariaLabel}
            aria-describedby={hintId}
            aria-autocomplete="list"
            aria-controls={slash ? menuId : undefined}
            aria-expanded={!!slash}
            style={{ minHeight, maxHeight }}
            onChange={(e) => {
              onChange(e.target.value);
              syncSlash(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onSelect={(e) => {
              const el = e.currentTarget;
              syncSlash(el.value, el.selectionStart ?? el.value.length);
            }}
            onScroll={(e) => {
              if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
            }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              onBlur?.();
              // Let a click on a menu row land before the menu disappears.
              window.setTimeout(() => setSlash(null), 150);
            }}
          />
        </div>
      ) : (
        <div className="brm-mdedit-preview" style={{ minHeight }}>
          <Markdown
            content={previewSource}
            baseUrl={baseUrl}
            empty={
              <p className="text-sm" style={{ color: "var(--muted-foreground)" }}>
                {MARKDOWN_LABELS.previewEmpty}
              </p>
            }
          />
        </div>
      )}

      <div className="brm-mdedit-foot">
        <span id={hintId} className="brm-mdedit-hint">
          <span className="font-brm">Markdown</span>
          <span aria-hidden="true">·</span>
          <span>{MARKDOWN_LABELS.slashHint}</span>
        </span>
        <span className="brm-mdedit-count font-brm" dir="ltr">
          {stats.words} {MARKDOWN_LABELS.words} · {stats.chars} {MARKDOWN_LABELS.chars}
        </span>
      </div>

      {/* Portalled so no `overflow: hidden` card can clip it. */}
      {slash && slashBox && typeof document !== "undefined" &&
        createPortal(
          <div
            id={menuId}
            className="brm-mention-menu brm-fade-up"
            role="listbox"
            aria-label={MARKDOWN_LABELS.slashHint}
            style={{
              position: "fixed",
              top: slashBox.top,
              left: slashBox.left,
              width: slashBox.width,
              zIndex: 9999,
            }}
          >
            <div ref={slashListRef} style={{ maxHeight: SLASH_MENU_HEIGHT - 30, overflowY: "auto", padding: 4 }}>
              {slashOptions.length === 0 && (
                <p className="px-3 py-2.5 text-xs" style={{ color: "var(--muted-foreground)" }}>
                  {MARKDOWN_LABELS.slashEmpty}
                </p>
              )}
              {slashOptions.map((command, i) => (
                <button
                  key={command.id}
                  type="button"
                  role="option"
                  aria-selected={i === slashIndex}
                  data-active={i === slashIndex}
                  className="brm-mention-option rounded-lg"
                  style={{ color: "var(--foreground)" }}
                  onMouseEnter={() => setSlashIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickSlash(command);
                  }}
                >
                  <span className="brm-mdedit-slash-icon">{command.icon}</span>
                  <span className="flex-1 text-sm font-medium text-start">{command.label}</span>
                  {command.shortcut && (
                    <kbd className="brm-kbd shrink-0">{command.shortcut}</kbd>
                  )}
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
