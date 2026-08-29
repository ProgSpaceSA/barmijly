import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { qk } from "@/lib/query-keys";
import { useComments } from "./useComments";

const mockPost = vi.fn();

vi.mock("@/lib/api", () => ({
  default: {
    post: (...args: unknown[]) => mockPost(...args),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("useComments", () => {
  it("actively refetches a requirement after a comment write", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const refetch = vi.spyOn(client, "refetchQueries");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useComments({ kind: "requirement", id: "requirement-1" }),
      { wrapper },
    );

    await act(async () => {
      await result.current.refresh();
    });

    expect(refetch).toHaveBeenCalledWith({
      queryKey: qk.requirements.detail("requirement-1"),
      type: "all",
    });
  });

  it("adds the saved comment to the visible thread before the refetch", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const key = qk.requirements.detail("requirement-1");
    client.setQueryData(key, { id: "requirement-1", comments: [] });
    mockPost.mockResolvedValue({
      data: { id: "comment-1", content: "@Developer follow up" },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(
      () => useComments({ kind: "requirement", id: "requirement-1" }),
      { wrapper },
    );

    await act(async () => {
      await result.current.add.mutateAsync({
        content: "@Developer follow up",
        mentions: ["developer-1"],
      });
    });

    expect(client.getQueryData<{ comments: Array<{ id: string }> }>(key)?.comments).toEqual([
      expect.objectContaining({ id: "comment-1" }),
    ]);
  });
});
