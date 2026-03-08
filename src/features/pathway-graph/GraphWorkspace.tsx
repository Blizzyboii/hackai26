"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Position } from "@xyflow/react";
import { ControlRail } from "./ControlRail";
import { PathwayEdge } from "./EdgeRenderer";
import { GraphCanvas } from "./GraphCanvas";
import { loadGraphDataset } from "./data/graphApi";
import { deriveGraphOptions } from "./data/graphOptions";
import { defaultFilters, defaultStudentProfile, mockGraph } from "./data/mockGraph";
import { LegendPanel } from "./LegendPanel";
import { PathwayNode } from "./NodeRenderer";
import { PeopleDrawer } from "./PeopleDrawer";
import { PeopleHoverCard } from "./PeopleHoverCard";
import { buildVisibilityState } from "./logic/filtering";
import { buildNodePositions } from "./logic/layout";
import { buildPathSet, getEdgeBaseConfidence } from "./logic/pathfinding";
import {
  FilterState,
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  PathCandidate,
  Person,
  StudentProfile,
} from "./types";

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

function edgeDetailPayload(edge: GraphEdgeData, nodeById: Map<string, GraphNodeData>): DetailPayload {
  const sourceLabel = nodeById.get(edge.source)?.label ?? edge.source;
  const targetLabel = nodeById.get(edge.target)?.label ?? edge.target;

  let people = edge.people;

  if (people.length === 0 && edge.edgeKind === "cross_club") {
    people = uniquePeople([...(nodeById.get(edge.source)?.people ?? []), ...(nodeById.get(edge.target)?.people ?? [])]);
  }

  return {
    title: `${sourceLabel} → ${targetLabel}`,
    subtitle: edge.relationLabel ?? edge.edgeKind,
    people,
    countLabel: `${edge.weight} weighted alumni`,
  };
}

function getDisplayedPaths(
  pathSet: { primary: PathCandidate | null; secondary: PathCandidate[]; all: PathCandidate[] },
  activePathId: string | null,
) {
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

function normalizeTargetCompanies(companyIds: string[]) {
  return Array.from(new Set(companyIds));
}

function sameStringArray(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function GraphWorkspace() {
  const [graph, setGraph] = useState<GraphDataset>(mockGraph);
  const [graphWarning, setGraphWarning] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);

  const [profile, setProfile] = useState<StudentProfile>(defaultStudentProfile);
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...defaultFilters,
    targetCompany: defaultStudentProfile.activeTargetCompany,
  }));
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const [inspectState, setInspectState] = useState<InspectState | null>(null);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1280, height: 720 });
  const hoverCloseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    loadGraphDataset(controller.signal).then((result) => {
      if (cancelled) {
        return;
      }

      const nextOptions = deriveGraphOptions(result.graph);
      const nextValidCompanyIds = new Set(nextOptions.companies.map((company) => company.id));
      const nextValidClubIds = new Set(nextOptions.clubs.map((club) => club.id));
      const nextPreferredTarget =
        defaultStudentProfile.activeTargetCompany && nextValidCompanyIds.has(defaultStudentProfile.activeTargetCompany)
          ? defaultStudentProfile.activeTargetCompany
          : nextOptions.companies[0]?.id ?? null;

      setGraph(result.graph);
      setGraphWarning(result.warning);
      setGraphLoading(false);

      setActivePathId(null);
      setProfile((current) => {
        let nextTargets = current.targetCompanies.filter((companyId) => nextValidCompanyIds.has(companyId));
        if (nextTargets.length === 0 && nextPreferredTarget) {
          nextTargets = [nextPreferredTarget];
        }

        const nextActive =
          current.activeTargetCompany && nextTargets.includes(current.activeTargetCompany)
            ? current.activeTargetCompany
            : nextTargets[0] ?? null;

        if (sameStringArray(nextTargets, current.targetCompanies) && nextActive === current.activeTargetCompany) {
          return current;
        }

        return {
          ...current,
          targetCompanies: nextTargets,
          activeTargetCompany: nextActive,
        };
      });

      setFilters((current) => {
        const nextTarget =
          current.targetCompany && nextValidCompanyIds.has(current.targetCompany)
            ? current.targetCompany
            : nextPreferredTarget;

        const nextEliminated = current.eliminatedClubIds.filter((clubId) => nextValidClubIds.has(clubId));

        if (nextTarget === current.targetCompany && sameStringArray(nextEliminated, current.eliminatedClubIds)) {
          return current;
        }

        return {
          ...current,
          targetCompany: nextTarget,
          eliminatedClubIds: nextEliminated,
        };
      });
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const syncViewportSize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };

    syncViewportSize();
    window.addEventListener("resize", syncViewportSize);
    return () => window.removeEventListener("resize", syncViewportSize);
  }, []);

  useEffect(() => {
    return () => {
      if (hoverCloseTimeoutRef.current) {
        clearTimeout(hoverCloseTimeoutRef.current);
      }
    };
  }, []);

  const graphOptions = useMemo(() => deriveGraphOptions(graph), [graph]);

  const validCompanyIds = useMemo(() => new Set(graphOptions.companies.map((company) => company.id)), [graphOptions.companies]);

  const preferredDefaultTarget = useMemo(() => {
    if (
      defaultStudentProfile.activeTargetCompany &&
      validCompanyIds.has(defaultStudentProfile.activeTargetCompany)
    ) {
      return defaultStudentProfile.activeTargetCompany;
    }

    return graphOptions.companies[0]?.id ?? null;
  }, [graphOptions.companies, validCompanyIds]);

  const nodePositions = useMemo(() => buildNodePositions(graph), [graph]);

  const nodeById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node])), [graph]);

  const edgeById = useMemo(() => new Map(graph.edges.map((edge) => [edge.id, edge])), [graph]);

  const nodeLabelById = useMemo(() => new Map(graph.nodes.map((node) => [node.id, node.label])), [graph]);

  const pathResult = useMemo(() => buildPathSet(graph, filters, profile), [graph, filters, profile]);

  const displayedPaths = useMemo(
    () => getDisplayedPaths(pathResult.pathSet, activePathId),
    [pathResult.pathSet, activePathId],
  );

  const visibilityState = useMemo(
    () =>
      buildVisibilityState({
        graph,
        filters,
        pathSet: {
          primary: displayedPaths.primary,
          secondary: displayedPaths.secondary,
        },
        traversableNodeIds: pathResult.traversableNodeIds,
        traversableEdgeIds: pathResult.traversableEdgeIds,
      }),
    [
      displayedPaths.primary,
      displayedPaths.secondary,
      filters,
      graph,
      pathResult.traversableEdgeIds,
      pathResult.traversableNodeIds,
    ],
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
    return graph.nodes.map((node) => {
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
  }, [graph, handleHover, handleHoverLeave, nodePositions, visibilityState.nodeVisibility]);

  const flowEdges = useMemo<PathwayEdge[]>(() => {
    return graph.edges.map((edge) => {
      const visibility = visibilityState.edgeVisibility[edge.id];

      return {
        id: edge.id,
        type: "pathwayEdge",
        source: edge.source,
        target: edge.target,
        selectable: false,
        data: {
          ...edge,
          confidence: getEdgeBaseConfidence(edge),
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
  }, [graph, handleHover, handleHoverLeave, visibilityState.edgeVisibility]);

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
      return graph.nodes.map((node) => node.id);
    }

    const relevant = Array.from(visibilityState.relevantNodeIds);
    return relevant.length > 0 ? relevant : graph.nodes.map((node) => node.id);
  }, [filters.showFullTree, graph.nodes, visibilityState.relevantNodeIds]);

  const noRouteReason = displayedPaths.primary
    ? null
    : pathResult.pathSet.reason ?? "No route found for current filters.";

  const pathDescriptions = useMemo(() => {
    const output: Record<string, string> = {};

    for (const path of displayedPaths.all) {
      output[path.id] = path.nodeIds.map((nodeId) => nodeLabelById.get(nodeId) ?? nodeId).join(" -> ");
    }

    return output;
  }, [displayedPaths.all, nodeLabelById]);

  const companyOutlook = useMemo(() => {
    const uniqueTargets = normalizeTargetCompanies(profile.targetCompanies);

    return uniqueTargets.map((companyId) => {
      const targetPathResult = buildPathSet(
        graph,
        {
          ...filters,
          targetCompany: companyId,
          showFullTree: false,
        },
        profile,
      );

      return {
        companyId,
        label: nodeLabelById.get(companyId) ?? companyId,
        confidence: targetPathResult.pathSet.primary?.confidence ?? null,
        hasRoute: Boolean(targetPathResult.pathSet.primary),
      };
    });
  }, [filters, graph, nodeLabelById, profile]);

  return (
    <div className="h-screen w-full overflow-hidden bg-[#0a0a0a] text-slate-100">
      {graphLoading || graphWarning ? (
        <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-lg border border-amber-300/50 bg-amber-500/15 px-3 py-2 text-xs text-amber-100">
          {graphLoading ? "Loading live backend graph..." : graphWarning}
        </div>
      ) : null}

      <div className="flex h-full">
        <ControlRail
          filters={filters}
          profile={profile}
          tags={graphOptions.tags}
          clubs={graphOptions.clubs}
          activities={graphOptions.activities}
          companies={graphOptions.companies}
          companyOutlook={companyOutlook}
          primaryPath={displayedPaths.primary}
          secondaryPaths={displayedPaths.secondary}
          pathDescriptions={pathDescriptions}
          activePathId={activePathId}
          noRouteReason={noRouteReason}
          mobileOpen={mobileRailOpen}
          onMobileOpenChange={setMobileRailOpen}
          onTargetCompaniesChange={(companyIds) => {
            setActivePathId(null);
            const nextTargets = normalizeTargetCompanies(companyIds).filter((id) => validCompanyIds.has(id));
            const nextActive =
              profile.activeTargetCompany && nextTargets.includes(profile.activeTargetCompany)
                ? profile.activeTargetCompany
                : nextTargets[0] ?? null;

            setProfile((current) => ({
              ...current,
              targetCompanies: nextTargets,
              activeTargetCompany: nextActive,
            }));

            setFilters((current) => ({
              ...current,
              targetCompany: nextActive,
              showFullTree: false,
              focusMode: nextActive ? current.focusMode : false,
            }));
          }}
          onActiveTargetChange={(targetCompany) => {
            setActivePathId(null);
            const resolvedTarget = targetCompany && validCompanyIds.has(targetCompany) ? targetCompany : null;

            setProfile((current) => {
              const nextTargets = resolvedTarget
                ? normalizeTargetCompanies([...current.targetCompanies, resolvedTarget])
                : current.targetCompanies;

              return {
                ...current,
                targetCompanies: nextTargets,
                activeTargetCompany: resolvedTarget,
              };
            });

            setFilters((current) => ({
              ...current,
              targetCompany: resolvedTarget,
              showFullTree: false,
              focusMode: resolvedTarget ? current.focusMode : false,
            }));
          }}
          onGraduationTermChange={(term) =>
            setProfile((current) => ({
              ...current,
              graduationTerm: term,
            }))
          }
          onGraduationYearChange={(year) =>
            setProfile((current) => ({
              ...current,
              graduationYear: Number.isFinite(year) ? year : current.graduationYear,
            }))
          }
          onSemestersRemainingChange={(value) =>
            setProfile((current) => ({
              ...current,
              semestersRemaining: Math.max(1, Math.min(10, value)),
            }))
          }
          onCompletedNodesChange={(nodeIds) =>
            setProfile((current) => ({
              ...current,
              completedNodeIds: normalizeTargetCompanies(nodeIds),
            }))
          }
          onCompletedCourseCountChange={(value) =>
            setProfile((current) => ({
              ...current,
              completedCourseCount: Math.max(0, value),
            }))
          }
          onCompletedResearchCountChange={(value) =>
            setProfile((current) => ({
              ...current,
              completedResearchCount: Math.max(0, value),
            }))
          }
          onCompletedExtracurricularCountChange={(value) =>
            setProfile((current) => ({
              ...current,
              completedExtracurricularCount: Math.max(0, value),
            }))
          }
          onRiskToleranceChange={(risk) =>
            setProfile((current) => ({
              ...current,
              riskTolerance: risk,
            }))
          }
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

            const resetTargets = defaultStudentProfile.targetCompanies.filter((id) => validCompanyIds.has(id));
            const nextTargets = resetTargets.length > 0 ? resetTargets : preferredDefaultTarget ? [preferredDefaultTarget] : [];
            const nextActive =
              defaultStudentProfile.activeTargetCompany && nextTargets.includes(defaultStudentProfile.activeTargetCompany)
                ? defaultStudentProfile.activeTargetCompany
                : nextTargets[0] ?? null;

            setProfile({
              ...defaultStudentProfile,
              targetCompanies: nextTargets,
              activeTargetCompany: nextActive,
            });

            setFilters({
              ...defaultFilters,
              targetCompany: nextActive,
            });
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
