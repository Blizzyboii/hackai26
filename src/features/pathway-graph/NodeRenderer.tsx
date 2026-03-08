"use client";

import { Handle, Node, NodeProps, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { GraphNodeData } from "./types";

export interface PathwayNodeViewData extends GraphNodeData {
  isDimmed: boolean;
  isOnPrimary: boolean;
  isOnSecondary: boolean;
  isTarget: boolean;
  isEliminated: boolean;
  onHoverNode: (nodeId: string, point: { x: number; y: number }) => void;
  onLeaveNode: () => void;
  onInspectNode: (nodeId: string) => void;
}

export type PathwayNode = Node<PathwayNodeViewData, "pathwayNode">;

/* ── Gradient + glow palettes per category ── */

const categoryGradients: Record<string, string> = {
  technology:
    "bg-gradient-to-br from-cyan-600/90 to-cyan-800/90 border-cyan-400/50",
  "academic interest":
    "bg-gradient-to-br from-blue-600/90 to-blue-800/90 border-blue-400/50",
  finance:
    "bg-gradient-to-br from-emerald-600/90 to-emerald-800/90 border-emerald-400/50",
  "professional development":
    "bg-gradient-to-br from-violet-600/90 to-violet-800/90 border-violet-400/50",
  "hobbies & special interests":
    "bg-gradient-to-br from-orange-500/90 to-orange-700/90 border-orange-300/50",
};

const categoryShadows: Record<string, string> = {
  technology: "shadow-[0_0_20px_rgba(6,182,212,0.25)]",
  "academic interest": "shadow-[0_0_20px_rgba(59,130,246,0.25)]",
  finance: "shadow-[0_0_20px_rgba(16,185,129,0.25)]",
  "professional development": "shadow-[0_0_20px_rgba(139,92,246,0.25)]",
  "hobbies & special interests": "shadow-[0_0_20px_rgba(249,115,22,0.25)]",
};

function nodeShapeClass(data: PathwayNodeViewData) {
  if (data.type === "company") {
    return "h-[4.5rem] w-[7rem] rounded-2xl text-xs";
  }

  if (data.type === "subprogram") {
    return "h-[3.5rem] w-[3.5rem] rounded-full text-[10px]";
  }

  if (data.type === "root") {
    return "h-28 w-28 rounded-full text-base";
  }

  // club
  return "h-[6.5rem] w-[6.5rem] rounded-full text-sm";
}

function nodePalette(data: PathwayNodeViewData) {
  if (data.type === "root") {
    return "bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 border-sky-400/60";
  }

  if (data.type === "company") {
    return "glass-light border-slate-500/40 text-slate-100";
  }

  if (data.type === "subprogram") {
    return "bg-gradient-to-br from-slate-700/90 to-slate-800/90 border-slate-500/40 text-slate-200";
  }

  return (
    categoryGradients[data.categoryTag ?? ""] ??
    "bg-gradient-to-br from-cyan-600/90 to-cyan-800/90 border-cyan-400/50"
  );
}

function nodeGlow(data: PathwayNodeViewData) {
  if (data.type === "root") {
    return "shadow-[0_0_30px_rgba(56,189,248,0.3)]";
  }

  if (data.type === "company") {
    return "shadow-[0_4px_20px_rgba(0,0,0,0.4)]";
  }

  return (
    categoryShadows[data.categoryTag ?? ""] ??
    "shadow-[0_0_20px_rgba(6,182,212,0.25)]"
  );
}

export function NodeRenderer({ data }: NodeProps<PathwayNode>) {
  return (
    <div className="relative nodrag nopan group">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />

      {/* Orbit ring for root node */}
      {data.type === "root" ? (
        <div className="absolute inset-[-10px] rounded-full border border-sky-400/20 animate-orbit pointer-events-none">
          <div className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-sky-400/60" />
        </div>
      ) : null}

      <button
        type="button"
        onMouseEnter={(event) => {
          data.onHoverNode(data.id, { x: event.clientX, y: event.clientY });
        }}
        onMouseMove={(event) => {
          data.onHoverNode(data.id, { x: event.clientX, y: event.clientY });
        }}
        onMouseLeave={data.onLeaveNode}
        onClick={() => data.onInspectNode(data.id)}
        className={cn(
          "relative grid place-items-center border-[1.5px] px-2 text-center font-semibold transition-all duration-300 ease-out",
          "hover:scale-110 hover:brightness-110",
          "backdrop-blur-sm",
          nodeShapeClass(data),
          nodePalette(data),
          nodeGlow(data),
          data.isOnPrimary && "animate-glow-ring",
          data.isOnSecondary &&
          "ring-2 ring-amber-300/60 shadow-[0_0_16px_rgba(251,191,36,0.2)]",
          data.isTarget && "animate-target-ring",
          data.isDimmed && "opacity-20 hover:opacity-50",
          data.isEliminated && "opacity-40",
        )}
      >
        <span className="leading-tight drop-shadow-sm">{data.label}</span>

        {/* Logo badge */}
        {data.logo ? (
          <span className="pointer-events-none absolute -bottom-2.5 rounded-full bg-slate-950/80 px-2 py-0.5 text-[9px] font-semibold tracking-wider text-slate-300 backdrop-blur-sm border border-slate-700/50">
            {data.logo}
          </span>
        ) : null}

        {/* Member count pill */}
        {data.memberCount ? (
          <span className="pointer-events-none absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full border border-slate-600/50 bg-slate-900/90 text-[10px] font-bold text-cyan-300 shadow-lg backdrop-blur-sm">
            {data.memberCount}
          </span>
        ) : null}

        {/* Eliminated overlay */}
        {data.isEliminated ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-[inherit] bg-slate-950/50 backdrop-blur-[2px]">
            <span className="text-2xl font-bold text-rose-400 drop-shadow-lg">
              ×
            </span>
          </span>
        ) : null}
      </button>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />
    </div>
  );
}
