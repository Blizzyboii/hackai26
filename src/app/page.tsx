import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { ShaderAnimation } from "@/components/ui/shader-animation";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03050b] text-slate-100">
      <div className="pointer-events-none fixed inset-0 z-0 opacity-45">
        <ShaderAnimation />
      </div>

      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <section className="w-full max-w-2xl text-center">
          <h1 className="font-display text-5xl font-semibold tracking-[0.42em] text-white sm:text-6xl md:text-7xl">
            CORTEX
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
            Predictive career pathfinding for UTD students. Build your profile, answer a quick questionnaire, and
            launch your personalized pathway workspace.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/onboarding"
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-cyan-400 px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 sm:w-auto"
            >
              Student Signup
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/graph"
              className="inline-flex w-full items-center justify-center rounded-lg border border-slate-500/70 bg-[#0d1527]/80 px-5 py-3 text-sm font-semibold text-slate-100 hover:bg-[#13203a] sm:w-auto"
            >
              Open Graph Workspace
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
