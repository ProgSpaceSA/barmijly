import { describe, it, expect } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";
import { CanceledError } from "axios";
import { waitFor } from "@testing-library/react";
import api from "./api";
import { createQueryClient, resetQueryCache } from "./query-client";

describe("api session epoch", () => {
  it("rejects a response that started before logout", async () => {
    createQueryClient();
    let finish!: () => void;

    const adapter: AxiosAdapter = (config: InternalAxiosRequestConfig) =>
      new Promise((resolve) => {
        finish = () =>
          resolve({
            data: [{ id: "old-user-ticket" }],
            status: 200,
            statusText: "OK",
            headers: {},
            config,
          });
      });

    const pending = api.get("/tickets", { adapter });
    await waitFor(() => expect(finish).toBeTypeOf("function"));

    resetQueryCache();
    finish();
    await expect(pending).rejects.toBeInstanceOf(CanceledError);
  });
});
