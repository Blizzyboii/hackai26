import {
  CompanyOutlook,
  EdgeAnalysis,
  FilterState,
  PathCandidate,
  PathExplanationSet,
  PathScoreBreakdown,
  PathSet,
  RecommendationModelMeta,
  RecommendationResult,
  ScenarioAnalysis,
  StudentProfile,
} from "../types";

interface RecommendationRequest {
  filters: FilterState;
  profile: StudentProfile;
  topK?: number;
  scenarioClubId?: string | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isPathScoreBreakdown(value: unknown): value is PathScoreBreakdown {
  return (
    isObject(value) &&
    typeof value.overall === "number" &&
    typeof value.directEvidence === "number" &&
    typeof value.transferability === "number" &&
    typeof value.fit === "number"
  );
}

function isPathExplanationSet(value: unknown): value is PathExplanationSet {
  return (
    isObject(value) &&
    typeof value.summary === "string" &&
    typeof value.directEvidence === "string" &&
    typeof value.transferability === "string" &&
    typeof value.fit === "string"
  );
}

function isPathCandidate(value: unknown): value is PathCandidate {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    isStringArray(value.nodeIds) &&
    isStringArray(value.edgeIds) &&
    typeof value.alumniWeight === "number" &&
    typeof value.extraHops === "number" &&
    typeof value.score === "number" &&
    typeof value.confidence === "number" &&
    isPathScoreBreakdown(value.scoreBreakdown) &&
    isPathExplanationSet(value.explanations) &&
    Array.isArray(value.rationale) &&
    value.rationale.every((entry) => typeof entry === "string")
  );
}

function isPathSet(value: unknown): value is PathSet {
  if (!isObject(value)) {
    return false;
  }

  return (
    (value.primary === null || isPathCandidate(value.primary)) &&
    Array.isArray(value.secondary) &&
    value.secondary.every((entry) => isPathCandidate(entry)) &&
    Array.isArray(value.all) &&
    value.all.every((entry) => isPathCandidate(entry)) &&
    (typeof value.reason === "undefined" || typeof value.reason === "string")
  );
}

function isCompanyOutlook(value: unknown): value is CompanyOutlook {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.companyId === "string" &&
    typeof value.label === "string" &&
    (value.confidence === null || typeof value.confidence === "number") &&
    typeof value.hasRoute === "boolean"
  );
}

function parseModelMeta(value: unknown): RecommendationModelMeta | null {
  if (!isObject(value)) {
    return null;
  }

  if (typeof value.mode !== "string" || typeof value.policyLoaded !== "boolean") {
    return null;
  }

  return {
    mode: value.mode,
    policyLoaded: value.policyLoaded,
    checkpointPath: typeof value.checkpointPath === "string" ? value.checkpointPath : undefined,
    checkpointJsonPath: typeof value.checkpointJsonPath === "string" ? value.checkpointJsonPath : undefined,
    featureManifestPath: typeof value.featureManifestPath === "string" ? value.featureManifestPath : undefined,
    reason: typeof value.reason === "string" ? value.reason : null,
    featureNames: isStringArray(value.featureNames) ? value.featureNames : undefined,
  };
}

function isEdgeAnalysis(value: unknown): value is EdgeAnalysis {
  return (
    isObject(value) &&
    typeof value.directEvidence === "number" &&
    typeof value.transferability === "number" &&
    (value.dominantReason === "directEvidence" ||
      value.dominantReason === "transferability" ||
      value.dominantReason === "balanced")
  );
}

function isScenarioAnalysis(value: unknown): value is ScenarioAnalysis {
  return (
    isObject(value) &&
    typeof value.excludedClubId === "string" &&
    typeof value.excludedClubLabel === "string" &&
    (value.baselinePath === null || isPathCandidate(value.baselinePath)) &&
    (value.counterfactualPath === null || isPathCandidate(value.counterfactualPath)) &&
    isPathScoreBreakdown(value.scoreDelta) &&
    typeof value.summary === "string"
  );
}

function parseRecommendationResult(value: unknown): RecommendationResult | null {
  if (!isObject(value)) {
    return null;
  }

  if (!isPathSet(value.pathSet)) {
    return null;
  }

  if (!isStringArray(value.traversableNodeIds) || !isStringArray(value.traversableEdgeIds)) {
    return null;
  }

  if (!Array.isArray(value.companyOutlook) || !value.companyOutlook.every((entry) => isCompanyOutlook(entry))) {
    return null;
  }

  if (!isObject(value.edgeAnalysis)) {
    return null;
  }

  for (const candidate of Object.values(value.edgeAnalysis)) {
    if (!isEdgeAnalysis(candidate)) {
      return null;
    }
  }

  if (!(typeof value.scenarioAnalysis === "undefined" || value.scenarioAnalysis === null || isScenarioAnalysis(value.scenarioAnalysis))) {
    return null;
  }

  return {
    pathSet: value.pathSet,
    traversableNodeIds: new Set(value.traversableNodeIds),
    traversableEdgeIds: new Set(value.traversableEdgeIds),
    companyOutlook: value.companyOutlook,
    edgeAnalysis: value.edgeAnalysis as Record<string, EdgeAnalysis>,
    scenarioAnalysis: value.scenarioAnalysis === undefined ? null : value.scenarioAnalysis,
    modelMeta: parseModelMeta(value.modelMeta),
  };
}

export async function loadPathRecommendations(
  request: RecommendationRequest,
  signal?: AbortSignal,
): Promise<RecommendationResult> {
  const response = await fetch("/api/proxy/recommend-paths", {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Recommendation API request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const parsed = parseRecommendationResult(payload);
  if (!parsed) {
    throw new Error("Recommendation API returned an invalid payload shape");
  }

  return parsed;
}
