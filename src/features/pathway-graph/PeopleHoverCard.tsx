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
  point,
  viewport,
  onInspect,
  contextAction,
  onMouseEnter,
  onMouseLeave,
}: PeopleHoverCardProps) {
  const previewPeople = people.slice(0, 5);
  const left = Math.min(point.x + 16, Math.max(viewport.width - 324, 8));
  const top = Math.min(point.y + 16, Math.max(viewport.height - 340, 8));

  return (
    <div
      className="fixed z-40 w-80 rounded-xl border border-slate-700 bg-[#0f1118] p-3 shadow-2xl"
      style={{ left, top }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200">{title}</p>
      <p className="mt-1 text-xs text-slate-300">{subtitle}</p>
      {countLabel ? <p className="mt-1 text-xs font-semibold text-slate-200">{countLabel}</p> : null}

      {previewPeople.length > 0 ? (
        <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
          {previewPeople.map((person) => (
            <div key={person.id} className="flex items-center gap-2 rounded-lg bg-slate-900/70 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={person.avatarUrl}
                alt={person.name}
                className="h-8 w-8 rounded-full border border-slate-700 object-cover"
              />
              <div>
                <p className="text-sm font-medium text-slate-100">{person.name}</p>
                <p className="text-xs text-slate-400">
                  {person.role ?? "Alumni"} · {person.company}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400">No people records available for this node/edge yet.</p>
      )}

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-md bg-cyan-500 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-cyan-400"
          onClick={onInspect}
        >
          View details
        </button>
        {contextAction ? (
          <button
            type="button"
            className="flex-1 rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-800"
            onClick={contextAction.onClick}
          >
            {contextAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
