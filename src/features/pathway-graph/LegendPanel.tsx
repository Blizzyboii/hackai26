"use client";

export function LegendPanel() {
  return (
    <section className="rounded-2xl border border-slate-600/30 bg-slate-900/80 p-3.5 shadow-xl backdrop-blur-xl">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
        Legend
      </h2>
      <div className="mt-2.5 space-y-2 text-[11px] text-slate-300">
        <div className="flex items-center gap-2.5">
          <span className="h-[2px] w-8 rounded-full bg-slate-400" />
          <span>Solid: structural progression</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="h-[2px] w-8 rounded-full border-t-2 border-dotted border-cyan-400" />
          <span>Dotted: alumni → company outcomes</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="h-[2px] w-8 rounded-full border-t-2 border-dashed border-amber-400" />
          <span>Dashed: cross-club bridge paths</span>
        </div>
        <div className="flex items-center gap-2.5">
          <span className="h-3 w-3 rounded-full bg-cyan-500/60 ring-2 ring-cyan-400/30" />
          <span>Primary recommended path</span>
        </div>
      </div>
    </section>
  );
}
