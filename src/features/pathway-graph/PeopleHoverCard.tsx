"use client";

import { Person } from "./types";

interface ContextAction {
  label: string;
  onClick: () => void;
}

interface PeopleHoverCardProps {
  title: string;
  subtitle: string;
  people: Person[];
  countLabel?: string;
  detailLines?: string[];
  point: {
    x: number;
    y: number;
  };
  viewport: {
    width: number;
    height: number;
  };
  onInspect: () => void;
  contextAction?: ContextAction;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

export function PeopleHoverCard({
  title,
  subtitle,
  people,
  countLabel,
  detailLines,
  point,
  viewport,
  onInspect,
  contextAction,
  onMouseEnter,
  onMouseLeave,
}: PeopleHoverCardProps) {
  const left = Math.min(point.x + 16, Math.max(viewport.width - 340, 8));
  const top = Math.min(point.y + 16, Math.max(viewport.height - 380, 8));

  return (
    <div
      className="fixed z-40 w-80 rounded-2xl border border-slate-600/40 bg-slate-900/85 p-4 shadow-2xl backdrop-blur-xl animate-fade-in-scale"
      style={{ left, top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Header */}
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-300">
        {title}
      </p>
      <p className="mt-1 text-xs text-slate-400">{subtitle}</p>

      {countLabel ? (
        <p className="mt-1.5 text-xs font-semibold text-slate-200">
          {countLabel}
        </p>
      ) : null}

      {/* Detail metrics */}
      {detailLines && detailLines.length > 0 ? (
        <div className="mt-3 space-y-1.5 rounded-xl border border-slate-700/50 bg-slate-800/50 p-2.5">
          {detailLines.map((detail, index) => (
            <p
              key={`${detail}-${index}`}
              className="text-[11px] text-slate-300"
            >
              {detail}
            </p>
          ))}
        </div>
      ) : null}

      {/* People list */}
      {people.length > 0 ? (
        <div className="custom-scrollbar mt-3 max-h-48 space-y-1.5 overflow-y-auto pr-1">
          {people.map((person) => (
            <div
              key={person.id}
              className="flex items-center gap-2.5 rounded-xl border border-slate-700/30 bg-slate-800/40 p-2 transition-colors hover:bg-slate-800/60"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={person.avatarUrl}
                alt={person.name}
                className="h-8 w-8 rounded-full border-2 border-slate-600/40 object-cover ring-1 ring-slate-500/20"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-100">
                  {person.name}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {person.role ?? "Alumni"} · {person.company}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-[11px] text-slate-500">
          No people records available yet.
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-xl bg-gradient-to-r from-cyan-500 to-cyan-600 px-3 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-cyan-500/20 transition-all hover:shadow-cyan-500/30 hover:brightness-110"
          onClick={onInspect}
        >
          View details
        </button>
        {contextAction ? (
          <button
            type="button"
            className="flex-1 rounded-xl border border-slate-600/50 bg-slate-800/60 px-3 py-2 text-xs font-semibold text-slate-200 backdrop-blur-sm transition-colors hover:bg-slate-700/60"
            onClick={contextAction.onClick}
          >
            {contextAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
