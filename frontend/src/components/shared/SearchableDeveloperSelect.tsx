"use client";

import { useMemo, useState } from "react";
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
}: {
  developers: Person[];
  value: string | null;
  onChange: (id: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");

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

  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v)}
      items={items}
      disabled={disabled}
    >
      <SelectTrigger className="flex-1 min-w-0">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <div
          className="sticky top-0 z-10 p-2"
          style={{ background: "var(--popover)", borderBottom: "1px solid var(--border)" }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="flex items-center gap-2 rounded-lg px-2 py-1.5"
            style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
          >
            <Search className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--muted-foreground)" }} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="بحث..."
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
  );
}
