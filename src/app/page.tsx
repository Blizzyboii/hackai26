import {
  ArrowRight,
  Brain,
  Clock3,
  Compass,
  Network,
  Orbit,
  Sparkles,
  Users,
} from "lucide-react";
import { ShaderAnimation } from "@/components/ui/shader-animation";

const pillars = [
  {
    icon: <Network className="h-5 w-5" />,
    title: "Branching Decision Tree",
    body: "Turn Nebula's campus signals into every plausible path through clubs, research, orgs, and coursework.",
  },
  {
    icon: <Brain className="h-5 w-5" />,
    title: "Adaptive ML Guidance",
    body: "Predict which combinations of choices actually lead to outcomes like JPMorgan, Apple, and beyond.",
  },
  {
    icon: <Compass className="h-5 w-5" />,
    title: "Career GPS",
    body: "Students set goals and timeline, then Cortex surfaces the decisions that matter before it is too late.",
  },
];

const impact = [
  {
    icon: <Clock3 className="h-4 w-4" />,
    label: "Timing-sensitive",
    value: "Course order and org timing can compound outcomes.",
  },
  {
    icon: <Users className="h-4 w-4" />,
    label: "Access gap",
    value: "Institutional knowledge is usually hidden behind social circles.",
  },
  {
    icon: <Orbit className="h-4 w-4" />,
    label: "Visibility",
    value: "Cortex makes hidden pathways legible for first-gen and under-networked students.",
  },
];

const howItWorks = [
  {
    title: "1. Map The Campus Network",
    body: "Every org at UTD becomes a node. Cortex visualizes real pathways students actually took across clubs, sub-programs, and companies.",
  },
  {
    title: "2. Weigh Real Alumni Routes",
    body: "Connections are weighted by alumni evidence, not guesses. Hover any edge to inspect who made that move and where they landed.",
  },
  {
    title: "3. Adapt In Real Time",
    body: "Set a target company and Cortex highlights strongest routes. If one path closes, the graph recalculates and promotes the next best option.",
  },
];

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03050b] text-slate-100">
      <div className="pointer-events-none fixed inset-0 z-0 opacity-45">
        <ShaderAnimation />
      </div>
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(circle_at_58%_40%,rgba(14,116,144,0.22),rgba(2,6,23,0.92)_38%,#02030a_75%)]" />

      <div className="pointer-events-none absolute -right-20 top-12 z-10 h-[30rem] w-[30rem] rounded-full border border-cyan-400/30 shadow-[0_0_120px_rgba(8,145,178,0.35)] animate-[spin_28s_linear_infinite]" />
      <div className="pointer-events-none absolute -right-8 top-24 z-10 h-[24rem] w-[24rem] rounded-full border border-cyan-200/25 animate-[spin_19s_linear_infinite_reverse]" />
      <div className="pointer-events-none absolute right-28 top-52 z-10 h-52 w-52 rounded-full bg-cyan-500/20 blur-3xl" />

      <div className="relative z-20">
        <header className="sticky top-0 z-40 border-b border-cyan-500/20 bg-[#03050b]/80 backdrop-blur">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-300/40 bg-cyan-500/15 text-cyan-200">
                <Sparkles className="h-4 w-4" />
              </div>
              <span className="text-sm font-semibold tracking-[0.25em] text-cyan-100">CORTEX</span>
            </div>
            <a
              href="/graph"
              className="rounded-lg border border-cyan-300/35 bg-cyan-500/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-100 hover:bg-cyan-500/20"
            >
              Open Graph
            </a>
          </div>
        </header>

        <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-14 pt-12 lg:grid-cols-[1.15fr_0.85fr]">
          <div>
            <p className="inline-flex rounded-full border border-cyan-300/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-100">
              Living Career GPS
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
              Cortex makes invisible campus decisions visible.
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
              Cortex transforms Nebula&apos;s campus data into a living, adaptive career GPS. Students enter their goals
              and timeline, and our ML engine builds a branching decision tree across courses, clubs, research, and
              organizations to predict where each path really leads.
            </p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-300">
              The difference between landing a dream job and missing it often comes down to decisions students did not
              know mattered. That knowledge usually moves through word of mouth. Cortex changes that.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="/graph"
                className="inline-flex items-center gap-2 rounded-xl bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
              >
                Explore Decision Graph
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </div>

          <aside className="rounded-3xl border border-cyan-300/25 bg-slate-950/70 p-5 shadow-[0_0_80px_rgba(8,145,178,0.16)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Why this matters</p>
            <div className="mt-4 space-y-3">
              {impact.map((item) => (
                <article
                  key={item.label}
                  className="rounded-xl border border-cyan-300/20 bg-cyan-500/5 px-3 py-3"
                >
                  <div className="flex items-center gap-2 text-cyan-100">
                    {item.icon}
                    <p className="text-xs font-semibold uppercase tracking-[0.12em]">{item.label}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-300">{item.value}</p>
                </article>
              ))}
            </div>
          </aside>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 pb-20">
          <div className="mb-4 rounded-2xl border border-cyan-300/20 bg-slate-950/65 p-5 shadow-[0_0_40px_rgba(8,145,178,0.12)]">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-200">Cortex - How It Works</p>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
              Cortex visualizes UTD&apos;s hidden career network as an interactive graph. Students choose a target company,
              relevant paths illuminate, irrelevant paths fade, and non-obvious cross-club bridges surface automatically.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {howItWorks.map((step) => (
                <article key={step.title} className="rounded-xl border border-slate-700 bg-[#11131c] p-3">
                  <h3 className="text-sm font-semibold text-slate-100">{step.title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-300">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {pillars.map((pillar) => (
              <article
                key={pillar.title}
                className="rounded-2xl border border-cyan-300/20 bg-slate-950/65 p-5 shadow-[0_0_40px_rgba(8,145,178,0.12)]"
              >
                <div className="inline-flex rounded-lg border border-cyan-200/35 bg-cyan-500/15 p-2 text-cyan-100">
                  {pillar.icon}
                </div>
                <h2 className="mt-3 text-lg font-semibold text-white">{pillar.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{pillar.body}</p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
