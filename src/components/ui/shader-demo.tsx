import { ShaderAnimation } from "@/components/ui/shader-animation";

export default function ShaderDemo() {
  return (
    <div className="relative flex h-[650px] w-full flex-col items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-blue-700">
      <ShaderAnimation />
      <span className="pointer-events-none absolute z-10 whitespace-pre-wrap text-center text-5xl font-semibold leading-none tracking-tighter text-white md:text-7xl">
        Shader Animation
      </span>
    </div>
  );
}
