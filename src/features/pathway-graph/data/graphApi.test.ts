import { afterEach, describe, expect, it, vi } from "vitest";
import { loadGraphDataset } from "./graphApi";
import { mockGraph } from "./mockGraph";

describe("loadGraphDataset", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns API dataset when payload shape is valid", async () => {
    const apiDataset = JSON.parse(JSON.stringify(mockGraph));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify(apiDataset), { status: 200 })),
    );

    const result = await loadGraphDataset();

    expect(result.source).toBe("api");
    expect(result.warning).toBeNull();
    expect(result.graph.rootNodeId).toBe(apiDataset.rootNodeId);
    expect(result.graph.nodes.length).toBe(apiDataset.nodes.length);
  });

  it("falls back to mock graph when request fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network unavailable")));

    const result = await loadGraphDataset();

    expect(result.source).toBe("mock");
    expect(result.graph).toBe(mockGraph);
    expect(result.warning).toContain("fallback mock graph");
  });

  it("falls back to mock graph when payload shape is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ unexpected: true }), { status: 200 })),
    );

    const result = await loadGraphDataset();

    expect(result.source).toBe("mock");
    expect(result.graph).toBe(mockGraph);
  });
});

