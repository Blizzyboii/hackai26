import {
  FilterState,
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  PathCandidate,
  PathSet,
  RiskTolerance,
  StudentProfile,
} from "../types";

const MAX_PATH_DEPTH = 8;
const BASE_HOP_PENALTY = 0.65;
const CROSS_CLUB_HOP_PENALTY = 1.35;

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

function riskMultiplier(riskTolerance: RiskTolerance) {
  if (riskTolerance === "low") {
    return 1.2;
  }

  if (riskTolerance === "high") {
    return 0.82;
  }

  return 1;
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

function dynamicHopPenalty(context: ScoringContext) {
  const timelineFactor = context.semestersRemaining <= 2 ? 1.3 : context.semestersRemaining <= 4 ? 1.1 : 1;

  return BASE_HOP_PENALTY * riskMultiplier(context.riskTolerance) * timelineFactor;
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

function scorePaths(
  rawPaths: Array<{ nodeIds: string[]; edgeIds: string[] }>,
  edgeMap: Map<string, GraphEdgeData>,
  context: ScoringContext,
): PathCandidate[] {
  if (rawPaths.length === 0) {
    return [];
  }

  const baselineEdgeCount = Math.min(...rawPaths.map((path) => path.edgeIds.length));
  const hopPenalty = dynamicHopPenalty(context);

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
      const crossClubHopCount = path.edgeIds.reduce((count, edgeId) => {
        const edge = edgeMap.get(edgeId);
        return edge?.edgeKind === "cross_club" ? count + 1 : count;
      }, 0);

      const confidence = pathConfidence(path, edgeMap, extraHops, context);
      const completionHits = path.nodeIds.filter((nodeId) => context.completedNodeIds.has(nodeId)).length;
      const completionBoost = 1 + completionHits * 0.08;

      const score =
        (effectiveAlumniWeight * confidence * completionBoost) /
        (1 + hopPenalty * extraHops + CROSS_CLUB_HOP_PENALTY * crossClubHopCount);

      const rationale: string[] = [
        `Confidence ${Math.round(confidence * 100)}%`,
        `${effectiveAlumniWeight} alumni-weighted outcomes`,
      ];

      if (completionHits > 0) {
        rationale.push(`${completionHits} completed activities align with this route`);
      }

      if (extraHops > 0) {
        rationale.push(`${extraHops} additional hops reduce certainty`);
      }

      if (crossClubHopCount > 0) {
        rationale.push(`${crossClubHopCount} cross-club hops add transition risk`);
      }

      return {
        id: `path-${index + 1}`,
        nodeIds: path.nodeIds,
        edgeIds: path.edgeIds,
        alumniWeight: effectiveAlumniWeight,
        extraHops,
        score,
        confidence,
        rationale,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
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

  const candidates = scorePaths(rawPaths, traversable.edgeMap, context);

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

  return {
    pathSet: {
      primary: candidates[0],
      secondary: candidates.slice(1, 4),
      all: candidates,
    },
    traversableNodeIds,
    traversableEdgeIds,
  };
}
