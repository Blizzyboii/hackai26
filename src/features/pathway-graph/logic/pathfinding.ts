import {
  FilterState,
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  PathCandidate,
  PathSet,
} from "../types";

const MAX_PATH_DEPTH = 8;
const HOP_PENALTY = 0.65;

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

function hasTagOverlap(node: GraphNodeData, tags: string[]) {
  return tags.some((tag) => node.tags.includes(tag));
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

function scorePaths(rawPaths: Array<{ nodeIds: string[]; edgeIds: string[] }>, edgeMap: Map<string, GraphEdgeData>): PathCandidate[] {
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
      const score = effectiveAlumniWeight / (1 + HOP_PENALTY * extraHops);

      return {
        id: `path-${index + 1}`,
        nodeIds: path.nodeIds,
        edgeIds: path.edgeIds,
        alumniWeight: effectiveAlumniWeight,
        extraHops,
        score,
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return a.edgeIds.length - b.edgeIds.length;
    });
}

export function buildPathSet(graph: GraphDataset, filters: FilterState): PathBuildResult {
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

  const candidates = scorePaths(rawPaths, traversable.edgeMap);

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
