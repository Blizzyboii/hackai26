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

const categoryColorMap: Record<string, string> = {
  technology: "bg-cyan-600/95 border-cyan-300 text-cyan-50",
  "academic interest": "bg-blue-600/95 border-blue-300 text-blue-50",
  finance: "bg-emerald-600/95 border-emerald-300 text-emerald-50",
  "professional development": "bg-violet-600/95 border-violet-300 text-violet-50",
  "hobbies & special interests": "bg-orange-500/95 border-orange-200 text-orange-50",
};

function nodeShapeClass(data: PathwayNodeViewData) {
  if (data.type === "company") {
    return "h-[4.2rem] w-[6.3rem] rounded-2xl text-xs";
  }

  if (data.type === "subprogram") {
    return "h-14 w-14 rounded-full text-[11px]";
  }

  if (data.type === "club") {
    return "h-24 w-24 rounded-full text-sm";
  }

  return "h-24 w-24 rounded-full text-sm";
}

function nodePalette(data: PathwayNodeViewData) {
  if (data.type === "root") {
    return "border-sky-300 bg-slate-950 text-sky-100";
  }

  if (data.type === "company") {
    return "border-slate-400 bg-slate-200 text-slate-950";
  }

  if (data.type === "subprogram") {
    return "border-slate-400 bg-slate-700 text-slate-100";
  }

  return categoryColorMap[data.categoryTag ?? ""] ?? "border-cyan-300 bg-cyan-600/95 text-cyan-50";
}

export function NodeRenderer({ data }: NodeProps<PathwayNode>) {
  return (
    <div className="relative nodrag nopan">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-0 !bg-transparent"
      />
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
          "relative grid place-items-center border-2 px-2 text-center font-semibold shadow-[0_10px_24px_rgba(3,8,20,0.48)] transition-all duration-200",
          nodeShapeClass(data),
          nodePalette(data),
          data.type === "root" && "animate-pulse",
          data.isOnPrimary && "ring-4 ring-sky-300/70",
          data.isOnSecondary && "ring-2 ring-amber-300/70",
          data.isTarget && "ring-4 ring-emerald-300",
          data.isDimmed && "opacity-25",
        )}
      >
        <span className="leading-tight">{data.label}</span>
        {data.logo ? (
          <span className="pointer-events-none absolute -bottom-2 rounded bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-100">
            {data.logo}
          </span>
        ) : null}
        {data.memberCount ? (
          <span className="pointer-events-none absolute -right-1 -top-1 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
            {data.memberCount}
          </span>
        ) : null}
        {data.isEliminated ? (
          <span className="pointer-events-none absolute inset-0 grid place-items-center rounded-[inherit] bg-slate-950/45 text-2xl font-bold text-rose-300">
            ×
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
