"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Position } from "@xyflow/react";
import { ControlRail } from "./ControlRail";
import { PathwayEdge } from "./EdgeRenderer";
import { GraphCanvas } from "./GraphCanvas";
import {
  availableClubs,
  availableCompanies,
  availableTags,
  defaultFilters,
  mockGraph,
} from "./data/mockGraph";
import { LegendPanel } from "./LegendPanel";
import { PathwayNode } from "./NodeRenderer";
import { PeopleDrawer } from "./PeopleDrawer";
import { PeopleHoverCard } from "./PeopleHoverCard";
import { buildVisibilityState } from "./logic/filtering";
import { buildNodePositions } from "./logic/layout";
import { buildPathSet } from "./logic/pathfinding";
import { FilterState, GraphEdgeData, GraphNodeData, PathCandidate, Person } from "./types";

interface HoverPreviewState {
  kind: "edge" | "node";
  id: string;
  point: {
    x: number;
    y: number;
  };
}

interface InspectState {
  kind: "edge" | "node";
  id: string;
}

interface DetailPayload {
  title: string;
  subtitle: string;
  people: Person[];
  countLabel?: string;
  contextActionLabel?: string;
  onContextAction?: () => void;
}

function uniquePeople(people: Person[]) {
  const deduped = new Map<string, Person>();

  for (const person of people) {
    deduped.set(person.id, person);
  }

  return Array.from(deduped.values());
}

function nodeDetailPayload(
  node: GraphNodeData,
  filters: FilterState,
  onToggleEliminatedClub: (clubId: string) => void,
): DetailPayload {
  const isClub = node.type === "club";
  const isEliminated = isClub && filters.eliminatedClubIds.includes(node.id);

  return {
    title: node.label,
    subtitle: isClub
      ? `${node.categoryTag ?? "club"} · ${node.memberCount ?? 0} members`
      : node.type === "subprogram"
        ? "Sub-program details"
        : "Node details",
    people: node.people,
    countLabel: node.people.length > 0 ? `${node.people.length} people associated` : "No people mapped",
    contextActionLabel: isClub ? (isEliminated ? "Re-enable club" : "Mark club unavailable") : undefined,
    onContextAction: isClub
      ? () => {
          onToggleEliminatedClub(node.id);
        }
      : undefined,
  };
}

function edgeDetailPayload(
  edge: GraphEdgeData,
  nodeById: Map<string, GraphNodeData>,
): DetailPayload {
  const sourceLabel = nodeById.get(edge.source)?.label ?? edge.source;
  const targetLabel = nodeById.get(edge.target)?.label ?? edge.target;

  let people = edge.people;

  if (people.length === 0 && edge.edgeKind === "cross_club") {
    people = uniquePeople([
      ...(nodeById.get(edge.source)?.people ?? []),
      ...(nodeById.get(edge.target)?.people ?? []),
    ]);
  }

  return {
    title: `${sourceLabel} → ${targetLabel}`,
    subtitle: edge.relationLabel ?? edge.edgeKind,
    people,
    countLabel: `${edge.weight} weighted alumni`,
  };
}

function getDisplayedPaths(pathSet: { primary: PathCandidate | null; secondary: PathCandidate[]; all: PathCandidate[] }, activePathId: string | null) {
  if (!activePathId) {
    return pathSet;
  }

  const selected = pathSet.all.find((path) => path.id === activePathId);

  if (!selected) {
    return pathSet;
  }

  const rest = pathSet.all.filter((path) => path.id !== selected.id);

  return {
    primary: selected,
    secondary: rest.slice(0, 3),
    all: [selected, ...rest],
  };
}

export function GraphWorkspace() {
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const [inspectState, setInspectState] = useState<InspectState | null>(null);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const syncViewportSize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    return () => window.removeEventListener("resize", syncViewportSize);
  }, []);

  const nodePositions = useMemo(() => buildNodePositions(mockGraph), []);

  const nodeById = useMemo(
    () => new Map(mockGraph.nodes.map((node) => [node.id, node])),
    [],
  );

  const edgeById = useMemo(
    () => new Map(mockGraph.edges.map((edge) => [edge.id, edge])),
    [],
  );
  const nodeLabelById = useMemo(
    () => new Map(mockGraph.nodes.map((node) => [node.id, node.label])),
    [],
  );

  const pathResult = useMemo(() => buildPathSet(mockGraph, filters), [filters]);

  const displayedPaths = useMemo(
    () => getDisplayedPaths(pathResult.pathSet, activePathId),
    [pathResult.pathSet, activePathId],
  );

  const visibilityState = useMemo(
    () =>
      buildVisibilityState({
        graph: mockGraph,
        filters,
        pathSet: {
          primary: displayedPaths.primary,
          secondary: displayedPaths.secondary,
        },
        traversableNodeIds: pathResult.traversableNodeIds,
        traversableEdgeIds: pathResult.traversableEdgeIds,
      }),
    [displayedPaths.primary, displayedPaths.secondary, filters, pathResult.traversableEdgeIds, pathResult.traversableNodeIds],
  );

  const clearHoverCloseTimeout = useCallback(() => {
    if (hoverCloseTimeoutRef.current) {
      clearTimeout(hoverCloseTimeoutRef.current);
      hoverCloseTimeoutRef.current = null;
    }
  }, []);

  const handleHover = useCallback(
    (kind: "edge" | "node", id: string, point: { x: number; y: number }) => {
      clearHoverCloseTimeout();
      setHoverPreview({ kind, id, point });
    },
    [clearHoverCloseTimeout],
  );

  const handleHoverLeave = useCallback(() => {
    clearHoverCloseTimeout();
    hoverCloseTimeoutRef.current = setTimeout(() => {
      setHoverPreview(null);
    }, 160);
  }, [clearHoverCloseTimeout]);

  const toggleEliminatedClub = useCallback((clubId: string) => {
    setFilters((current) => {
      const exists = current.eliminatedClubIds.includes(clubId);

      return {
        ...current,
        eliminatedClubIds: exists
          ? current.eliminatedClubIds.filter((id) => id !== clubId)
          : [...current.eliminatedClubIds, clubId],
        showFullTree: false,
      };
    });
  }, []);

  const flowNodes = useMemo<PathwayNode[]>(() => {
    return mockGraph.nodes.map((node) => {
      const visibility = visibilityState.nodeVisibility[node.id];
      const position = nodePositions.get(node.id) ?? { x: 200, y: 200 };

      return {
        id: node.id,
        type: "pathwayNode",
        position,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        draggable: false,
        selectable: false,
        data: {
          ...node,
          isDimmed: visibility?.isDimmed ?? false,
          isOnPrimary: visibility?.isOnPrimary ?? false,
          isOnSecondary: visibility?.isOnSecondary ?? false,
          isTarget: visibility?.isTarget ?? false,
          isEliminated: visibility?.isEliminated ?? false,
          onHoverNode: (nodeId: string, point: { x: number; y: number }) => {
            handleHover("node", nodeId, point);
          },
          onLeaveNode: handleHoverLeave,
          onInspectNode: (nodeId: string) => {
            setHoverPreview(null);
            setInspectState({ kind: "node", id: nodeId });
          },
        },
      };
    });
  }, [handleHover, handleHoverLeave, nodePositions, visibilityState.nodeVisibility]);

  const flowEdges = useMemo<PathwayEdge[]>(() => {
    return mockGraph.edges.map((edge) => {
      const visibility = visibilityState.edgeVisibility[edge.id];

      return {
        id: edge.id,
        type: "pathwayEdge",
        source: edge.source,
        target: edge.target,
        selectable: false,
        data: {
          ...edge,
          isDimmed: visibility?.isDimmed ?? false,
          isOnPrimary: visibility?.isOnPrimary ?? false,
          isOnSecondary: visibility?.isOnSecondary ?? false,
          onHover: (edgeId: string, point: { x: number; y: number }) => {
            handleHover("edge", edgeId, point);
          },
          onLeave: handleHoverLeave,
          onInspect: (edgeId: string) => {
            setHoverPreview(null);
            setInspectState({ kind: "edge", id: edgeId });
          },
        },
      };
    });
  }, [handleHover, handleHoverLeave, visibilityState.edgeVisibility]);

  const hoverPayload = useMemo(() => {
    if (!hoverPreview) {
      return null;
    }

    if (hoverPreview.kind === "node") {
      const node = nodeById.get(hoverPreview.id);
      if (!node) {
        return null;
      }

      return nodeDetailPayload(node, filters, toggleEliminatedClub);
    }

    const edge = edgeById.get(hoverPreview.id);
    if (!edge) {
      return null;
    }

    return edgeDetailPayload(edge, nodeById);
  }, [edgeById, filters, hoverPreview, nodeById, toggleEliminatedClub]);

  const inspectPayload = useMemo(() => {
    if (!inspectState) {
      return null;
    }

    if (inspectState.kind === "node") {
      const node = nodeById.get(inspectState.id);
      return node ? nodeDetailPayload(node, filters, toggleEliminatedClub) : null;
    }

    const edge = edgeById.get(inspectState.id);
    return edge ? edgeDetailPayload(edge, nodeById) : null;
  }, [edgeById, filters, inspectState, nodeById, toggleEliminatedClub]);

  const fitViewNodeIds = useMemo(() => {
    if (filters.showFullTree) {
      return mockGraph.nodes.map((node) => node.id);
    }

    const relevant = Array.from(visibilityState.relevantNodeIds);
    return relevant.length > 0 ? relevant : mockGraph.nodes.map((node) => node.id);
  }, [filters.showFullTree, visibilityState.relevantNodeIds]);

  const noRouteReason = displayedPaths.primary ? null : pathResult.pathSet.reason ?? "No route found for current filters.";
  const pathDescriptions = useMemo(() => {
    const output: Record<string, string> = {};

    for (const path of displayedPaths.all) {
      output[path.id] = path.nodeIds.map((nodeId) => nodeLabelById.get(nodeId) ?? nodeId).join(" -> ");
    }

    return output;
  }, [displayedPaths.all, nodeLabelById]);

  return (
    <div className="h-screen w-full overflow-hidden bg-[#0a0a0a] text-slate-100">
      <div className="flex h-full">
        <ControlRail
          filters={filters}
          tags={availableTags}
          clubs={availableClubs}
          companies={availableCompanies}
          primaryPath={displayedPaths.primary}
          secondaryPaths={displayedPaths.secondary}
          pathDescriptions={pathDescriptions}
          activePathId={activePathId}
          noRouteReason={noRouteReason}
          mobileOpen={mobileRailOpen}
          onMobileOpenChange={setMobileRailOpen}
          onTargetChange={(targetCompany) => {
            setActivePathId(null);
            setFilters((current) => ({
              ...current,
              targetCompany,
              showFullTree: false,
            }));
          }}
          onIncludeTagsChange={(includeTags) => {
            setActivePathId(null);
            setFilters((current) => ({
              ...current,
              includeTags,
              excludeTags: current.excludeTags.filter((tag) => !includeTags.includes(tag)),
              showFullTree: false,
            }));
          }}
          onExcludeTagsChange={(excludeTags) => {
            setActivePathId(null);
            setFilters((current) => ({
              ...current,
              excludeTags,
              includeTags: current.includeTags.filter((tag) => !excludeTags.includes(tag)),
              showFullTree: false,
            }));
          }}
          onToggleEliminatedClub={(clubId) => {
            setActivePathId(null);
            toggleEliminatedClub(clubId);
          }}
          onSelectPath={(pathId) => {
            setFilters((current) => ({
              ...current,
              showFullTree: false,
            }));
            setActivePathId(pathId);
          }}
          onToggleFocusMode={() =>
            setFilters((current) => ({
              ...current,
              focusMode: !current.focusMode,
              showFullTree: false,
            }))
          }
          onToggleShowFullTree={() =>
            setFilters((current) => ({
              ...current,
              showFullTree: !current.showFullTree,
            }))
          }
          onToggleClubBridges={() =>
            setFilters((current) => ({
              ...current,
              includeClubBridges: !current.includeClubBridges,
              showFullTree: false,
            }))
          }
          onClearFilters={() => {
            setActivePathId(null);
            setFilters(defaultFilters);
          }}
        />

        <div className="relative flex-1">
          <GraphCanvas
            nodes={flowNodes}
            edges={flowEdges}
            fitViewNodeIds={fitViewNodeIds}
            showingFullMap={filters.showFullTree}
            onResetFocus={() =>
              setFilters((current) => ({
                ...current,
                showFullTree: false,
                focusMode: true,
              }))
            }
            onViewFullMap={() =>
              setFilters((current) => ({
                ...current,
                showFullTree: true,
              }))
            }
          >
            <div className="pointer-events-none absolute left-3 top-3 z-20 hidden md:block">
              <div className="pointer-events-auto">
                <LegendPanel />
              </div>
            </div>
          </GraphCanvas>
        </div>
      </div>

      {hoverPreview && hoverPayload ? (
        <PeopleHoverCard
          title={hoverPayload.title}
          subtitle={hoverPayload.subtitle}
          people={hoverPayload.people}
          countLabel={hoverPayload.countLabel}
          point={hoverPreview.point}
          viewport={viewportSize}
          onInspect={() => {
            if (!hoverPreview) {
              return;
            }

            setInspectState({
              kind: hoverPreview.kind,
              id: hoverPreview.id,
            });
            setHoverPreview(null);
          }}
          contextAction={
            hoverPayload.contextActionLabel && hoverPayload.onContextAction
              ? {
                  label: hoverPayload.contextActionLabel,
                  onClick: hoverPayload.onContextAction,
                }
              : undefined
          }
          onMouseEnter={clearHoverCloseTimeout}
          onMouseLeave={() => setHoverPreview(null)}
        />
      ) : null}

      <PeopleDrawer
        title={inspectPayload?.title}
        subtitle={inspectPayload?.subtitle}
        people={inspectPayload?.people}
        contextActionLabel={inspectPayload?.contextActionLabel}
        onContextAction={inspectPayload?.onContextAction}
        open={Boolean(inspectPayload)}
        onClose={() => setInspectState(null)}
      />
    </div>
  );
}
