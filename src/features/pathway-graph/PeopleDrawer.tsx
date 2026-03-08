"use client";

import { Person } from "./types";

interface PeopleDrawerProps {
  title?: string;
  subtitle?: string;
  people?: Person[];
  contextActionLabel?: string;
  onContextAction?: () => void;
  open: boolean;
  onClose: () => void;
}

export function PeopleDrawer({
  title,
  subtitle,
  people,
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
        className={`fixed inset-0 z-40 bg-slate-950/50 transition ${open ? "opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`fixed bottom-0 right-0 z-50 h-[100dvh] w-full max-w-md transform border-l border-slate-800 bg-[#0b0f16] shadow-2xl transition duration-300 md:top-0 ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-label="People details"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-cyan-200">People details</p>
            <h3 className="text-base font-semibold text-slate-100">{title}</h3>
          </div>
          <button
            type="button"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="h-[calc(100%-64px)] overflow-y-auto p-4">
          {subtitle ? <p className="mb-3 text-sm text-slate-300">{subtitle}</p> : null}

          {contextActionLabel && onContextAction ? (
            <button
              type="button"
              className="mb-3 w-full rounded-md border border-slate-600 bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800"
              onClick={onContextAction}
            >
              {contextActionLabel}
            </button>
          ) : null}

          <div className="space-y-3">
            {resolvedPeople.map((person) => (
              <article key={person.id} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={person.avatarUrl}
                    alt={person.name}
                    className="h-10 w-10 rounded-full border border-slate-700 object-cover"
                  />
                  <div>
                    <h4 className="text-sm font-semibold text-slate-100">{person.name}</h4>
                    <p className="text-xs text-slate-300">
                      {person.role ?? "Alumni"} · {person.company}
                    </p>
                  </div>
                </div>
                <p className="mt-2 text-xs text-slate-400">Class of {person.gradYear ?? "N/A"}</p>
              </article>
            ))}
            {resolvedPeople.length === 0 ? (
              <p className="rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
                No people records available for this selection.
              </p>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
