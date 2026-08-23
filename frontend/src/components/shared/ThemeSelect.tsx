"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type ThemeSelectOption = { value: string; label: string };

/**
 * Branded combobox — dark popover, RTL labels, placeholder row.
 * Use this instead of native `<select>` everywhere in the app.
 */
export function ThemeSelect({
  value,
  onChange,
  onBlur,
  placeholder,
  items,
  disabled,
  "aria-label": ariaLabel,
  triggerClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder: string;
  items: ThemeSelectOption[];
  disabled?: boolean;
  "aria-label"?: string;
  triggerClassName?: string;
}) {
  return (
    <Select
      value={value || null}
      onValueChange={(v: string | null) => onChange(v ?? "")}
      onOpenChange={(open) => { if (!open) onBlur?.(); }}
      disabled={disabled}
      items={[{ value: null, label: placeholder }, ...items]}
    >
      <SelectTrigger disabled={disabled} aria-label={ariaLabel ?? placeholder} className={triggerClassName}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={null}>{placeholder}</SelectItem>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
