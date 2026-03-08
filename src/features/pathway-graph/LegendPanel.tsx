"use client";

export function LegendPanel() {
  return (
    <section className="rounded-xl border border-slate-700 bg-[#0f1118]/95 p-3 shadow-sm backdrop-blur">
      <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-300">Legend</h2>
      <div className="mt-3 space-y-2 text-xs text-slate-300">
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-8 bg-slate-400" />
          <span>Solid: structural progression</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-8 border-t-2 border-dotted border-cyan-400" />
          <span>Dotted: alumni-to-company outcomes</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="h-0.5 w-8 border-t-2 border-dashed border-amber-400" />
          <span>Dashed: cross-club bridge paths</span>
        </div>
      </div>
    </section>
  );
}
