import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ControlRail } from "./ControlRail";
import { defaultFilters, defaultStudentProfile } from "./data/mockGraph";
import { PathCandidate, ScenarioAnalysis } from "./types";

const primaryPath: PathCandidate = {
  id: "path-1",
  nodeIds: ["root", "club-acm", "company-jpmorgan"],
  edgeIds: ["e-root-acm", "e-acm-jp"],
  alumniWeight: 2,
  extraHops: 0,
  score: 83,
  confidence: 0.89,
  scoreBreakdown: {
    overall: 0.83,
    directEvidence: 0.92,
    transferability: 0.31,
    fit: 0.72,
  },
  explanations: {
    summary: "This path is strongest because ACM has direct alumni proof to JPMorgan.",
    directEvidence: "2 alumni went directly from ACM to JPMorgan.",
    transferability: "ACM has adjacent overlap with AIS, which gives this route a backup transfer path.",
    fit: "This path matches your selected interests in technology and overlaps with ACM Projects.",
  },
  rationale: ["This path is strongest because ACM has direct alumni proof to JPMorgan."],
};

const backupPath: PathCandidate = {
  ...primaryPath,
  id: "path-2",
  nodeIds: ["root", "club-ais", "company-jpmorgan"],
  edgeIds: ["e-root-ais", "e-ais-jp"],
  scoreBreakdown: {
    overall: 0.61,
    directEvidence: 0.55,
    transferability: 0.36,
    fit: 0.64,
  },
  explanations: {
    ...primaryPath.explanations,
    summary: "If the primary route weakens, You -> AIS -> JPMorgan is the next strongest same-target option.",
  },
};

const scenarioAnalysis: ScenarioAnalysis = {
  excludedClubId: "club-acm",
  excludedClubLabel: "ACM",
  baselinePath: primaryPath,
  counterfactualPath: backupPath,
  scoreDelta: {
    overall: -0.22,
    directEvidence: -0.37,
    transferability: 0.05,
    fit: -0.08,
  },
  summary: "If ACM is removed, the strongest route shifts to You -> AIS -> JPMorgan, losing 37% direct evidence and 8% fit.",
};

describe("ControlRail", () => {
  it("renders decomposed path analysis and scenario messaging", () => {
    const onScenarioClubChange = vi.fn();

    render(
      <ControlRail
        filters={defaultFilters}
        profile={defaultStudentProfile}
        tags={["technology", "finance"]}
        clubs={[
          { id: "club-acm", label: "ACM" },
          { id: "club-ais", label: "AIS" },
        ]}
        activities={[{ id: "sub-acm-projects", label: "ACM Projects", type: "subprogram" }]}
        companies={[{ id: "company-jpmorgan", label: "JPMorgan" }]}
        companyOutlook={[
          {
            companyId: "company-jpmorgan",
            label: "JPMorgan",
            confidence: 0.89,
            hasRoute: true,
          },
        ]}
        primaryPath={primaryPath}
        secondaryPaths={[backupPath]}
        pathDescriptions={{
          "path-1": "You -> ACM -> JPMorgan",
          "path-2": "You -> AIS -> JPMorgan",
        }}
        activePathId="path-1"
        scenarioAnalysis={scenarioAnalysis}
        scenarioClubOptions={[{ id: "club-acm", label: "ACM" }]}
        selectedScenarioClubId="club-acm"
        noRouteReason={null}
        mobileOpen={false}
        onMobileOpenChange={() => {}}
        onTargetCompaniesChange={() => {}}
        onActiveTargetChange={() => {}}
        onGraduationTermChange={() => {}}
        onGraduationYearChange={() => {}}
        onSemestersRemainingChange={() => {}}
        onCompletedNodesChange={() => {}}
        onCompletedCourseCountChange={() => {}}
        onCompletedResearchCountChange={() => {}}
        onCompletedExtracurricularCountChange={() => {}}
        onRiskToleranceChange={() => {}}
        onIncludeTagsChange={() => {}}
        onExcludeTagsChange={() => {}}
        onToggleEliminatedClub={() => {}}
        onSelectPath={() => {}}
        onScenarioClubChange={onScenarioClubChange}
        onToggleFocusMode={() => {}}
        onToggleShowFullTree={() => {}}
        onToggleClubBridges={() => {}}
        onClearFilters={() => {}}
      />,
    );

    expect(screen.getAllByText("Strongest path").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Direct evidence").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Transferability").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Backup paths").length).toBeGreaterThan(0);
    expect(screen.getAllByText(scenarioAnalysis.summary).length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByRole("button", { name: "Clear" })[0]!);

    expect(onScenarioClubChange).toHaveBeenCalledWith(null);
  });
});
