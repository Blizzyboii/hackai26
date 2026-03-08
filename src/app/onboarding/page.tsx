import { ShaderAnimation } from "@/components/ui/shader-animation";
import { StudentOnboarding } from "@/features/onboarding/StudentOnboarding";

export default function OnboardingPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#03050b] text-slate-100">
      <div className="pointer-events-none fixed inset-0 z-0 opacity-45">
        <ShaderAnimation />
      </div>

      <div className="relative z-10 flex min-h-screen items-center px-4 py-10">
        <StudentOnboarding />
      </div>
    </main>
  );
}
