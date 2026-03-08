"use client";

import {
  BaseEdge,
  Edge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import { GraphEdgeData } from "./types";

export interface PathwayEdgeViewData extends GraphEdgeData {
  isDimmed: boolean;
  isOnPrimary: boolean;
  isOnSecondary: boolean;
  onHover: (edgeId: string, point: { x: number; y: number }) => void;
  onLeave: () => void;
  onInspect: (edgeId: string) => void;
}

export type PathwayEdge = Edge<PathwayEdgeViewData, "pathwayEdge">;

function edgeVisual(edge: PathwayEdgeViewData) {
  const base = {
    stroke: "#6b7280",
    strokeWidth: 1.8,
    strokeDasharray: "",
    opacity: edge.isDimmed ? 0.2 : 0.85,
  };

  if (edge.edgeKind === "club_to_company") {
    base.stroke = "#06b6d4";
    base.strokeDasharray = "5 7";
    base.strokeWidth = 1.8 + edge.weight * 0.55;
  }

  if (edge.edgeKind === "club_to_subprogram" || edge.edgeKind === "root_to_club") {
    base.stroke = "#94a3b8";
    base.strokeWidth = 2.1;
  }

  if (edge.edgeKind === "cross_club") {
    base.stroke = "#f59e0b";
    base.strokeDasharray = "2 8";
    base.strokeWidth = 1.6;
  }

  if (edge.isOnSecondary) {
    base.strokeWidth += 0.8;
    base.opacity = edge.isDimmed ? 0.28 : 0.8;
  }

  if (edge.isOnPrimary) {
    base.stroke = "#67e8f9";
    base.strokeWidth += 1.8;
    base.opacity = 1;
  }

  return base;
}

function curveForEdge(edge: PathwayEdgeViewData) {
  if (edge.edgeKind === "cross_club") {
    return 0.17;
  }

  return 0.25;
}

function edgeKindLabel(edge: PathwayEdgeViewData) {
  if (edge.edgeKind === "root_to_club") {
    return "Entry";
  }

  if (edge.edgeKind === "club_to_subprogram") {
    return "Program";
  }

  if (edge.edgeKind === "cross_club") {
    return "Bridge";
  }

  return "Career";
}

export function EdgeRenderer({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
}: EdgeProps<PathwayEdge>) {
  const edgeData = data as PathwayEdgeViewData | undefined;

  if (!edgeData) {
    return null;
  }

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    curvature: curveForEdge(edgeData),
  });

  const visual = edgeVisual(edgeData);
  const confidencePercent = Math.round((edgeData.confidence ?? 0.5) * 100);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: visual.stroke,
          strokeWidth: visual.strokeWidth,
          strokeDasharray: visual.strokeDasharray,
          opacity: visual.opacity,
          transition: "all 260ms ease",
        }}
      />
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="cursor-pointer"
        onMouseEnter={(event) => {
          edgeData.onHover(id, { x: event.clientX, y: event.clientY });
        }}
        onMouseMove={(event) => {
          edgeData.onHover(id, { x: event.clientX, y: event.clientY });
        }}
        onMouseLeave={edgeData.onLeave}
        onClick={() => {
          edgeData.onInspect(id);
        }}
      />
      {edgeData.edgeKind === "club_to_company" ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/60 bg-slate-950 px-2 py-1 text-[11px] font-semibold text-cyan-100 shadow"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              opacity: edgeData.isDimmed ? 0.32 : 0.95,
            }}
            onMouseEnter={(event) => {
              edgeData.onHover(id, { x: event.clientX, y: event.clientY });
            }}
            onMouseMove={(event) => {
              edgeData.onHover(id, { x: event.clientX, y: event.clientY });
            }}
            onMouseLeave={edgeData.onLeave}
            onClick={() => {
              edgeData.onInspect(id);
            }}
            aria-label={`Inspect route ${edgeData.source} to ${edgeData.target}`}
          >
            {edgeData.weight} alumni · {confidencePercent}%
          </button>
        </EdgeLabelRenderer>
      ) : (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="nodrag nopan absolute -translate-x-1/2 -translate-y-1/2 rounded-md border border-slate-600 bg-slate-950 px-1.5 py-0.5 text-[10px] font-semibold text-slate-200 shadow"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              opacity: edgeData.isDimmed ? 0.22 : 0.9,
            }}
            onMouseEnter={(event) => {
              edgeData.onHover(id, { x: event.clientX, y: event.clientY });
            }}
            onMouseMove={(event) => {
              edgeData.onHover(id, { x: event.clientX, y: event.clientY });
            }}
            onMouseLeave={edgeData.onLeave}
            onClick={() => {
              edgeData.onInspect(id);
            }}
            aria-label={`Inspect ${edgeKindLabel(edgeData)} edge ${edgeData.source} to ${edgeData.target}`}
          >
            {edgeKindLabel(edgeData)} · {confidencePercent}%
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
