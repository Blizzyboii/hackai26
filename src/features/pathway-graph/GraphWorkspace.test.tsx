import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { GraphWorkspace } from "./GraphWorkspace";
import { defaultStudentProfile, mockGraph } from "./data/mockGraph";
import { RecommendationResult } from "./types";

const loadGraphDatasetMock = vi.fn();
const loadPathRecommendationsMock = vi.fn();

vi.mock("./data/graphApi", () => ({
  loadGraphDataset: (...args: unknown[]) => loadGraphDatasetMock(...args),
}));

vi.mock("./data/recommendationApi", () => ({
  loadPathRecommendations: (...args: unknown[]) => loadPathRecommendationsMock(...args),
}));

interface MockPathNode {
  id: string;
  data: {
    isOnPrimary: boolean;
  };
}

interface MockPathEdge {
  id: string;
  data: {
    isOnPrimary: boolean;
  };
}

interface MockGraphCanvasProps {
  nodes: MockPathNode[];
  edges: MockPathEdge[];
  children?: React.ReactNode;
}

interface MockControlRailProps {
  primaryPath: { id: string } | null;
  pathDescriptions: Record<string, string>;
  companyOutlook: Array<{ label: string; hasRoute: boolean }>;
  noRouteReason: string | null;
}

vi.mock("./GraphCanvas", () => ({
  GraphCanvas: ({ nodes, edges, children }: MockGraphCanvasProps) => (
    <div>
      <div data-testid="primary-nodes">
        {nodes
          .filter((node) => node.data.isOnPrimary)
          .map((node) => node.id)
          .join(",")}
      </div>
      <div data-testid="primary-edges">
        {edges
          .filter((edge) => edge.data.isOnPrimary)
          .map((edge) => edge.id)
          .join(",")}
      </div>
      {children}
    </div>
  ),
}));

vi.mock("./ControlRail", () => ({
  ControlRail: ({ primaryPath, pathDescriptions, companyOutlook, noRouteReason }: MockControlRailProps) => (
    <div>
      <div data-testid="primary-description">
        {primaryPath ? pathDescriptions[primaryPath.id] : noRouteReason}
      </div>
      <div data-testid="company-outlook">
        {companyOutlook.map((entry) => `${entry.label}:${entry.hasRoute ? "yes" : "no"}`).join("|")}
      </div>
    </div>
  ),
}));

vi.mock("./LegendPanel", () => ({
  LegendPanel: () => null,
}));

vi.mock("./PeopleDrawer", () => ({
  PeopleDrawer: () => null,
}));

vi.mock("./PeopleHoverCard", () => ({
  PeopleHoverCard: () => null,
}));

function makeRecommendation(): RecommendationResult {
  return {
    pathSet: {
      primary: {
        id: "path-1",
        nodeIds: ["root", "club-acm", "company-jpmorgan"],
        edgeIds: ["e-root-acm", "e-acm-jp"],
        alumniWeight: 2,
        extraHops: 0,
        score: 82,
        confidence: 0.88,
        scoreBreakdown: {
          overall: 0.82,
          directEvidence: 0.88,
          transferability: 0.34,
          fit: 0.74,
        },
        explanations: {
          summary: "This path is strongest because ACM has direct alumni proof to JPMorgan.",
          directEvidence: "2 alumni went directly from ACM to JPMorgan.",
          transferability: "ACM has adjacent overlap with AIS, which gives this route a backup transfer path.",
          fit: "This path builds on completed activities like ACM and stays realistic for your current timeline.",
        },
        rationale: ["This path is strongest because ACM has direct alumni proof to JPMorgan."],
      },
      secondary: [],
      all: [
        {
          id: "path-1",
          nodeIds: ["root", "club-acm", "company-jpmorgan"],
          edgeIds: ["e-root-acm", "e-acm-jp"],
          alumniWeight: 2,
          extraHops: 0,
          score: 82,
          confidence: 0.88,
          scoreBreakdown: {
            overall: 0.82,
            directEvidence: 0.88,
            transferability: 0.34,
            fit: 0.74,
          },
          explanations: {
            summary: "This path is strongest because ACM has direct alumni proof to JPMorgan.",
            directEvidence: "2 alumni went directly from ACM to JPMorgan.",
            transferability: "ACM has adjacent overlap with AIS, which gives this route a backup transfer path.",
            fit: "This path builds on completed activities like ACM and stays realistic for your current timeline.",
          },
          rationale: ["This path is strongest because ACM has direct alumni proof to JPMorgan."],
        },
      ],
    },
    traversableNodeIds: new Set(["root", "club-acm", "company-jpmorgan"]),
    traversableEdgeIds: new Set(["e-root-acm", "e-acm-jp"]),
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
        directEvidence: 0.88,
        transferability: 0.18,
        dominantReason: "directEvidence",
      },
    },
    scenarioAnalysis: null,
    modelMeta: {
      mode: "rl",
      policyLoaded: true,
    },
  };
}

describe("GraphWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadGraphDatasetMock.mockResolvedValue({
      graph: mockGraph,
      source: "api",
      warning: null,
    });
  });

  it("uses API recommendations to drive highlighted paths", async () => {
    loadPathRecommendationsMock.mockResolvedValue(makeRecommendation());

    render(<GraphWorkspace />);

    await waitFor(() => {
      expect(screen.getByTestId("primary-description").textContent).toContain("You -> ACM -> JPMorgan");
    });

    expect(screen.getByTestId("primary-nodes").textContent).toContain("root,club-acm,company-jpmorgan");
    expect(screen.getByTestId("primary-edges").textContent).toContain("e-root-acm,e-acm-jp");
    expect(screen.getByTestId("company-outlook").textContent).toContain("JPMorgan:yes");
  });

  it("falls back to the local heuristic when recommendation loading fails", async () => {
    loadPathRecommendationsMock.mockRejectedValue(new Error("backend unavailable"));

    render(<GraphWorkspace />);

    await waitFor(() => {
      expect(loadPathRecommendationsMock).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByTestId("primary-description").textContent).toContain("You -> ACM -> JPMorgan");
    });

    expect(screen.getByTestId("primary-edges").textContent).toContain("e-root-acm,e-acm-jp");
    expect(loadPathRecommendationsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        filters: expect.objectContaining({
          targetCompany: defaultStudentProfile.activeTargetCompany,
        }),
        scenarioClubId: null,
      }),
      expect.any(AbortSignal),
    );
  });
});
