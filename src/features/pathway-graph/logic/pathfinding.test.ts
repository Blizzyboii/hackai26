import { describe, expect, it } from "vitest";
import { defaultFilters, mockGraph } from "../data/mockGraph";
import { buildPathSet } from "./pathfinding";
import { GraphDataset } from "../types";

describe("buildPathSet", () => {
  it("ranks direct high-weight route above cross-club detour", () => {
    const result = buildPathSet(mockGraph, {
      ...defaultFilters,
      targetCompany: "company-jpmorgan",
    });

    expect(result.pathSet.primary?.edgeIds).toEqual(["e-root-acm", "e-acm-jp"]);
    expect(result.pathSet.secondary.length).toBeGreaterThan(0);
  });

  it("recomputes strongest route when a club is eliminated", () => {
    const result = buildPathSet(mockGraph, {
      ...defaultFilters,
      targetCompany: "company-jpmorgan",
      eliminatedClubIds: ["club-acm"],
    });

    expect(result.pathSet.primary).not.toBeNull();
    expect(result.pathSet.primary?.nodeIds).not.toContain("club-acm");
  });

  it("secondary paths exclude eliminated routes", () => {
    const result = buildPathSet(mockGraph, {
      ...defaultFilters,
      targetCompany: "company-jpmorgan",
      eliminatedClubIds: ["club-ais"],
    });

    for (const path of result.pathSet.all) {
      expect(path.nodeIds).not.toContain("club-ais");
    }
  });

  it("returns no-route reason when filters prune all possible routes", () => {
    const result = buildPathSet(mockGraph, {
      ...defaultFilters,
      targetCompany: "company-jpmorgan",
      includeTags: ["hobbies & special interests"],
      includeClubBridges: false,
      eliminatedClubIds: ["club-wicys"],
    });

    expect(result.pathSet.primary).toBeNull();
    expect(result.pathSet.reason).toBe("No route found for current filters.");
  });

  it("penalizes cross-club hops when ranking paths", () => {
    const graph: GraphDataset = {
      rootNodeId: "root",
      nodes: [
        { id: "root", type: "root", label: "You", tags: ["student"], size: "lg", people: [] },
        { id: "club-a", type: "club", label: "Club A", tags: ["technology"], size: "lg", people: [] },
        { id: "club-b", type: "club", label: "Club B", tags: ["technology"], size: "lg", people: [] },
        { id: "company-x", type: "company", label: "Company X", tags: ["career"], size: "md", people: [] },
      ],
      edges: [
        {
          id: "e-root-a",
          source: "root",
          target: "club-a",
          type: "hierarchy",
          edgeKind: "root_to_club",
          weight: 1,
          people: [],
        },
        {
          id: "e-a-company",
          source: "club-a",
          target: "company-x",
          type: "career",
          edgeKind: "club_to_company",
          weight: 2,
          people: [],
        },
        {
          id: "e-a-b",
          source: "club-a",
          target: "club-b",
          type: "club_bridge",
          edgeKind: "cross_club",
          bidirectional: true,
          weight: 1,
          people: [],
        },
        {
          id: "e-b-company",
          source: "club-b",
          target: "company-x",
          type: "career",
          edgeKind: "club_to_company",
          weight: 5,
          people: [],
        },
      ],
    };

    const result = buildPathSet(graph, {
      ...defaultFilters,
      targetCompany: "company-x",
      includeClubBridges: true,
    });

    expect(result.pathSet.primary?.edgeIds).toEqual(["e-root-a", "e-a-company"]);
  });
});
