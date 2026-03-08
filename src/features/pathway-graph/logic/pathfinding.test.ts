import { describe, expect, it } from "vitest";
import { defaultFilters, mockGraph } from "../data/mockGraph";
import { buildPathSet } from "./pathfinding";

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
});
