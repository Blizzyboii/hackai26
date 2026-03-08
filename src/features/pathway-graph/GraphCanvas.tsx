"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react";
import { EdgeRenderer, PathwayEdge } from "./EdgeRenderer";
import { NodeRenderer, PathwayNode, PathwayNodeViewData } from "./NodeRenderer";

interface GraphCanvasProps {
  nodes: PathwayNode[];
  edges: PathwayEdge[];
  fitViewNodeIds: string[];
  showingFullMap: boolean;
  onResetFocus: () => void;
  onViewFullMap: () => void;
  children?: React.ReactNode;
}

const nodeTypes = {
  pathwayNode: NodeRenderer,
};

const edgeTypes = {
  pathwayEdge: EdgeRenderer,
};

function FitViewController({ fitViewNodeIds }: { fitViewNodeIds: string[] }) {
  const { fitView, getNodes } = useReactFlow();

  const fitKey = useMemo(() => fitViewNodeIds.join("|"), [fitViewNodeIds]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const selectedIds = new Set(fitViewNodeIds);
      const nodesToFit =
        fitViewNodeIds.length > 0
          ? getNodes().filter((node) => selectedIds.has(node.id))
          : getNodes();

      if (nodesToFit.length > 0) {
        void fitView({
          nodes: nodesToFit,
          padding: 0.2,
          duration: 360,
        });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [fitKey, fitViewNodeIds, fitView, getNodes]);

  return null;
}

function DoubleClickZoomController({ targetNodeId }: { targetNodeId: string | null }) {
  const { getNode, setCenter, getZoom } = useReactFlow();

  useEffect(() => {
    if (!targetNodeId) {
      return;
    }

    const node = getNode(targetNodeId);

    if (!node) {
      return;
    }

    const width = node.measured?.width ?? 96;
    const height = node.measured?.height ?? 96;

    void setCenter(node.position.x + width / 2, node.position.y + height / 2, {
      duration: 320,
      zoom: Math.max(getZoom(), 1.05),
    });
  }, [getNode, getZoom, setCenter, targetNodeId]);

  return null;
}

export function GraphCanvas({
  nodes,
  edges,
  fitViewNodeIds,
  showingFullMap,
  onResetFocus,
  onViewFullMap,
  children,
}: GraphCanvasProps) {
  const [doubleClickNodeId, setDoubleClickNodeId] = useState<string | null>(null);

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          panOnScroll
          zoomOnPinch
          zoomOnScroll
          zoomOnDoubleClick={false}
          fitView
          minZoom={0.4}
          maxZoom={1.85}
          onNodeDoubleClick={(_, node) => {
            setDoubleClickNodeId(node.id);
          }}
          proOptions={{ hideAttribution: true }}
          className="bg-[#0a0a0a]"
        >
          <FitViewController fitViewNodeIds={fitViewNodeIds} />
          <DoubleClickZoomController targetNodeId={doubleClickNodeId} />
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.4}
            color="#1f2937"
          />
          <MiniMap
            zoomable
            pannable
            className="!bg-[#0f1118] !border !border-slate-700"
            nodeColor={(node) => {
              const data = node.data as PathwayNodeViewData;

              if (data.isDimmed) {
                return "#334155";
              }

              if (data.type === "club") {
                return "#0891b2";
              }

              if (data.type === "company") {
                return "#94a3b8";
              }

              if (data.type === "subprogram") {
                return "#64748b";
              }

              return "#38bdf8";
            }}
          />
          <Controls
            showInteractive={false}
            className="!border !border-slate-700 !bg-[#0f1118] [&_button]:!bg-[#111827] [&_button]:!text-slate-100"
          />
          <Panel position="top-right" className="flex gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-700 bg-[#0f1118] px-3 py-1.5 text-xs font-semibold text-slate-100 shadow-sm hover:bg-slate-800"
              onClick={onResetFocus}
            >
              Focus Mode
            </button>
            <button
              type="button"
              className="rounded-md border border-cyan-400/40 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 shadow-sm hover:bg-cyan-500/25"
              onClick={onViewFullMap}
            >
              View Full Map
            </button>
          </Panel>
          {showingFullMap ? (
            <Panel position="top-center">
              <div className="rounded-full border border-slate-700 bg-[#0f1118]/95 px-3 py-1 text-xs text-slate-200">
                Showing all paths - select a company to focus.
              </div>
            </Panel>
          ) : null}
        </ReactFlow>
        {children}
      </div>
    </ReactFlowProvider>
  );
}
