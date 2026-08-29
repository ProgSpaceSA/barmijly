"use client";
import { useEffect, useRef, useState, type ChangeEvent } from "react";

/** Pause before a typed query hits the API. Command palette uses 200ms; lists wait a beat longer. */
export const SEARCH_DEBOUNCE_MS = 300;

export function useDebouncedValue<T>(value: T, delayMs = SEARCH_DEBOUNCE_MS): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}

/**
 * List-page search box: the field updates on every key, the filter after the pause.
 * Does not fire on mount with an empty query (that would refetch the unfiltered list).
 */
export function useDebouncedSearch(
  onSearch: (value: string) => void,
  delayMs = SEARCH_DEBOUNCE_MS,
) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, delayMs);
  const onSearchRef = useRef(onSearch);
  const lastSent = useRef("");

  useEffect(() => {
    onSearchRef.current = onSearch;
  });

  useEffect(() => {
    const next = debounced.trim();
    if (lastSent.current === next) return;
    lastSent.current = next;
    onSearchRef.current(next);
  }, [debounced]);

  return {
    search,
    onSearchChange: (e: ChangeEvent<HTMLInputElement>) => setSearch(e.target.value),
  };
}
