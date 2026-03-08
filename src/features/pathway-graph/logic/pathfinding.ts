import {
  FilterState,
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  PathCandidate,
  PathExplanationSet,
  PathScoreBreakdown,
  PathSet,
  RiskTolerance,
  StudentProfile,
} from "../types";

const MAX_PATH_DEPTH = 8;
const DIRECT_EVIDENCE_WEIGHT = 0.5;
const TRANSFERABILITY_WEIGHT = 0.2;
const FIT_WEIGHT = 0.3;

interface TraversableGraph {
  nodeMap: Map<string, GraphNodeData>;
  edgeMap: Map<string, GraphEdgeData>;
  adjacency: Map<string, Array<{ to: string; edgeId: string }>>;
  traversableNodeIds: Set<string>;
}

interface PathBuildResult {
  pathSet: PathSet;
  traversableNodeIds: Set<string>;
  traversableEdgeIds: Set<string>;
}

interface ScoringContext {
  completedNodeIds: Set<string>;
  semestersRemaining: number;
  completedCourseCount: number;
  completedResearchCount: number;
  completedExtracurricularCount: number;
  riskTolerance: RiskTolerance;
}

const defaultScoringContext: ScoringContext = {
  completedNodeIds: new Set<string>(),
  semestersRemaining: 4,
  completedCourseCount: 0,
  completedResearchCount: 0,
  completedExtracurricularCount: 0,
  riskTolerance: "medium",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function hasTagOverlap(node: GraphNodeData, tags: string[]) {
  return tags.some((tag) => node.tags.includes(tag));
}

function buildScoringContext(profile?: StudentProfile): ScoringContext {
  if (!profile) {
    return defaultScoringContext;
  }

  return {
    completedNodeIds: new Set(profile.completedNodeIds),
    semestersRemaining: profile.semestersRemaining,
    completedCourseCount: profile.completedCourseCount,
    completedResearchCount: profile.completedResearchCount,
    completedExtracurricularCount: profile.completedExtracurricularCount,
    riskTolerance: profile.riskTolerance,
  };
}

function progressSignal(context: ScoringContext) {
  const weighted =
    context.completedCourseCount * 0.55 +
    context.completedResearchCount * 1.2 +
    context.completedExtracurricularCount * 0.75;

  return clamp(weighted / 12, 0, 1);
}

export function getEdgeBaseConfidence(edge: GraphEdgeData) {
  if (typeof edge.confidence === "number") {
    return clamp(edge.confidence, 0.35, 0.95);
  }

  if (edge.edgeKind === "club_to_company") {
    return clamp(0.52 + edge.weight * 0.09, 0.45, 0.92);
  }

  if (edge.edgeKind === "cross_club") {
    return clamp(0.46 + edge.weight * 0.07, 0.4, 0.78);
  }

  if (edge.edgeKind === "club_to_subprogram") {
    return clamp(0.6 + edge.weight * 0.06, 0.5, 0.88);
  }

  return clamp(0.62 + edge.weight * 0.05, 0.5, 0.9);
}

function isNodeFilteredOut(node: GraphNodeData, filters: FilterState, nodeMap: Map<string, GraphNodeData>) {
  if (node.type === "root" || node.type === "company") {
    return false;
  }

  if (node.type === "club" && filters.eliminatedClubIds.includes(node.id)) {
    return true;
  }

  if (node.type === "subprogram" && node.parentClubId) {
    if (filters.eliminatedClubIds.includes(node.parentClubId)) {
      return true;
    }
  }

  if (filters.excludeTags.length > 0 && hasTagOverlap(node, filters.excludeTags)) {
    return true;
  }

  if (filters.includeTags.length > 0 && !hasTagOverlap(node, filters.includeTags)) {
    const parent = node.parentClubId ? nodeMap.get(node.parentClubId) : undefined;

    if (parent && hasTagOverlap(parent, filters.includeTags)) {
      return false;
    }

    return true;
  }

  return false;
}

function buildTraversableGraph(graph: GraphDataset, filters: FilterState): TraversableGraph {
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const edgeMap = new Map(graph.edges.map((edge) => [edge.id, edge]));

  const traversableNodeIds = new Set<string>();

  for (const node of graph.nodes) {
    if (!isNodeFilteredOut(node, filters, nodeMap)) {
      traversableNodeIds.add(node.id);
    }
  }

  const adjacency = new Map<string, Array<{ to: string; edgeId: string }>>();

  for (const edge of graph.edges) {
    if (edge.edgeKind === "cross_club" && !filters.includeClubBridges) {
      continue;
    }

    if (!traversableNodeIds.has(edge.source) || !traversableNodeIds.has(edge.target)) {
      continue;
    }

    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, []);
    }

    adjacency.get(edge.source)?.push({ to: edge.target, edgeId: edge.id });

    if (edge.bidirectional) {
      if (!adjacency.has(edge.target)) {
        adjacency.set(edge.target, []);
      }

      adjacency.get(edge.target)?.push({ to: edge.source, edgeId: edge.id });
    }
  }

  return {
    nodeMap,
    edgeMap,
    adjacency,
    traversableNodeIds,
  };
}

function enumerateSimplePaths({
  startNodeId,
  targetNodeId,
  adjacency,
}: {
  startNodeId: string;
  targetNodeId: string;
  adjacency: Map<string, Array<{ to: string; edgeId: string }>>;
}) {
  const results: Array<{ nodeIds: string[]; edgeIds: string[] }> = [];

  const visit = (
    currentNodeId: string,
    visitedNodeIds: Set<string>,
    pathNodeIds: string[],
    pathEdgeIds: string[],
  ) => {
    if (pathEdgeIds.length > MAX_PATH_DEPTH) {
      return;
    }

    if (currentNodeId === targetNodeId) {
      results.push({
        nodeIds: [...pathNodeIds],
        edgeIds: [...pathEdgeIds],
      });
      return;
    }

    const neighbors = adjacency.get(currentNodeId) ?? [];

    for (const neighbor of neighbors) {
      if (visitedNodeIds.has(neighbor.to)) {
        continue;
      }

      visitedNodeIds.add(neighbor.to);
      pathNodeIds.push(neighbor.to);
      pathEdgeIds.push(neighbor.edgeId);

      visit(neighbor.to, visitedNodeIds, pathNodeIds, pathEdgeIds);

      visitedNodeIds.delete(neighbor.to);
      pathNodeIds.pop();
      pathEdgeIds.pop();
    }
  };

  visit(startNodeId, new Set([startNodeId]), [startNodeId], []);

  return results;
}

function pathConfidence(
  path: { nodeIds: string[]; edgeIds: string[] },
  edgeMap: Map<string, GraphEdgeData>,
  extraHops: number,
  context: ScoringContext,
) {
  const validEdges = path.edgeIds
    .map((edgeId) => edgeMap.get(edgeId))
    .filter((edge): edge is GraphEdgeData => Boolean(edge));

  const avgEdgeConfidence =
    validEdges.length > 0
      ? validEdges.reduce((sum, edge) => sum + getEdgeBaseConfidence(edge), 0) / validEdges.length
      : 0.5;

  const innerNodeCount = Math.max(path.nodeIds.length - 2, 1);
  const completedInnerNodes = path.nodeIds.filter((nodeId) => context.completedNodeIds.has(nodeId)).length;
  const completionRatio = completedInnerNodes / innerNodeCount;

  const timelinePenalty = extraHops * (context.semestersRemaining <= 2 ? 0.07 : 0.04);
  const progressBoost = progressSignal(context) * 0.1 + completionRatio * 0.12;
  const riskNudge = context.riskTolerance === "high" ? 0.02 : context.riskTolerance === "low" ? -0.02 : 0;

  return clamp(avgEdgeConfidence + progressBoost + riskNudge - timelinePenalty, 0.35, 0.97);
}

function directEdgeScore(edge: GraphEdgeData, maxWeight: number) {
  const normalizedWeight = clamp(edge.weight / Math.max(maxWeight, 1), 0, 1);
  return clamp(0.72 * normalizedWeight + 0.28 * getEdgeBaseConfidence(edge), 0, 1);
}

function bridgeEdgeScore(edge: GraphEdgeData, maxWeight: number) {
  const normalizedWeight = clamp(edge.weight / Math.max(maxWeight, 1), 0, 1);
  return clamp(0.55 * normalizedWeight + 0.45 * getEdgeBaseConfidence(edge), 0, 1);
}

function clubIdForNode(nodeMap: Map<string, GraphNodeData>, nodeId: string) {
  const node = nodeMap.get(nodeId);

  if (!node) {
    return null;
  }

  if (node.type === "club") {
    return nodeId;
  }

  if (node.type === "subprogram" && node.parentClubId) {
    return node.parentClubId;
  }

  return null;
}

function buildPathAnalysis({
  targetCompany,
  path,
  edgeMap,
  nodeMap,
  filters,
  context,
}: {
  targetCompany: string;
  path: { nodeIds: string[]; edgeIds: string[]; extraHops: number };
  edgeMap: Map<string, GraphEdgeData>;
  nodeMap: Map<string, GraphNodeData>;
  filters: FilterState;
  context: ScoringContext;
}) {
  const directEdges = Array.from(edgeMap.values()).filter(
    (edge) => edge.edgeKind === "club_to_company" && edge.target === targetCompany,
  );
  const bridgeEdges = Array.from(edgeMap.values()).filter((edge) => edge.edgeKind === "cross_club");
  const maxDirectWeight = Math.max(...directEdges.map((edge) => edge.weight), 1);
  const maxBridgeWeight = Math.max(...bridgeEdges.map((edge) => edge.weight), 1);
  const originClubId = path.nodeIds.map((nodeId) => clubIdForNode(nodeMap, nodeId)).find((clubId) => Boolean(clubId)) ?? null;

  let bestDirectEdgeSourceId: string | null = null;
  let bestDirectEdgeWeight = 0;
  let directEvidence = 0;

  path.edgeIds.forEach((edgeId, index) => {
    const edge = edgeMap.get(edgeId);
    if (!edge || edge.edgeKind !== "club_to_company" || edge.target !== targetCompany || edge.source !== originClubId) {
      return;
    }

    const candidate = clamp(directEdgeScore(edge, maxDirectWeight) - 0.12 * index, 0, 1);
    if (candidate > directEvidence) {
      directEvidence = candidate;
      bestDirectEdgeSourceId = edge.source;
      bestDirectEdgeWeight = edge.weight;
    }
  });

  let transferability = 0;
  let bridgeCount = 0;
  let transferExplanation = "This path depends less on adjacent-club overlap, so most of its strength comes from direct evidence.";
  for (const edgeId of path.edgeIds) {
    const edge = edgeMap.get(edgeId);
    if (!edge || edge.edgeKind !== "cross_club") {
      continue;
    }

    bridgeCount += 1;
    const candidate = clamp(0.45 * bridgeEdgeScore(edge, maxBridgeWeight) - 0.14 * path.extraHops - 0.08 * bridgeCount, 0, 1);
    if (candidate > transferability) {
      transferability = candidate;
      const sourceLabel = nodeMap.get(edge.source)?.label ?? edge.source;
      const targetLabel = nodeMap.get(edge.target)?.label ?? edge.target;
      transferExplanation = `${sourceLabel} overlaps with ${targetLabel}, which keeps this route viable even without direct alumni proof.`;
    }
  }

  if (transferability === 0) {
    for (const nodeId of path.nodeIds) {
      const clubId = clubIdForNode(nodeMap, nodeId);
      if (!clubId) {
        continue;
      }

      for (const edge of bridgeEdges) {
        const touchesClub = edge.source === clubId || edge.target === clubId;
        if (!touchesClub) {
          continue;
        }

        const candidate = bridgeEdgeScore(edge, maxBridgeWeight) * 0.75;
        if (candidate > transferability) {
          transferability = candidate;
          const partnerId = edge.source === clubId ? edge.target : edge.source;
          const clubLabel = nodeMap.get(clubId)?.label ?? clubId;
          const partnerLabel = nodeMap.get(partnerId)?.label ?? partnerId;
          transferExplanation = `${clubLabel} has adjacent overlap with ${partnerLabel}, which gives this route a backup transfer path.`;
        }
      }
    }
  }

  const transferPhrase =
    transferability > 0
      ? transferExplanation
          .replace(/\.$/, "")
          .replace(" which keeps this route viable even without direct alumni proof", "")
          .replace(" which gives this route a backup transfer path", "")
      : "the route relies more on direct proof than transfer overlap";

  const activityNodes = path.nodeIds
    .map((nodeId) => nodeMap.get(nodeId))
    .filter((node): node is GraphNodeData => Boolean(node && (node.type === "club" || node.type === "subprogram")));

  const tagComponent =
    filters.includeTags.length > 0
      ? clamp(
          activityNodes.filter((node) => hasTagOverlap(node, filters.includeTags)).length / Math.max(activityNodes.length, 1),
          0,
          1,
        )
      : 0.6;

  const completedHits = path.nodeIds.filter((nodeId) => context.completedNodeIds.has(nodeId)).length;
  const completionComponent = clamp(
    0.45 * (completedHits / Math.max(activityNodes.length, 1)) + 0.55 * progressSignal(context),
    0,
    1,
  );

  const crossClubCount = path.edgeIds.reduce((count, edgeId) => {
    const edge = edgeMap.get(edgeId);
    return edge?.edgeKind === "cross_club" ? count + 1 : count;
  }, 0);

  let timelineComponent = clamp(0.5 + 0.09 * (context.semestersRemaining - path.edgeIds.length - path.extraHops), 0, 1);
  if (context.riskTolerance === "low") {
    timelineComponent = clamp(timelineComponent - 0.05 * crossClubCount, 0, 1);
  } else if (context.riskTolerance === "high") {
    timelineComponent = clamp(timelineComponent + 0.03 * path.extraHops, 0, 1);
  }

  const fit = clamp(0.45 * tagComponent + 0.35 * completionComponent + 0.2 * timelineComponent, 0, 1);
  const overall = clamp(
    DIRECT_EVIDENCE_WEIGHT * directEvidence + TRANSFERABILITY_WEIGHT * transferability + FIT_WEIGHT * fit,
    0,
    1,
  );

  const companyLabel = nodeMap.get(targetCompany)?.label ?? targetCompany;
  const sourceLabel = bestDirectEdgeSourceId
    ? (nodeMap.get(bestDirectEdgeSourceId)?.label ?? bestDirectEdgeSourceId)
    : (originClubId ? (nodeMap.get(originClubId)?.label ?? originClubId) : activityNodes[0]?.label) ?? "this route";
  const selectedTags = filters.includeTags.slice(0, 2).join(", ");
  const completedLabels = path.nodeIds
    .filter((nodeId) => context.completedNodeIds.has(nodeId))
    .map((nodeId) => nodeMap.get(nodeId)?.label ?? nodeId)
    .slice(0, 2);

  const directExplanation = bestDirectEdgeSourceId
    ? `${bestDirectEdgeWeight} ${bestDirectEdgeWeight === 1 ? "alumnus" : "alumni"} went directly from ${sourceLabel} to ${companyLabel}.`
    : `There is limited direct alumni evidence from ${sourceLabel} to ${companyLabel}.`;

  let fitExplanation = `This path fits a ${Math.round(timelineComponent * 100)}% timeline match for your current profile and remaining semesters.`;
  let fitPhrase = "fits your current timeline";

  if (filters.includeTags.length > 0 && completedLabels.length > 0) {
    fitExplanation = `This path matches your selected interests in ${selectedTags} and overlaps with ${completedLabels.join(", ")}.`;
    fitPhrase = `matches your selected interests in ${selectedTags}`;
  } else if (filters.includeTags.length > 0) {
    fitExplanation = `This path matches your selected interests in ${selectedTags} and stays realistic for your current timeline.`;
    fitPhrase = `matches your selected interests in ${selectedTags}`;
  } else if (completedLabels.length > 0) {
    fitExplanation = `This path builds on completed activities like ${completedLabels.join(", ")} and stays realistic for your current timeline.`;
    fitPhrase = `builds on completed activities like ${completedLabels.join(", ")}`;
  }

  const explanations: PathExplanationSet = {
    summary: `This path is strongest because ${sourceLabel} has direct alumni proof to ${companyLabel}, ${transferPhrase}, and it ${fitPhrase}.`,
    directEvidence: directExplanation,
    transferability: transferExplanation,
    fit: fitExplanation,
  };

  const scoreBreakdown: PathScoreBreakdown = {
    overall,
    directEvidence,
    transferability,
    fit,
  };

  return {
    scoreBreakdown,
    explanations,
  };
}

function scorePaths(
  rawPaths: Array<{ nodeIds: string[]; edgeIds: string[] }>,
  nodeMap: Map<string, GraphNodeData>,
  edgeMap: Map<string, GraphEdgeData>,
  filters: FilterState,
  context: ScoringContext,
): PathCandidate[] {
  if (rawPaths.length === 0) {
    return [];
  }

  const baselineEdgeCount = Math.min(...rawPaths.map((path) => path.edgeIds.length));
  return rawPaths
    .map((path, index) => {
      const careerEdges: GraphEdgeData[] = path.edgeIds.flatMap((edgeId) => {
        const edge = edgeMap.get(edgeId);

        if (!edge || edge.edgeKind !== "club_to_company") {
          return [];
        }

        return [edge];
      });

      const alumniWeight = careerEdges.reduce((sum, edge) => sum + edge.weight, 0);
      const effectiveAlumniWeight = alumniWeight > 0 ? alumniWeight : 1;
      const extraHops = Math.max(path.edgeIds.length - baselineEdgeCount, 0);
      const confidence = pathConfidence(path, edgeMap, extraHops, context);

      const analysis = buildPathAnalysis({
        targetCompany: filters.targetCompany ?? "",
        path: {
          nodeIds: path.nodeIds,
          edgeIds: path.edgeIds,
          extraHops,
        },
        edgeMap,
        nodeMap,
        filters,
        context,
      });

      const rationale: string[] = [
        analysis.explanations.summary,
        analysis.explanations.directEvidence,
        analysis.explanations.transferability,
        analysis.explanations.fit,
      ];

      return {
        id: `path-${index + 1}`,
        nodeIds: path.nodeIds,
        edgeIds: path.edgeIds,
        alumniWeight: effectiveAlumniWeight,
        extraHops,
        score: analysis.scoreBreakdown.overall * 100,
        confidence,
        scoreBreakdown: analysis.scoreBreakdown,
        explanations: analysis.explanations,
        rationale,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      if (b.scoreBreakdown.directEvidence !== a.scoreBreakdown.directEvidence) {
        return b.scoreBreakdown.directEvidence - a.scoreBreakdown.directEvidence;
      }

      return a.edgeIds.length - b.edgeIds.length;
    });
}

export function buildPathSet(
  graph: GraphDataset,
  filters: FilterState,
  profile?: StudentProfile,
): PathBuildResult {
  if (!filters.targetCompany) {
    return {
      pathSet: {
        primary: null,
        secondary: [],
        all: [],
        reason: "Select a target company to compute a path.",
      },
      traversableNodeIds: new Set(),
      traversableEdgeIds: new Set(),
    };
  }

  const traversable = buildTraversableGraph(graph, filters);
  const context = buildScoringContext(profile);

  const traversableNodeIds = new Set<string>(traversable.traversableNodeIds);
  const traversableEdgeIds = new Set<string>();

  for (const [source, neighbors] of traversable.adjacency.entries()) {
    if (neighbors.length === 0) {
      continue;
    }

    traversableNodeIds.add(source);

    for (const neighbor of neighbors) {
      traversableEdgeIds.add(neighbor.edgeId);
      traversableNodeIds.add(neighbor.to);
    }
  }

  if (!traversableNodeIds.has(filters.targetCompany)) {
    return {
      pathSet: {
        primary: null,
        secondary: [],
        all: [],
        reason: "Target company is filtered out by current constraints.",
      },
      traversableNodeIds,
      traversableEdgeIds,
    };
  }

  const rawPaths = enumerateSimplePaths({
    startNodeId: graph.rootNodeId,
    targetNodeId: filters.targetCompany,
    adjacency: traversable.adjacency,
  });

  const candidates = scorePaths(rawPaths, traversable.nodeMap, traversable.edgeMap, filters, context);

  if (candidates.length === 0) {
    return {
      pathSet: {
        primary: null,
        secondary: [],
        all: [],
        reason: "No route found for current filters.",
      },
      traversableNodeIds,
      traversableEdgeIds,
    };
  }

  const annotatedCandidates = candidates.map((candidate, index) => ({
    ...candidate,
    explanations: {
      ...candidate.explanations,
      summary:
        index === 0
          ? candidate.explanations.summary
          : `If the primary route weakens, ${candidate.nodeIds
              .map((nodeId) => traversable.nodeMap.get(nodeId)?.label ?? nodeId)
              .join(" -> ")} is the next strongest same-target option.`,
    },
  }));

  annotatedCandidates.forEach((candidate) => {
    candidate.rationale[0] = candidate.explanations.summary;
  });

  return {
    pathSet: {
      primary: annotatedCandidates[0],
      secondary: annotatedCandidates.slice(1, 4),
      all: annotatedCandidates,
    },
    traversableNodeIds,
    traversableEdgeIds,
  };
}
