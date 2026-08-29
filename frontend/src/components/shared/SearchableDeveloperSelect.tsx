"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { SELECT_PLACEHOLDERS } from "@/lib/constants";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Person = { id: string; firstName: string; lastName: string };

export function SearchableDeveloperSelect({
  developers,
  value,
  onChange,
  placeholder = SELECT_PLACEHOLDERS.developer,
  disabled,
  "aria-label": ariaLabel,
  triggerClassName,
}: {
  developers: Person[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  "aria-label"?: string;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return developers;
    return developers.filter((d) =>
      `${d.firstName} ${d.lastName}`.toLowerCase().includes(q),
    );
  }, [developers, query]);

  // Base UI resolves the trigger label from `items`. Without it the trigger
  // renders the raw value, which for a developer is a bare UUID.
  const items = useMemo(
    () => [
      { value: null, label: placeholder },
      ...developers.map((d) => ({
        value: d.id,
        label: `${d.firstName} ${d.lastName}`,
      })),
    ],
    [developers, placeholder],
  );

  const stopSelectKey = (e: React.KeyboardEvent) => {
    e.stopPropagation();
  };

  // Printable keys on the open list go to the search box — not the typeahead.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.length !== 1) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-slot='select-item']")) return;
      if (target === searchRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      searchRef.current?.focus();
      setQuery((current) => current + e.key);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open]);

  return (
    <div className="w-full min-w-0">
      <Select
        value={value}
        onValueChange={(v) => onChange(v)}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setQuery("");
            return;
          }
          requestAnimationFrame(() => searchRef.current?.focus());
        }}
        items={items}
        disabled={disabled}
      >
        <SelectTrigger
          className={
            triggerClassName
              ? `w-full max-w-full min-w-0 ${triggerClassName}`
              : "w-full max-w-full min-w-0"
          }
          aria-label={ariaLabel ?? placeholder}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="w-[var(--anchor-width)] max-w-[calc(100vw-1.5rem)]">
          <div
            className="sticky top-0 z-10 p-2"
            style={{ background: "var(--popover)", borderBottom: "1px solid var(--border)" }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              className="flex items-center gap-2 rounded-lg px-2 py-1.5"
              style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
            >
              <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--muted-foreground)" }} />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={stopSelectKey}
                onKeyUp={stopSelectKey}
                placeholder="بحث..."
                aria-label="بحث"
                className="w-full bg-transparent text-sm outline-none"
                style={{ color: "var(--foreground)" }}
              />
            </div>
          </div>
          <SelectItem value={null}>{placeholder}</SelectItem>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs" style={{ color: "var(--muted-foreground)" }}>
              لا توجد نتائج
            </div>
          ) : (
            filtered.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.firstName} {d.lastName}
              </SelectItem>
            ))
          )}
        </SelectContent>
      </Select>
    </div>
  );
}
