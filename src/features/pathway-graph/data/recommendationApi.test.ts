import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultFilters, defaultStudentProfile } from "./mockGraph";
import { loadPathRecommendations } from "./recommendationApi";

describe("loadPathRecommendations", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("parses a valid recommendation payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            pathSet: {
              primary: {
                id: "path-1",
                nodeIds: ["root", "club-acm", "company-jpmorgan"],
                edgeIds: ["e-root-acm", "e-acm-jp"],
                alumniWeight: 2,
                extraHops: 0,
                score: 82.4,
                confidence: 0.88,
                rationale: ["Confidence 88%", "Best signal: directly reaches the target company"],
              },
              secondary: [],
              all: [],
            },
            traversableNodeIds: ["root", "club-acm", "company-jpmorgan"],
            traversableEdgeIds: ["e-root-acm", "e-acm-jp"],
            companyOutlook: [
              {
                companyId: "company-jpmorgan",
                label: "JPMorgan",
                confidence: 0.88,
                hasRoute: true,
              },
            ],
            modelMeta: {
              mode: "rl",
              policyLoaded: true,
            },
          }),
          { status: 200 },
        ),
      ),
    );

    const result = await loadPathRecommendations({
      filters: defaultFilters,
      profile: defaultStudentProfile,
    });

    expect(result.pathSet.primary?.id).toBe("path-1");
    expect(result.traversableNodeIds.has("club-acm")).toBe(true);
    expect(result.companyOutlook[0]?.hasRoute).toBe(true);
    expect(result.modelMeta?.mode).toBe("rl");
  });

  it("throws when the payload shape is invalid", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ unexpected: true }), { status: 200 })),
    );

    await expect(
      loadPathRecommendations({
        filters: defaultFilters,
        profile: defaultStudentProfile,
      }),
    ).rejects.toThrow("invalid payload shape");
  });
});

