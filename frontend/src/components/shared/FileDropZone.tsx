"use client";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { COMMENT_LABELS } from "@/lib/constants";

type FileDropZoneProps = {
  onFiles: (files: File[]) => void;
  accept?: string;
  disabled?: boolean;
  /** When true (default), clicking the zone opens the file picker. */
  clickToPick?: boolean;
  children: ReactNode;
  className?: string;
};

function matchesAccept(file: File, accept: string) {
  return accept.split(",").some((part) => {
    const rule = part.trim();
    if (!rule) return false;
    if (rule.startsWith(".")) return file.name.toLowerCase().endsWith(rule.toLowerCase());
    if (rule.endsWith("/*")) return file.type.startsWith(rule.slice(0, -1));
    return file.type === rule;
  });
}

/** Wraps a file picker area with drag-and-drop support; click opens the picker. */
export function FileDropZone({
  onFiles,
  accept,
  disabled = false,
  clickToPick = true,
  children,
  className = "",
}: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(
    (files: File[]) => {
      const next = accept ? files.filter((file) => matchesAccept(file, accept)) : files;
      if (next.length) onFiles(next);
    },
    [accept, onFiles],
  );

  const endDrag = () => {
    dragDepth.current = 0;
    setDragging(false);
  };

  const openPicker = () => {
    if (disabled || !clickToPick) return;
    inputRef.current?.click();
  };

  return (
    <div
      className={`relative ${className}`.trim()}
      onDragEnter={(e) => {
        if (disabled) return;
        e.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(e) => {
        if (disabled) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => {
        if (disabled) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        endDrag();
        addFiles(Array.from(e.dataTransfer.files));
      }}
      data-dragging={dragging || undefined}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        disabled={disabled}
        aria-hidden
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <div
        role="presentation"
        onClick={clickToPick ? openPicker : undefined}
        onKeyDown={
          clickToPick
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openPicker();
                }
              }
            : undefined
        }
        style={dragging ? { visibility: "hidden" } : undefined}
        aria-hidden={dragging || undefined}
      >
        {children}
      </div>
      {dragging && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 rounded-xl px-4 text-center pointer-events-none"
          style={{
            background: "color-mix(in srgb, var(--card) 94%, #4F46E5 6%)",
            border: "2px dashed #4F46E5",
          }}
        >
          <span className="text-sm font-semibold" style={{ color: "#4F46E5" }}>
            {COMMENT_LABELS.dropHere}
          </span>
        </div>
      )}
    </div>
  );
}
