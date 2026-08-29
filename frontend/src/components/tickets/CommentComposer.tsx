"use client";
import {
  useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { AtSign, FileText, Languages, Paperclip, Send, X } from "lucide-react";
import { MentionText } from "@/components/shared/MentionText";
import {
  applyMention, encodeWritingDir, findMentionQuery, matchesMentionQuery,
  mentionHandleTable, mentionName, mentionedIdsIn, sanitizeCommentText, type MentionUser,
} from "@/lib/mentions";
import {
  COMMENT_LABELS, EDITOR_DIRECTION_LABELS, ROLE_COLORS, ROLE_LABELS,
} from "@/lib/constants";
import { avatarTint, formatBytes } from "@/lib/utils";

export type EditorDirection = "auto" | "rtl" | "ltr";

export type CommentSubmit = {
  content: string;
  mentions: string[];
  files: File[];
  /** Narrates a multi-step send ("uploading 2/3") without leaving the composer. */
  setStatus: (status: string | null) => void;
  /** Drives the bar on one pending attachment tile, 0–100. */
  setFileProgress: (index: number, percent: number) => void;
};

const DIRECTION_CYCLE: EditorDirection[] = ["auto", "rtl", "ltr"];
const MENU_LIMIT = 8;
const MENU_HEIGHT = 260;
const MAX_EDITOR_HEIGHT = 320;

/** Scroll `child` inside `parent` only — `scrollIntoView` would also move the page. */
export function scrollChildIntoView(parent: HTMLElement, child: HTMLElement) {
  const parentRect = parent.getBoundingClientRect();
  const childRect = child.getBoundingClientRect();
  if (childRect.bottom > parentRect.bottom) {
    parent.scrollTop += childRect.bottom - parentRect.bottom;
  } else if (childRect.top < parentRect.top) {
    parent.scrollTop -= parentRect.top - childRect.top;
  }
}

/** Object URLs for image previews, revoked as soon as a file leaves the tray. */
function usePreviewUrls(files: File[]) {
  const [urls, setUrls] = useState<Map<File, string>>(new Map());

  useEffect(() => {
    setUrls((previous) => {
      const next = new Map<File, string>();
      for (const file of files) {
        if (!file.type.startsWith("image/")) continue;
        next.set(file, previous.get(file) ?? URL.createObjectURL(file));
      }
      for (const [file, url] of previous) {
        if (!next.has(file)) URL.revokeObjectURL(url);
      }
      return next;
    });
  }, [files]);

  useEffect(
    () => () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
    [urls],
  );

  return urls;
}

export function CommentComposer({
  users,
  currentUserId,
  currentUserName,
  initialContent = "",
  placeholder = COMMENT_LABELS.placeholder,
  submitLabel = COMMENT_LABELS.send,
  onSubmit,
  onCancel,
  allowAttachments = true,
  autoFocus = false,
  resetOnSubmit = true,
  toolbarStart,
  compact = false,
  initialDirection,
}: {
  users: MentionUser[];
  currentUserId?: string;
  currentUserName?: string;
  initialContent?: string;
  placeholder?: string;
  submitLabel?: string;
  onSubmit: (payload: CommentSubmit) => Promise<void>;
  onCancel?: () => void;
  allowAttachments?: boolean;
  autoFocus?: boolean;
  resetOnSubmit?: boolean;
  toolbarStart?: ReactNode;
  compact?: boolean;
  /** When editing, the message's own direction — not the last new-comment choice. */
  initialDirection?: EditorDirection;
}) {
  const [content, setContent] = useState(() => sanitizeCommentText(initialContent));
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [focused, setFocused] = useState(false);

  const [direction, setDirection] = useState<EditorDirection>(initialDirection ?? "auto");
  const [directionFlash, setDirectionFlash] = useState(false);
  const lastShiftSide = useRef<EditorDirection | null>(null);

  const [menu, setMenu] = useState<{ query: string; start: number } | null>(null);
  const [menuIndex, setMenuIndex] = useState(0);
  const [menuBox, setMenuBox] = useState<{ top: number; left: number; width: number } | null>(null);

  const menuId = useId();
  /** Blur closes the picker on a delay; anything that reopens it must cancel that. */
  const blurTimer = useRef<number | null>(null);
  const cancelMenuClose = useCallback(() => {
    if (blurTimer.current !== null) {
      window.clearTimeout(blurTimer.current);
      blurTimer.current = null;
    }
  }, []);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const menuListRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const previews = usePreviewUrls(files);

  const candidates = useMemo(
    () => users.filter((u) => u.id !== currentUserId),
    [users, currentUserId],
  );
  const mentionTable = useMemo(() => mentionHandleTable(candidates), [candidates]);

  const options = useMemo(() => {
    if (!menu) return [];
    return candidates.filter((u) => matchesMentionQuery(u, menu.query)).slice(0, MENU_LIMIT);
  }, [candidates, menu]);

  // ── Writing direction ───────────────────────────────────────────────────
  // Ctrl + Left Shift is left-to-right, Ctrl + Right Shift is right-to-left —
  // the pairing Windows and Office already train into people, so the muscle
  // memory carries over.
  //
  // A blank box always starts on `auto`, where the first letter typed decides.
  // A choice carried over from an earlier session would leave an empty field
  // committed to a direction nobody picked for the comment about to be written;
  // the pick therefore lives as long as the composer does and no longer.
  useEffect(() => {
    if (initialDirection) setDirection(initialDirection);
  }, [initialDirection]);

  const changeDirection = useCallback((next: EditorDirection, flash = true) => {
    setDirection(next);
    if (flash) {
      setDirectionFlash(true);
      window.setTimeout(() => setDirectionFlash(false), 900);
    }
  }, []);

  const handleDirectionKeys = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.repeat) return false;
      if (e.key === "Shift") {
        const side: EditorDirection = e.location === 2 ? "rtl" : "ltr";
        lastShiftSide.current = side;
        if (e.ctrlKey || e.metaKey) {
          changeDirection(side);
          return true;
        }
        return false;
      }
      if ((e.key === "Control" || e.key === "Meta") && e.shiftKey) {
        changeDirection(lastShiftSide.current ?? (direction === "rtl" ? "ltr" : "rtl"));
        return true;
      }
      return false;
    },
    [changeDirection, direction],
  );

  // ── Layout: the mirror has to track the textarea exactly ────────────────
  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_EDITOR_HEIGHT)}px`;
    if (mirrorRef.current) mirrorRef.current.scrollTop = el.scrollTop;
  }, [content]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = inputRef.current;
    el?.focus();
    // Land the caret at the end — this box usually opens on existing text.
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);

  const placeMenu = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const above = rect.top;
    const below = window.innerHeight - rect.bottom;
    const height = Math.min(MENU_HEIGHT, Math.max(above, below) - 12);
    setMenuBox({
      top: above > below ? Math.max(8, rect.top - height - 8) : rect.bottom + 8,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  const menuOpen = menu !== null;

  useEffect(() => {
    if (!menuOpen) {
      setMenuBox(null);
      return;
    }

    const editor = inputRef.current?.closest<HTMLElement>(".brm-composer");
    const needsRoomAbove = (inputRef.current?.getBoundingClientRect().top ?? 0) < MENU_HEIGHT + 16;
    if (needsRoomAbove) editor?.scrollIntoView?.({ block: "end", behavior: "auto" });

    const frame = requestAnimationFrame(placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    window.addEventListener("resize", placeMenu);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", placeMenu, true);
      window.removeEventListener("resize", placeMenu);
    };
  }, [menuOpen, placeMenu]);

  useEffect(() => {
    setMenuIndex(0);
  }, [menu?.query]);

  useEffect(() => cancelMenuClose, [cancelMenuClose]);

  useLayoutEffect(() => {
    const clean = sanitizeCommentText(content);
    if (clean === content) return;
    const el = inputRef.current;
    const caret = el?.selectionStart ?? content.length;
    const caretAfter = sanitizeCommentText(content.slice(0, caret)).length;
    setContent(clean);
    requestAnimationFrame(() => el?.setSelectionRange(caretAfter, caretAfter));
  }, [content]);

  useLayoutEffect(() => {
    const list = menuListRef.current;
    if (!list || !menu) return;
    const active = list.querySelector<HTMLElement>('[data-active="true"]');
    if (active) scrollChildIntoView(list, active);
  }, [menu, menuIndex]);

  // ── Mentions ────────────────────────────────────────────────────────────
  const syncMenu = useCallback((value: string, caret: number) => {
    setMenu(findMentionQuery(value, caret, candidates, mentionTable));
  }, [candidates, mentionTable]);

  const pickMention = useCallback(
    (user: MentionUser) => {
      const el = inputRef.current;
      if (!el || !menu) return;
      const to = el.selectionStart ?? content.length;
      const next = applyMention(content, menu.start, to, user);
      setContent(next.content);
      setMenu(null);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
      });
    },
    [content, menu],
  );

  /** The `@` button: types the character for people who never learned the trick. */
  const openMentionPicker = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    cancelMenuClose();
    const caret = el.selectionStart ?? content.length;
    const needsSpace = caret > 0 && !/\s/.test(content[caret - 1] ?? "");
    const insert = `${needsSpace ? " " : ""}@`;
    const next = content.slice(0, caret) + insert + content.slice(caret);
    setContent(next);
    requestAnimationFrame(() => {
      el.focus();
      const at = caret + insert.length;
      el.setSelectionRange(at, at);
      syncMenu(next, at);
    });
  }, [cancelMenuClose, content, syncMenu]);

  // ── Attachments ─────────────────────────────────────────────────────────
  const addFiles = useCallback(
    (incoming: File[]) => {
      if (!allowAttachments || !incoming.length) return;
      setFiles((previous) => [...previous, ...incoming]);
    },
    [allowAttachments],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((previous) => previous.filter((_, i) => i !== index));
  }, []);

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pasted = Array.from(e.clipboardData.files);
      if (!pasted.length) return;
      e.preventDefault();
      addFiles(pasted);
    },
    [addFiles],
  );

  // ── Send ────────────────────────────────────────────────────────────────
  const canSend = (content.trim().length > 0 || files.length > 0) && !busy;

  const overallProgress = useMemo(() => {
    if (!busy || !files.length) return null;
    const total = files.reduce((sum, _, i) => sum + (progress[i] ?? 0), 0);
    return Math.round(total / files.length);
  }, [busy, files, progress]);

  const submit = useCallback(async () => {
    if (!canSend) return;
    setBusy(true);
    setProgress({});
    try {
      await onSubmit({
        content: encodeWritingDir(content.trim(), direction),
        mentions: mentionedIdsIn(content, candidates, mentionTable),
        files,
        setStatus: () => {},
        setFileProgress: (index, percent) =>
          setProgress((previous) => ({ ...previous, [index]: percent })),
      });
      if (resetOnSubmit) {
        setContent("");
        setFiles([]);
        setMenu(null);
      }
    } catch {
      // The caller owns the toast; holding on to the draft is this layer's job.
    } finally {
      setBusy(false);
      setProgress({});
    }
  }, [canSend, candidates, content, direction, files, mentionTable, onSubmit, resetOnSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (handleDirectionKeys(e)) return;

      // Ctrl/Cmd+Enter always sends — even while the mention picker is open.
      // Plain Enter (below) still picks the highlighted option.
      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void submit();
        return;
      }

      if (menu && options.length) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setMenuIndex((i) => (i + 1) % options.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setMenuIndex((i) => (i - 1 + options.length) % options.length);
          return;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          pickMention(options[menuIndex]);
          return;
        }
      }

      if (e.key === "Escape") {
        if (menu) {
          e.preventDefault();
          setMenu(null);
          return;
        }
        if (onCancel) {
          e.preventDefault();
          onCancel();
        }
      }
    },
    [handleDirectionKeys, menu, menuIndex, onCancel, options, pickMention, submit],
  );

  const initials = (currentUserName ?? "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  const tint = avatarTint(currentUserId);

  return (
    <div
      onDragOver={(e) => {
        if (!allowAttachments || busy) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        if (!allowAttachments || busy) return;
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      <div className="brm-composer" data-focused={focused} data-dragging={dragging}>
        <div className="flex">
          {!compact && currentUserName && (
            <div className="ps-3 pt-3 shrink-0">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                style={{ background: `color-mix(in srgb, ${tint} 20%, transparent)`, color: tint }}
                aria-hidden="true"
              >
                {initials}
              </div>
            </div>
          )}

          <div className={`brm-editor flex-1 min-w-0 ${compact ? "brm-editor-compact" : ""}`}>
            {/* Highlight layer — the textarea's own layout, repainted. It must
                not isolate and must not change any metric, or the colour slides
                off the characters the caret is sitting between. */}
            <div
              ref={mirrorRef}
              className="brm-editor-layer brm-editor-mirror"
              dir={direction}
              aria-hidden="true"
            >
              <MentionText
                content={content}
                users={candidates}
                currentUserId={currentUserId}
                isolate={false}
              />
              {content === "" || content.endsWith("\n") ? " " : null}
            </div>

            <textarea
              ref={inputRef}
              className="brm-editor-layer brm-editor-input"
              dir={direction}
              value={content}
              placeholder={placeholder}
              // `disabled` dumps the caret (and a click-outside could not land).
              // Read-only blocks typing while the send is in flight and keeps
              // focus so the next comment is ready — until a click outside.
              readOnly={busy}
              rows={compact ? 2 : 3}
              aria-label={placeholder}
              aria-autocomplete="list"
              aria-controls={menu ? menuId : undefined}
              aria-expanded={!!menu}
              aria-activedescendant={
                menu && options.length ? `${menuId}-${menuIndex}` : undefined
              }
              onChange={(e) => {
                setContent(e.target.value);
                syncMenu(e.target.value, e.target.selectionStart ?? e.target.value.length);
              }}
              onScroll={(e) => {
                if (mirrorRef.current) mirrorRef.current.scrollTop = e.currentTarget.scrollTop;
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                // Let a click on a menu row land before the menu goes away.
                cancelMenuClose();
                blurTimer.current = window.setTimeout(() => setMenu(null), 150);
              }}
            />
          </div>
        </div>

        {/* Pending attachments */}
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pb-2">
            {files.map((file, i) => {
              const preview = previews.get(file);
              const percent = progress[i];
              const uploading = busy && percent !== undefined && percent < 100;
              return (
                <div
                  key={`${file.name}-${file.size}-${i}`}
                  className={preview ? "brm-attach-tile w-20 h-16" : "brm-attach-tile"}
                >
                  {preview ? (
                    <img src={preview} alt={file.name} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-2 text-xs"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: "#4F46E5" }} />
                      <span className="truncate max-w-32" style={{ color: "var(--foreground)" }}>
                        {file.name}
                      </span>
                      <span className="font-brm opacity-60">{formatBytes(file.size)}</span>
                    </div>
                  )}

                  {uploading && <div className="brm-attach-veil" />}
                  {busy && percent !== undefined && (
                    <div className="brm-attach-progress">
                      <span style={{ width: `${percent}%` }} />
                    </div>
                  )}

                  {!busy && (
                    <button
                      type="button"
                      aria-label={`${COMMENT_LABELS.delete} ${file.name}`}
                      onClick={() => removeFile(i)}
                      className="brm-attach-remove"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {dragging && (
          <p className="text-xs px-3 pb-2" style={{ color: "#8B5CF6" }}>
            {COMMENT_LABELS.dropHere}
          </p>
        )}

        <div className="brm-composer-toolbar">
          <div className="flex items-center gap-1.5 flex-wrap min-w-0">
            {toolbarStart}

            {allowAttachments && (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(Array.from(e.target.files || []));
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => fileRef.current?.click()}
                  className="brm-tool-btn"
                  title={COMMENT_LABELS.attach}
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{COMMENT_LABELS.attach}</span>
                </button>
              </>
            )}

            <button
              type="button"
              disabled={busy}
              // Taking focus would fire the textarea's blur, and blur closes the
              // picker — the button would shut the menu it just opened.
              onMouseDown={(e) => e.preventDefault()}
              onClick={openMentionPicker}
              className="brm-tool-btn"
              title={COMMENT_LABELS.mention}
            >
              <AtSign className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{COMMENT_LABELS.mention}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                changeDirection(
                  DIRECTION_CYCLE[(DIRECTION_CYCLE.indexOf(direction) + 1) % DIRECTION_CYCLE.length],
                  false,
                )
              }
              className="brm-tool-btn"
              data-flash={directionFlash}
              title={COMMENT_LABELS.dirHint}
              aria-label={`${COMMENT_LABELS.dirHint} — ${EDITOR_DIRECTION_LABELS[direction]}`}
            >
              <Languages className="w-3.5 h-3.5" />
              <span className="font-brm">
                {direction === "auto" ? "AUTO" : direction.toUpperCase()}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 shrink-0 ms-auto">
            <span
              className="hidden md:flex items-center gap-1.5"
              style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}
            >
              <kbd className="brm-kbd">Ctrl</kbd>
              <span>+</span>
              <kbd className="brm-kbd">Enter</kbd>
            </span>

            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="brm-tool-btn"
                style={{ borderColor: "var(--border)" }}
              >
                {COMMENT_LABELS.cancel}
              </button>
            )}

            <button
              type="button"
              // Same as the mention button: taking focus would leave the
              // composer, and the writer is about to type the next comment.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => void submit()}
              disabled={!canSend}
              className="brm-send"
            >
              <Send className="w-3.5 h-3.5" />
              {submitLabel}
            </button>
          </div>
        </div>

        {overallProgress !== null && (
          <div className="brm-progress-track" role="progressbar" aria-valuenow={overallProgress}>
            <span style={{ width: `${overallProgress}%` }} />
          </div>
        )}
      </div>

      {/* Mention picker — portalled so no `overflow: hidden` card can clip it. */}
      {menu && menuBox && typeof document !== "undefined" &&
        createPortal(
          <div
            id={menuId}
            className="brm-mention-menu brm-fade-up"
            role="listbox"
            style={{
              position: "fixed",
              top: menuBox.top,
              left: menuBox.left,
              width: menuBox.width,
              zIndex: 9999,
            }}
          >
            <div
              ref={menuListRef}
              data-mention-list=""
              style={{ maxHeight: MENU_HEIGHT - 30, overflowY: "auto", padding: "4px" }}
            >
              {options.length === 0 && (
                <p
                  className="px-3 py-2.5 text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  {COMMENT_LABELS.noMentionMatch}
                </p>
              )}
              {options.map((user, i) => (
                <button
                  key={user.id}
                  id={`${menuId}-${i}`}
                  type="button"
                  role="option"
                  aria-selected={i === menuIndex}
                  data-active={i === menuIndex}
                  className="brm-mention-option rounded-lg"
                  style={{ color: "var(--foreground)" }}
                  onMouseEnter={() => setMenuIndex(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pickMention(user);
                  }}
                >
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                    style={{
                      background: `color-mix(in srgb, ${avatarTint(user.id)} 20%, transparent)`,
                      color: avatarTint(user.id),
                    }}
                  >
                    {user.firstName?.[0]}
                    {user.lastName?.[0]}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{mentionName(user)}</p>
                    <p
                      className="font-brm truncate"
                      style={{ fontSize: "0.65rem", color: "var(--muted-foreground)" }}
                    >
                      {user.email}
                    </p>
                  </div>
                  {user.role && (
                    <span
                      className="text-xs px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        color: ROLE_COLORS[user.role] ?? "var(--muted-foreground)",
                        background: `color-mix(in srgb, ${ROLE_COLORS[user.role] ?? "#64748B"} 14%, transparent)`,
                      }}
                    >
                      {ROLE_LABELS[user.role] ?? user.role}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="brm-mention-hint">
              <span>
                <kbd className="brm-kbd">↑</kbd> <kbd className="brm-kbd">↓</kbd>{" "}
                {COMMENT_LABELS.menuMove}
              </span>
              <span>
                <kbd className="brm-kbd">Enter</kbd> {COMMENT_LABELS.menuPick}
              </span>
              <span>
                <kbd className="brm-kbd">Esc</kbd> {COMMENT_LABELS.menuClose}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
