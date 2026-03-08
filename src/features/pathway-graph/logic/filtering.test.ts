import { describe, expect, it } from "vitest";
import { defaultFilters, mockGraph } from "../data/mockGraph";
import { buildVisibilityState } from "./filtering";
import { buildPathSet } from "./pathfinding";

describe("buildVisibilityState", () => {
  it("dims non-matching clubs when include tags are selected", () => {
    const filters = {
      ...defaultFilters,
      includeTags: ["finance"],
      targetCompany: "company-jpmorgan",
    };

    const pathResult = buildPathSet(mockGraph, filters);

    const state = buildVisibilityState({
      graph: mockGraph,
      filters,
      pathSet: {
        primary: pathResult.pathSet.primary,
        secondary: pathResult.pathSet.secondary,
      },
      traversableNodeIds: pathResult.traversableNodeIds,
      traversableEdgeIds: pathResult.traversableEdgeIds,
    });

    expect(state.nodeVisibility["club-acm"].isDimmed).toBe(true);
    expect(state.nodeVisibility["club-fintech"].isDimmed).toBe(false);
  });

  it("exclude tags remove candidates from visible focus paths", () => {
    const filters = {
      ...defaultFilters,
      targetCompany: "company-jpmorgan",
      excludeTags: ["technology"],
    };

    const pathResult = buildPathSet(mockGraph, filters);

    const state = buildVisibilityState({
      graph: mockGraph,
      filters,
      pathSet: {
        primary: pathResult.pathSet.primary,
        secondary: pathResult.pathSet.secondary,
      },
      traversableNodeIds: pathResult.traversableNodeIds,
      traversableEdgeIds: pathResult.traversableEdgeIds,
    });

    expect(state.nodeVisibility["club-acm"].isDimmed).toBe(true);
    expect(state.edgeVisibility["e-root-acm"].isDimmed).toBe(true);
  });

  it("show full map clears dimming and highlight states", () => {
    const filters = {
      ...defaultFilters,
      targetCompany: "company-jpmorgan",
      showFullTree: true,
    };

    const pathResult = buildPathSet(mockGraph, filters);

    const state = buildVisibilityState({
      graph: mockGraph,
      filters,
      pathSet: {
        primary: pathResult.pathSet.primary,
        secondary: pathResult.pathSet.secondary,
      },
      traversableNodeIds: pathResult.traversableNodeIds,
      traversableEdgeIds: pathResult.traversableEdgeIds,
    });

    expect(state.nodeVisibility["club-acm"].isDimmed).toBe(false);
    expect(state.nodeVisibility["club-acm"].isOnPrimary).toBe(false);
    expect(state.edgeVisibility["e-acm-jp"].isOnPrimary).toBe(false);
  });
});
