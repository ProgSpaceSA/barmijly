"use client";

export type BrmOption = { value: string; label: string };

/**
 * Single-choice list inside a bordered panel — indigo highlight on selection.
 *
 * Use instead of native `<select>` when every option should stay visible
 * (relation kind, short enums). For long lists, use `ThemeSelect`.
 */
export function BrmOptionList({
  value,
  onChange,
  items,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  items: BrmOption[];
  "aria-label"?: string;
}) {
  return (
    <ul className="brm-option-list" role="listbox" aria-label={ariaLabel}>
      {items.map((item) => {
        const selected = value === item.value;
        return (
          <li key={item.value}>
            <button
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => onChange(item.value)}
              className="brm-option-list__item"
              data-selected={selected || undefined}
            >
              {item.label}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
