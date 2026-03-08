"use client";

import {
  BaseEdge,
  Edge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from "@xyflow/react";
import { EdgeAnalysis, GraphEdgeData } from "./types";

export interface PathwayEdgeViewData extends GraphEdgeData {
  edgeAnalysis?: EdgeAnalysis;
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
    stroke: "#475569",
    strokeWidth: 1.6,
    strokeDasharray: "",
    opacity: edge.isDimmed ? 0.12 : 0.7,
  };

  if (edge.edgeKind === "club_to_company") {
    base.stroke = "#06b6d4";
    base.strokeDasharray = "6 8";
    base.strokeWidth = 1.6 + edge.weight * 0.5;
  }

  if (
    edge.edgeKind === "club_to_subprogram" ||
    edge.edgeKind === "root_to_club"
  ) {
    base.stroke = "#64748b";
    base.strokeWidth = 1.8;
  }

  if (edge.edgeKind === "cross_club") {
    base.stroke = "#f59e0b";
    base.strokeDasharray = "3 9";
    base.strokeWidth = 1.4;
  }

  if (edge.isOnSecondary) {
    base.strokeWidth += 0.6;
    base.opacity = edge.isDimmed ? 0.2 : 0.65;
    base.stroke = "#fbbf24";
  }

  if (edge.isOnPrimary) {
    base.stroke = "#22d3ee";
    base.strokeWidth += 1.6;
    base.opacity = 1;
    base.strokeDasharray = edge.edgeKind === "club_to_company" ? "8 6" : "";
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
  const dominantReason = edge.edgeAnalysis?.dominantReason;

  if (dominantReason === "directEvidence") {
    return "Direct";
  }

  if (dominantReason === "transferability") {
    return "Transfer";
  }

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

function shouldShowLabel(edge: PathwayEdgeViewData) {
  // Always show labels for primary/secondary path edges and company edges
  if (edge.isOnPrimary || edge.isOnSecondary) return true;
  if (edge.edgeKind === "club_to_company") return true;
  // Hide other edge labels to reduce clutter — they appear on hover
  return false;
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
  const dominantReason = edgeKindLabel(edgeData);
  const dominantPercent =
    edgeData.edgeAnalysis?.dominantReason === "transferability"
      ? Math.round((edgeData.edgeAnalysis.transferability ?? 0) * 100)
      : Math.round((edgeData.edgeAnalysis?.directEvidence ?? 0) * 100);

  const showLabel = shouldShowLabel(edgeData);

  return (
    <>
      {/* Glow halo for primary edges */}
      {edgeData.isOnPrimary ? (
        <path
          d={edgePath}
          fill="none"
          stroke="#22d3ee"
          strokeWidth={visual.strokeWidth + 6}
          opacity={0.12}
          className="animate-edge-glow"
          style={{ filter: "blur(4px)" }}
        />
      ) : null}

      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: visual.stroke,
          strokeWidth: visual.strokeWidth,
          strokeDasharray: visual.strokeDasharray,
          opacity: visual.opacity,
          transition: "all 320ms ease",
          ...(edgeData.isOnPrimary && edgeData.edgeKind === "club_to_company"
            ? {
              strokeDashoffset: "0",
              animation: "edge-flow 1.6s linear infinite",
            }
            : {}),
        }}
      />

      {/* Wider invisible hit target for hover */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={32}
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

      {/* Edge label — only visible for highlighted/company edges */}
      <EdgeLabelRenderer>
        <button
          type="button"
          className={`nodrag nopan absolute -translate-x-1/2 -translate-y-1/2 rounded-full px-2.5 py-1 text-[10px] font-semibold shadow-lg transition-all duration-200 backdrop-blur-md
            ${edgeData.isOnPrimary
              ? "border border-cyan-400/50 bg-cyan-950/80 text-cyan-200"
              : edgeData.isOnSecondary
                ? "border border-amber-400/40 bg-amber-950/70 text-amber-200"
                : "border border-slate-600/40 bg-slate-900/80 text-slate-300"
            }
            ${showLabel ? "opacity-90" : "opacity-0 hover:opacity-90 pointer-events-none"}
          `}
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
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
          aria-label={`Inspect ${dominantReason} edge ${edgeData.source} to ${edgeData.target}`}
        >
          {edgeData.edgeKind === "club_to_company"
            ? `${edgeData.weight} alumni · ${dominantReason} ${dominantPercent || confidencePercent}%`
            : `${dominantReason} · ${(dominantPercent || confidencePercent) + "%"}`}
        </button>
      </EdgeLabelRenderer>
    </>
  );
}
