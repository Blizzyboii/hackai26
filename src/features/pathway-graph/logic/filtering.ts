import {
  FilterState,
  GraphDataset,
  GraphVisibilityState,
  PathCandidate,
} from "../types";

interface VisibilityInput {
  graph: GraphDataset;
  filters: FilterState;
  pathSet: {
    primary: PathCandidate | null;
    secondary: PathCandidate[];
  };
  traversableNodeIds: Set<string>;
  traversableEdgeIds: Set<string>;
}

export function buildVisibilityState({
  graph,
  filters,
  pathSet,
  traversableNodeIds,
  traversableEdgeIds,
}: VisibilityInput): GraphVisibilityState {
  const nodeVisibility: GraphVisibilityState["nodeVisibility"] = {};
  const edgeVisibility: GraphVisibilityState["edgeVisibility"] = {};
  const relevantNodeIds = new Set<string>();

  const primaryNodeSet = new Set(pathSet.primary?.nodeIds ?? []);
  const primaryEdgeSet = new Set(pathSet.primary?.edgeIds ?? []);

  const secondaryNodeSet = new Set<string>();
  const secondaryEdgeSet = new Set<string>();

  for (const route of pathSet.secondary) {
    route.nodeIds.forEach((nodeId) => secondaryNodeSet.add(nodeId));
    route.edgeIds.forEach((edgeId) => secondaryEdgeSet.add(edgeId));
  }

  for (const node of graph.nodes) {
    const isOnPrimary = primaryNodeSet.has(node.id);
    const isOnSecondary = secondaryNodeSet.has(node.id) && !isOnPrimary;
    const isTarget = filters.targetCompany === node.id;
    const isEliminated = node.type === "club" && filters.eliminatedClubIds.includes(node.id);

    if (filters.showFullTree) {
      nodeVisibility[node.id] = {
        isDimmed: false,
        isOnPrimary: false,
        isOnSecondary: false,
        isTarget,
        isEliminated,
      };
      relevantNodeIds.add(node.id);
      continue;
    }

    const dimByConstraints = !traversableNodeIds.has(node.id);

    const dimByFocus =
      filters.focusMode &&
      filters.targetCompany !== null &&
      !isOnPrimary &&
      !isOnSecondary;

    const isDimmed = dimByConstraints || dimByFocus;

    nodeVisibility[node.id] = {
      isDimmed,
      isOnPrimary,
      isOnSecondary,
      isTarget,
      isEliminated,
    };

    if (!isDimmed) {
      relevantNodeIds.add(node.id);
    }
  }

  for (const edge of graph.edges) {
    const isOnPrimary = primaryEdgeSet.has(edge.id);
    const isOnSecondary = secondaryEdgeSet.has(edge.id) && !isOnPrimary;

    if (filters.showFullTree) {
      edgeVisibility[edge.id] = {
        isDimmed: false,
        isOnPrimary: false,
        isOnSecondary: false,
      };
      continue;
    }

    const dimByConstraints = !traversableEdgeIds.has(edge.id);
    const dimByFocus =
      filters.focusMode &&
      filters.targetCompany !== null &&
      !isOnPrimary &&
      !isOnSecondary;

    const isDimmed = dimByConstraints || dimByFocus;

    edgeVisibility[edge.id] = {
      isDimmed,
      isOnPrimary,
      isOnSecondary,
    };
  }

  return {
    nodeVisibility,
    edgeVisibility,
    relevantNodeIds,
  };
}
