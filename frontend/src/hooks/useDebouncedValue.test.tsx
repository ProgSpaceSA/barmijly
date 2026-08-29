import { act, renderHook } from "@testing-library/react";
import type { ChangeEvent } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SEARCH_DEBOUNCE_MS,
  useDebouncedSearch,
  useDebouncedValue,
} from "./useDebouncedValue";

afterEach(() => {
  vi.useRealTimers();
});

describe("useDebouncedValue", () => {
  it("holds the previous value until the pause elapses", () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(
      ({ value }) => useDebouncedValue(value, SEARCH_DEBOUNCE_MS),
      { initialProps: { value: "" } },
    );

    rerender({ value: "abc" });
    expect(result.current).toBe("");

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1);
    });
    expect(result.current).toBe("");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe("abc");
  });
});

describe("useDebouncedSearch", () => {
  it("does not notify on mount with an empty query", () => {
    const onSearch = vi.fn();
    renderHook(() => useDebouncedSearch(onSearch));
    expect(onSearch).not.toHaveBeenCalled();
  });

  it("sends the trimmed query once after the pause", () => {
    vi.useFakeTimers();
    const onSearch = vi.fn();
    const { result } = renderHook(() => useDebouncedSearch(onSearch));

    act(() => {
      result.current.onSearchChange({
        target: { value: "  الربع  " },
      } as ChangeEvent<HTMLInputElement>);
    });
    expect(onSearch).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });
    expect(onSearch).toHaveBeenCalledTimes(1);
    expect(onSearch).toHaveBeenCalledWith("الربع");
  });
});
