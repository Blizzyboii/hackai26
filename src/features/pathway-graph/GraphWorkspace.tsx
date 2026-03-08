"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Position } from "@xyflow/react";
import { ControlRail } from "./ControlRail";
import { PathwayEdge } from "./EdgeRenderer";
import { GraphCanvas } from "./GraphCanvas";
import { loadGraphDataset } from "./data/graphApi";
import { deriveGraphOptions } from "./data/graphOptions";
import { defaultFilters, defaultStudentProfile, mockGraph } from "./data/mockGraph";
import { loadPathRecommendations } from "./data/recommendationApi";
import { LegendPanel } from "./LegendPanel";
import { PathwayNode } from "./NodeRenderer";
import { PeopleDrawer } from "./PeopleDrawer";
import { PeopleHoverCard } from "./PeopleHoverCard";
import { buildVisibilityState } from "./logic/filtering";
import { buildNodePositions } from "./logic/layout";
import { buildPathSet, getEdgeBaseConfidence } from "./logic/pathfinding";
import {
  CompanyOutlook,
  EdgeAnalysis,
  FilterState,
  GraphDataset,
  GraphEdgeData,
  GraphNodeData,
  PathCandidate,
  Person,
  RecommendationResult,
  ScenarioAnalysis,
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
  detailLines?: string[];
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
  edgeAnalysis?: EdgeAnalysis,
): DetailPayload {
  const sourceLabel = nodeById.get(edge.source)?.label ?? edge.source;
  const targetLabel = nodeById.get(edge.target)?.label ?? edge.target;

  let people = edge.people;

  if (people.length === 0 && edge.edgeKind === "cross_club") {
    people = uniquePeople([...(nodeById.get(edge.source)?.people ?? []), ...(nodeById.get(edge.target)?.people ?? [])]);
  }

  if (people.length === 0 && edge.edgeKind === "club_to_company") {
    const sourcePeople = nodeById.get(edge.source)?.people ?? [];
    const targetCompany = (nodeById.get(edge.target)?.label ?? "").toLowerCase();
    people = sourcePeople.filter((person) => person.company.toLowerCase() === targetCompany);
  }

  return {
    title: `${sourceLabel} → ${targetLabel}`,
    subtitle: edge.relationLabel ?? edge.edgeKind,
    people,
    countLabel: `${edge.weight} weighted alumni`,
    detailLines: edgeAnalysis
      ? [
        `Direct evidence ${Math.round(edgeAnalysis.directEvidence * 100)}%`,
        `Transferability ${Math.round(edgeAnalysis.transferability * 100)}%`,
        `Dominant signal ${edgeAnalysis.dominantReason}`,
      ]
      : undefined,
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

function compareScoreBreakdowns(
  baseline: PathCandidate | null,
  counterfactual: PathCandidate | null,
): ScenarioAnalysis["scoreDelta"] {
  return {
    overall: (counterfactual?.scoreBreakdown.overall ?? 0) - (baseline?.scoreBreakdown.overall ?? 0),
    directEvidence:
      (counterfactual?.scoreBreakdown.directEvidence ?? 0) - (baseline?.scoreBreakdown.directEvidence ?? 0),
    transferability:
      (counterfactual?.scoreBreakdown.transferability ?? 0) - (baseline?.scoreBreakdown.transferability ?? 0),
    fit: (counterfactual?.scoreBreakdown.fit ?? 0) - (baseline?.scoreBreakdown.fit ?? 0),
  };
}

export function GraphWorkspace() {
  const [graph, setGraph] = useState<GraphDataset>(mockGraph);
  const [graphWarning, setGraphWarning] = useState<string | null>(null);
  const [graphLoading, setGraphLoading] = useState(true);
  const [recommendationState, setRecommendationState] = useState<{
    requestKey: string;
    result: RecommendationResult | null;
    warning: string | null;
  } | null>(null);

  const [profile, setProfile] = useState<StudentProfile>(defaultStudentProfile);
  const [filters, setFilters] = useState<FilterState>(() => ({
    ...defaultFilters,
    targetCompany: defaultStudentProfile.activeTargetCompany,
  }));
  const [mobileRailOpen, setMobileRailOpen] = useState(false);
  const [hoverPreview, setHoverPreview] = useState<HoverPreviewState | null>(null);
  const [inspectState, setInspectState] = useState<InspectState | null>(null);
  const [activePathId, setActivePathId] = useState<string | null>(null);
  const [selectedScenarioClubId, setSelectedScenarioClubId] = useState<string | null>(null);
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

  const fallbackPathResult = useMemo(() => buildPathSet(graph, filters, profile), [graph, filters, profile]);

  const fallbackCompanyOutlook = useMemo<CompanyOutlook[]>(() => {
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

  const fallbackScenarioAnalysis = useMemo<ScenarioAnalysis | null>(() => {
    if (!selectedScenarioClubId) {
      return null;
    }

    const scenarioFilters = {
      ...filters,
      eliminatedClubIds: filters.eliminatedClubIds.includes(selectedScenarioClubId)
        ? filters.eliminatedClubIds
        : [...filters.eliminatedClubIds, selectedScenarioClubId],
    };
    const counterfactual = buildPathSet(graph, scenarioFilters, profile);
    const counterfactualPrimary = counterfactual.pathSet.primary;
    const deltas = compareScoreBreakdowns(fallbackPathResult.pathSet.primary, counterfactualPrimary);
    const excludedClubLabel = nodeLabelById.get(selectedScenarioClubId) ?? selectedScenarioClubId;
    const counterfactualLabel = counterfactualPrimary
      ? counterfactualPrimary.nodeIds.map((nodeId) => nodeLabelById.get(nodeId) ?? nodeId).join(" -> ")
      : null;

    return {
      excludedClubId: selectedScenarioClubId,
      excludedClubLabel,
      baselinePath: fallbackPathResult.pathSet.primary,
      counterfactualPath: counterfactualPrimary,
      scoreDelta: deltas,
      summary: counterfactualLabel
        ? `If ${excludedClubLabel} is removed, the strongest route shifts to ${counterfactualLabel}, losing ${Math.round(
          Math.abs(Math.min(deltas.directEvidence, 0)) * 100,
        )}% direct evidence and ${Math.round(Math.abs(Math.min(deltas.fit, 0)) * 100)}% fit.`
        : `If ${excludedClubLabel} is removed, there is no same-target backup route under the current filters.`,
    };
  }, [fallbackPathResult.pathSet.primary, filters, graph, nodeLabelById, profile, selectedScenarioClubId]);

  const recommendationRequestKey = useMemo(
    () =>
      JSON.stringify({
        filters,
        profile,
        scenarioClubId: selectedScenarioClubId,
      }),
    [filters, profile, selectedScenarioClubId],
  );

  useEffect(() => {
    if (graphLoading) {
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    loadPathRecommendations(
      {
        filters,
        profile,
        topK: 4,
        scenarioClubId: selectedScenarioClubId,
      },
      controller.signal,
    )
      .then((result) => {
        if (cancelled) {
          return;
        }

        setRecommendationState({
          requestKey: recommendationRequestKey,
          result,
          warning:
            result.modelMeta?.mode === "heuristic"
              ? result.modelMeta.reason ?? "Backend recommender is using heuristic mode."
              : null,
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setRecommendationState({
          requestKey: recommendationRequestKey,
          result: null,
          warning: "Recommendation service unavailable. Using local heuristic ranking.",
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [filters, graphLoading, profile, recommendationRequestKey, selectedScenarioClubId]);

  const currentRecommendationState =
    recommendationState?.requestKey === recommendationRequestKey ? recommendationState : null;

  const recommendation = useMemo<RecommendationResult>(
    () =>
      currentRecommendationState?.result ?? {
        pathSet: fallbackPathResult.pathSet,
        traversableNodeIds: fallbackPathResult.traversableNodeIds,
        traversableEdgeIds: fallbackPathResult.traversableEdgeIds,
        companyOutlook: fallbackCompanyOutlook,
        edgeAnalysis: {},
        scenarioAnalysis: fallbackScenarioAnalysis,
        modelMeta: null,
      },
    [
      currentRecommendationState?.result,
      fallbackCompanyOutlook,
      fallbackScenarioAnalysis,
      fallbackPathResult.pathSet,
      fallbackPathResult.traversableEdgeIds,
      fallbackPathResult.traversableNodeIds,
    ],
  );

  const displayedPaths = useMemo(
    () => getDisplayedPaths(recommendation.pathSet, activePathId),
    [recommendation.pathSet, activePathId],
  );

  const scenarioClubOptions = useMemo(() => {
    const primary = displayedPaths.primary;
    if (!primary) {
      return [];
    }

    const clubIds = new Set<string>();
    primary.nodeIds.forEach((nodeId) => {
      const node = nodeById.get(nodeId);
      if (node?.type === "club") {
        clubIds.add(node.id);
      } else if (node?.type === "subprogram" && node.parentClubId) {
        clubIds.add(node.parentClubId);
      }
    });

    return Array.from(clubIds).map((clubId) => ({
      id: clubId,
      label: nodeLabelById.get(clubId) ?? clubId,
    }));
  }, [displayedPaths.primary, nodeById, nodeLabelById]);

  const resolvedScenarioClubId =
    selectedScenarioClubId && scenarioClubOptions.some((club) => club.id === selectedScenarioClubId)
      ? selectedScenarioClubId
      : null;

  const visibilityState = useMemo(
    () =>
      buildVisibilityState({
        graph,
        filters,
        pathSet: {
          primary: displayedPaths.primary,
          secondary: displayedPaths.secondary,
        },
        traversableNodeIds: recommendation.traversableNodeIds,
        traversableEdgeIds: recommendation.traversableEdgeIds,
      }),
    [
      displayedPaths.primary,
      displayedPaths.secondary,
      filters,
      graph,
      recommendation.traversableEdgeIds,
      recommendation.traversableNodeIds,
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
    }, 250);
  }, [clearHoverCloseTimeout]);

  const toggleEliminatedClub = useCallback((clubId: string) => {
    setSelectedScenarioClubId((current) => (current === clubId ? null : current));
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
          edgeAnalysis: recommendation.edgeAnalysis[edge.id],
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
  }, [graph, handleHover, handleHoverLeave, recommendation.edgeAnalysis, visibilityState.edgeVisibility]);

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

    return edgeDetailPayload(edge, nodeById, recommendation.edgeAnalysis[edge.id]);
  }, [edgeById, filters, hoverPreview, nodeById, recommendation.edgeAnalysis, toggleEliminatedClub]);

  const inspectPayload = useMemo(() => {
    if (!inspectState) {
      return null;
    }

    if (inspectState.kind === "node") {
      const node = nodeById.get(inspectState.id);
      return node ? nodeDetailPayload(node, filters, toggleEliminatedClub) : null;
    }

    const edge = edgeById.get(inspectState.id);
    return edge ? edgeDetailPayload(edge, nodeById, recommendation.edgeAnalysis[edge.id]) : null;
  }, [edgeById, filters, inspectState, nodeById, recommendation.edgeAnalysis, toggleEliminatedClub]);

  const fitViewNodeIds = useMemo(() => {
    if (filters.showFullTree) {
      return graph.nodes.map((node) => node.id);
    }

    const relevant = Array.from(visibilityState.relevantNodeIds);
    return relevant.length > 0 ? relevant : graph.nodes.map((node) => node.id);
  }, [filters.showFullTree, graph.nodes, visibilityState.relevantNodeIds]);

  const noRouteReason = displayedPaths.primary
    ? null
    : recommendation.pathSet.reason ?? "No route found for current filters.";

  const pathDescriptions = useMemo(() => {
    const output: Record<string, string> = {};

    for (const path of displayedPaths.all) {
      output[path.id] = path.nodeIds.map((nodeId) => nodeLabelById.get(nodeId) ?? nodeId).join(" -> ");
    }

    return output;
  }, [displayedPaths.all, nodeLabelById]);

  const companyOutlook = currentRecommendationState?.result?.companyOutlook ?? fallbackCompanyOutlook;

  const bannerMessage = graphLoading
    ? "Loading live backend graph..."
    : graphWarning ?? currentRecommendationState?.warning ?? null;

  return (
    <div className="h-screen w-full overflow-hidden bg-[#0a0a0a] text-slate-100">
      {bannerMessage ? (
        <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2 rounded-lg border border-amber-300/50 bg-amber-500/15 px-3 py-2 text-xs text-amber-100">
          {bannerMessage}
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
          scenarioAnalysis={recommendation.scenarioAnalysis ?? fallbackScenarioAnalysis}
          scenarioClubOptions={scenarioClubOptions}
          selectedScenarioClubId={resolvedScenarioClubId}
          noRouteReason={noRouteReason}
          mobileOpen={mobileRailOpen}
          onMobileOpenChange={setMobileRailOpen}
          onTargetCompaniesChange={(companyIds) => {
            setActivePathId(null);
            setSelectedScenarioClubId(null);
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
            setSelectedScenarioClubId(null);
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
            setSelectedScenarioClubId(null);
            setFilters((current) => ({
              ...current,
              includeTags,
              excludeTags: current.excludeTags.filter((tag) => !includeTags.includes(tag)),
              showFullTree: false,
            }));
          }}
          onExcludeTagsChange={(excludeTags) => {
            setActivePathId(null);
            setSelectedScenarioClubId(null);
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
          onScenarioClubChange={setSelectedScenarioClubId}
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
          onToggleClubBridges={() => {
            setSelectedScenarioClubId(null);
            setFilters((current) => ({
              ...current,
              includeClubBridges: !current.includeClubBridges,
              showFullTree: false,
            }));
          }
          }
          onClearFilters={() => {
            setActivePathId(null);
            setSelectedScenarioClubId(null);

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
          detailLines={hoverPayload.detailLines}
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
        detailLines={inspectPayload?.detailLines}
        contextActionLabel={inspectPayload?.contextActionLabel}
        onContextAction={inspectPayload?.onContextAction}
        open={Boolean(inspectPayload)}
        onClose={() => setInspectState(null)}
      />
    </div>
  );
}
