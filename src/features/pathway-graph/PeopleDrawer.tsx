"use client";

import { Person } from "./types";

interface PeopleDrawerProps {
  title?: string;
  subtitle?: string;
  people?: Person[];
  detailLines?: string[];
  contextActionLabel?: string;
  onContextAction?: () => void;
  open: boolean;
  onClose: () => void;
}

export function PeopleDrawer({
  title,
  subtitle,
  people,
  detailLines,
  contextActionLabel,
  onContextAction,
  open,
  onClose,
}: PeopleDrawerProps) {
  const resolvedPeople = people ?? [];

  if (!title && resolvedPeople.length === 0) {
    return null;
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm transition duration-300 ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed bottom-0 right-0 z-50 h-[100dvh] w-full max-w-md transform border-l border-slate-700/50 bg-slate-950/95 shadow-2xl backdrop-blur-xl transition-transform duration-300 ease-out md:top-0 ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-label="People details"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/50 px-5 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-cyan-300">
              People details
            </p>
            <h3 className="mt-0.5 text-base font-semibold text-slate-100">
              {title}
            </h3>
          </div>
          <button
            type="button"
            className="rounded-xl border border-slate-600/50 bg-slate-800/60 px-3.5 py-1.5 text-sm font-medium text-slate-200 backdrop-blur-sm transition-colors hover:bg-slate-700/60"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Content */}
        <div className="custom-scrollbar h-[calc(100%-68px)] overflow-y-auto p-5">
          {subtitle ? (
            <p className="mb-4 text-sm text-slate-400">{subtitle}</p>
          ) : null}

          {detailLines && detailLines.length > 0 ? (
            <div className="mb-4 space-y-1.5 rounded-2xl border border-slate-700/40 bg-slate-800/40 px-4 py-3 backdrop-blur-sm">
              {detailLines.map((detail, index) => (
                <p
                  key={`${detail}-${index}`}
                  className="text-xs text-slate-300"
                >
                  {detail}
                </p>
              ))}
            </div>
          ) : null}

          {contextActionLabel && onContextAction ? (
            <button
              type="button"
              className="mb-4 w-full rounded-xl border border-slate-600/50 bg-slate-800/50 px-3 py-2.5 text-sm font-semibold text-slate-100 backdrop-blur-sm transition-colors hover:bg-slate-700/50"
              onClick={onContextAction}
            >
              {contextActionLabel}
            </button>
          ) : null}

          <div className="space-y-3">
            {resolvedPeople.map((person) => (
              <article
                key={person.id}
                className="rounded-2xl border border-slate-700/40 bg-slate-800/30 p-4 backdrop-blur-sm transition-colors hover:bg-slate-800/50"
              >
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={person.avatarUrl}
                    alt={person.name}
                    className="h-11 w-11 rounded-full border-2 border-slate-600/40 object-cover ring-2 ring-slate-500/20"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-slate-100">
                      {person.name}
                    </h4>
                    <p className="truncate text-xs text-slate-400">
                      {person.role ?? "Alumni"} · {person.company}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">
                  Class of {person.gradYear ?? "N/A"}
                </p>
              </article>
            ))}
            {resolvedPeople.length === 0 ? (
              <p className="rounded-2xl border border-slate-700/40 bg-slate-800/30 px-4 py-3 text-sm text-slate-400 backdrop-blur-sm">
                No people records available for this selection.
              </p>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
