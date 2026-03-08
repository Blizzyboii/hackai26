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
                scoreBreakdown: {
                  overall: 0.824,
                  directEvidence: 0.9,
                  transferability: 0.24,
                  fit: 0.7,
                },
                explanations: {
                  summary: "This path is strongest because ACM has direct alumni proof to JPMorgan.",
                  directEvidence: "2 alumni went directly from ACM to JPMorgan.",
                  transferability: "ACM has adjacent overlap with AIS, which gives this route a backup transfer path.",
                  fit: "This path builds on completed activities like ACM Projects and stays realistic for your current timeline.",
                },
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
            edgeAnalysis: {
              "e-acm-jp": {
                directEvidence: 0.9,
                transferability: 0.2,
                dominantReason: "directEvidence",
              },
            },
            scenarioAnalysis: {
              excludedClubId: "club-acm",
              excludedClubLabel: "ACM",
              baselinePath: null,
              counterfactualPath: null,
              scoreDelta: {
                overall: -0.4,
                directEvidence: -0.5,
                transferability: -0.1,
                fit: -0.2,
              },
              summary: "If ACM is removed, there is no same-target backup route under the current filters.",
            },
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
    expect(result.edgeAnalysis["e-acm-jp"]?.dominantReason).toBe("directEvidence");
    expect(result.scenarioAnalysis?.excludedClubId).toBe("club-acm");
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
