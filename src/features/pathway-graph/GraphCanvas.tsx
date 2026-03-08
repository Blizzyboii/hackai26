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
          panOnDrag
          panOnScroll
          zoomOnPinch
          zoomOnScroll
          zoomOnDoubleClick={false}
          fitView
          minZoom={0.3}
          maxZoom={2.0}
          onNodeDoubleClick={(_, node) => {
            setDoubleClickNodeId(node.id);
          }}
          proOptions={{ hideAttribution: true }}
          className="bg-[#07080c]"
        >
          <FitViewController fitViewNodeIds={fitViewNodeIds} />
          <DoubleClickZoomController targetNodeId={doubleClickNodeId} />
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1}
            color="#1a1f2e"
          />
          <MiniMap
            zoomable
            pannable
            className="!bg-slate-900/80 !border !border-slate-700/40 !rounded-xl !backdrop-blur-md !shadow-xl"
            nodeColor={(node) => {
              const data = node.data as PathwayNodeViewData;

              if (data.isDimmed) {
                return "#1e293b";
              }

              if (data.type === "club") {
                return "#0891b2";
              }

              if (data.type === "company") {
                return "#64748b";
              }

              if (data.type === "subprogram") {
                return "#475569";
              }

              return "#22d3ee";
            }}
          />
          <Controls
            showInteractive={false}
            className="!border !border-slate-700/40 !bg-slate-900/80 !rounded-xl !backdrop-blur-md !shadow-xl [&_button]:!bg-slate-800/80 [&_button]:!text-slate-200 [&_button]:!border-slate-700/40 [&_button:hover]:!bg-slate-700/80"
          />
          <Panel position="top-right" className="flex gap-2">
            <button
              type="button"
              className={`rounded-xl border px-4 py-2 text-xs font-bold shadow-lg backdrop-blur-md transition-all duration-200 ${!showingFullMap
                  ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200 shadow-cyan-500/10"
                  : "border-slate-600/40 bg-slate-900/80 text-slate-300 hover:bg-slate-800/80"
                }`}
              onClick={onResetFocus}
            >
              Focus Mode
            </button>
            <button
              type="button"
              className={`rounded-xl border px-4 py-2 text-xs font-bold shadow-lg backdrop-blur-md transition-all duration-200 ${showingFullMap
                  ? "border-cyan-400/40 bg-cyan-500/15 text-cyan-200 shadow-cyan-500/10"
                  : "border-slate-600/40 bg-slate-900/80 text-slate-300 hover:bg-slate-800/80"
                }`}
              onClick={onViewFullMap}
            >
              Full Map
            </button>
          </Panel>
          {showingFullMap ? (
            <Panel position="top-center">
              <div className="rounded-full border border-slate-600/40 bg-slate-900/80 px-4 py-1.5 text-xs font-medium text-slate-300 shadow-lg backdrop-blur-md">
                Showing all paths — select a company to focus
              </div>
            </Panel>
          ) : null}
        </ReactFlow>
        {children}
      </div>
    </ReactFlowProvider>
  );
}
