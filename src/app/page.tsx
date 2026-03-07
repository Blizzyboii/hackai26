import Link from "next/link";
import { Sparkles, LayoutDashboard, Rocket, CheckCircle2 } from "lucide-react";
import { ShaderAnimation } from "@/components/ui/shader-animation";
import { GlowingEffectDemo } from "@/components/ui/glowing-effect-demo";
import { GlowingEffect } from "@/components/ui/glowing-effect";

export default function Home() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="pointer-events-none fixed inset-0 z-0 opacity-35 [filter:invert(1)_hue-rotate(180deg)]">
        <ShaderAnimation />
      </div>
      <div className="pointer-events-none fixed inset-0 z-0 bg-white/55" />

      <div className="relative z-10">
      <header className="sticky top-0 z-40 border-b border-[#4c7894]/20 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#4c7894] text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-semibold">HackAI</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/application" className="rounded-lg bg-[#4c7894] px-4 py-2 text-sm font-medium text-white hover:bg-[#3f657d]">
              Open App
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl items-center gap-8 px-6 pb-14 pt-10 lg:grid-cols-2 lg:pt-16">
        <div>
          <p className="inline-flex rounded-full border border-[#dd7bbb]/30 bg-[#dd7bbb]/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.14em] text-[#9d3d74]">
            Hackathon Starter
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
            Light, clean landing page with editable placeholder content.
          </h1>
          <p className="mt-4 max-w-xl text-slate-600">
            Use this as your default project shell. Replace text, cards, and flows as your idea gets clearer.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/application" className="rounded-xl bg-[#4c7894] px-5 py-3 text-sm font-medium text-white hover:bg-[#3f657d]">
              Launch Placeholder App
            </Link>
            <a href="#features" className="rounded-xl border border-[#5a922c]/35 bg-[#5a922c]/10 px-5 py-3 text-sm font-medium text-[#355b19] hover:bg-[#5a922c]/15">
              View Sections
            </a>
          </div>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-[#4c7894]/25 bg-gradient-to-b from-[#dd7bbb]/10 via-[#d79f1e]/10 to-[#4c7894]/10 p-4 shadow-xl">
          <div className="relative z-10 rounded-2xl border border-[#4c7894]/20 bg-white p-6">
            <GlowingEffect spread={36} glow disabled={false} proximity={56} inactiveZone={0.02} borderWidth={2} />
            <p className="text-xs uppercase tracking-[0.14em] text-[#4c7894]">Live Preview</p>
            <h2 className="mt-2 text-xl font-semibold">Your App Snapshot</h2>
            <p className="mt-2 text-sm text-slate-600">Swap this preview with your real screenshots later.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="relative rounded-xl border border-[#d79f1e]/25 bg-[#d79f1e]/10 p-3">
                <GlowingEffect spread={30} glow disabled={false} proximity={48} inactiveZone={0.01} borderWidth={2} />
                <p className="text-xs text-[#8c5e0d]">Active Users</p>
                <p className="text-2xl font-semibold">2,184</p>
              </div>
              <div className="relative rounded-xl border border-[#5a922c]/25 bg-[#5a922c]/10 p-3">
                <GlowingEffect spread={30} glow disabled={false} proximity={48} inactiveZone={0.01} borderWidth={2} />
                <p className="text-xs text-[#355b19]">Demo Readiness</p>
                <p className="text-2xl font-semibold">81%</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="mx-auto w-full max-w-6xl px-6 pb-16">
        <div className="grid gap-4 md:grid-cols-3">
          <FeatureCard
            icon={<LayoutDashboard className="h-5 w-5" />}
            title="Landing"
            body="Simple hero, CTA, and clear positioning text."
          />
          <FeatureCard
            icon={<Rocket className="h-5 w-5" />}
            title="Application"
            body="Dedicated placeholder app route ready for your real workflows."
          />
          <FeatureCard
            icon={<CheckCircle2 className="h-5 w-5" />}
            title="Editable"
            body="All sections are scaffolded and easy to modify quickly."
          />
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 pb-20">
        <div className="mb-5">
          <p className="text-xs font-medium uppercase tracking-[0.14em] text-[#4c7894]">Interactive Cards</p>
          <h2 className="mt-1 text-2xl font-semibold text-slate-900">Glowing Effect Section</h2>
        </div>
        <GlowingEffectDemo />
      </section>
      </div>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className="relative rounded-2xl border border-[#4c7894]/20 bg-white p-5 shadow-sm">
      <GlowingEffect spread={34} glow disabled={false} proximity={56} inactiveZone={0.02} borderWidth={2} />
      <div className="mb-3 inline-flex rounded-lg bg-[#4c7894]/10 p-2 text-[#4c7894]">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-slate-600">{body}</p>
    </article>
  );
}
