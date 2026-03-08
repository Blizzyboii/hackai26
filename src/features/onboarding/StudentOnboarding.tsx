"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";

const companyOptions = [
  "JPMorgan",
  "Apple",
  "Google",
  "Microsoft",
  "Amazon",
  "Goldman Sachs",
  "Capital One",
  "Deloitte",
];

const tagOptions = [
  "Technology",
  "Finance",
  "Healthcare",
  "Academic Interest",
  "Educational",
  "Professional Development",
  "Hobbies & Special Interests",
  "Cultural",
];

const involvementOptions = [
  "ACM",
  "AIS",
  "FinTech UTD",
  "IEEE",
  "WiCyS",
  "Research Lab",
  "Hackathons",
  "Internship Experience",
];

type RiskLevel = "low" | "medium" | "high";

interface FormState {
  fullName: string;
  utdEmail: string;
  major: string;
  graduationYear: string;
  targetCompanies: string[];
  semestersRemaining: number;
  weeklyHours: number;
  involvements: string[];
  interests: string[];
  risk: RiskLevel;
}

function toggleItem(list: string[], value: string) {
  if (list.includes(value)) {
    return list.filter((item) => item !== value);
  }
  return [...list, value];
}

export function StudentOnboarding() {
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState<FormState>({
    fullName: "",
    utdEmail: "",
    major: "",
    graduationYear: "2028",
    targetCompanies: [],
    semestersRemaining: 6,
    weeklyHours: 8,
    involvements: [],
    interests: [],
    risk: "medium",
  });

  const totalSteps = 4;

  const isStepValid = useMemo(() => {
    if (step === 1) {
      return Boolean(form.fullName.trim()) && Boolean(form.utdEmail.trim()) && Boolean(form.major.trim());
    }
    if (step === 2) {
      return form.targetCompanies.length > 0;
    }
    if (step === 3) {
      return form.interests.length > 0;
    }
    return true;
  }, [form.fullName, form.interests.length, form.major, form.targetCompanies.length, form.utdEmail, step]);

  const progress = Math.round((step / totalSteps) * 100);

  if (submitted) {
    return (
      <section className="mx-auto w-full max-w-2xl rounded-2xl border border-cyan-300/35 bg-[#090d16]/90 p-8 shadow-[0_0_45px_rgba(8,145,178,0.2)]">
        <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-cyan-400/15 text-cyan-200">
          <CheckCircle2 className="h-5 w-5" />
        </div>
        <h1 className="font-display text-3xl font-semibold text-white">Profile created.</h1>
        <p className="mt-2 text-sm text-slate-300">
          Welcome, {form.fullName}. Your Cortex student profile is ready and the pathway workspace is configured with
          your targets.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/graph"
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
          >
            Open Career Graph
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            type="button"
            className="rounded-lg border border-slate-600 bg-[#101626] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-[#151d31]"
            onClick={() => {
              setSubmitted(false);
              setStep(1);
            }}
          >
            Edit responses
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl rounded-2xl border border-cyan-300/35 bg-[#090d16]/90 p-6 shadow-[0_0_45px_rgba(8,145,178,0.2)] sm:p-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="inline-flex items-center gap-2 text-xs font-semibold text-slate-300 hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Link>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-200">Student Onboarding</p>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
          <span>
            Step {step} of {totalSteps}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full rounded-full bg-cyan-400 transition-all duration-300" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {step === 1 ? (
        <div className="mt-6 space-y-4">
          <h2 className="font-display text-3xl font-semibold text-white">Create your student profile</h2>
          <p className="text-sm text-slate-300">Use your current academic details so Cortex can personalize your path map.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Full name</span>
              <input
                className="w-full rounded-lg border border-slate-700 bg-[#101626] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300"
                value={form.fullName}
                onChange={(event) => setForm((current) => ({ ...current, fullName: event.target.value }))}
                placeholder="Sahas Sharma"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">UTD email</span>
              <input
                className="w-full rounded-lg border border-slate-700 bg-[#101626] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300"
                value={form.utdEmail}
                onChange={(event) => setForm((current) => ({ ...current, utdEmail: event.target.value }))}
                placeholder="netid@utdallas.edu"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Major</span>
              <input
                className="w-full rounded-lg border border-slate-700 bg-[#101626] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300"
                value={form.major}
                onChange={(event) => setForm((current) => ({ ...current, major: event.target.value }))}
                placeholder="Computer Science"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Graduation year</span>
              <select
                className="w-full rounded-lg border border-slate-700 bg-[#101626] px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-300"
                value={form.graduationYear}
                onChange={(event) => setForm((current) => ({ ...current, graduationYear: event.target.value }))}
              >
                {["2026", "2027", "2028", "2029", "2030"].map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="mt-6 space-y-4">
          <h2 className="font-display text-3xl font-semibold text-white">Set your goals</h2>
          <p className="text-sm text-slate-300">Pick target companies and timeline. Cortex will prioritize paths accordingly.</p>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Target companies</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {companyOptions.map((company) => {
                const active = form.targetCompanies.includes(company);
                return (
                  <button
                    key={company}
                    type="button"
                    className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                      active
                        ? "border-cyan-300/70 bg-cyan-500/15 text-cyan-100"
                        : "border-slate-700 bg-[#101626] text-slate-200 hover:bg-[#151d31]"
                    }`}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        targetCompanies: toggleItem(current.targetCompanies, company),
                      }))
                    }
                  >
                    {company}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                Semesters remaining: {form.semestersRemaining}
              </span>
              <input
                type="range"
                min={1}
                max={10}
                value={form.semestersRemaining}
                onChange={(event) =>
                  setForm((current) => ({ ...current, semestersRemaining: Number(event.target.value) }))
                }
                className="w-full"
              />
            </label>
            <label className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">
                Weekly availability: {form.weeklyHours} hrs
              </span>
              <input
                type="range"
                min={2}
                max={25}
                value={form.weeklyHours}
                onChange={(event) => setForm((current) => ({ ...current, weeklyHours: Number(event.target.value) }))}
                className="w-full"
              />
            </label>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div className="mt-6 space-y-4">
          <h2 className="font-display text-3xl font-semibold text-white">Questionnaire</h2>
          <p className="text-sm text-slate-300">Tell Cortex what you already have and what areas you want to explore next.</p>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Current involvements</p>
            <div className="flex flex-wrap gap-2">
              {involvementOptions.map((item) => {
                const active = form.involvements.includes(item);
                return (
                  <button
                    key={item}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-cyan-300/70 bg-cyan-500/15 text-cyan-100"
                        : "border-slate-700 bg-[#101626] text-slate-200 hover:bg-[#151d31]"
                    }`}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        involvements: toggleItem(current.involvements, item),
                      }))
                    }
                  >
                    {item}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Interest tags</p>
            <div className="flex flex-wrap gap-2">
              {tagOptions.map((tag) => {
                const active = form.interests.includes(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-cyan-300/70 bg-cyan-500/15 text-cyan-100"
                        : "border-slate-700 bg-[#101626] text-slate-200 hover:bg-[#151d31]"
                    }`}
                    onClick={() =>
                      setForm((current) => ({
                        ...current,
                        interests: toggleItem(current.interests, tag),
                      }))
                    }
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-400">Risk preference</p>
            <div className="flex gap-2">
              {(["low", "medium", "high"] as const).map((risk) => (
                <button
                  key={risk}
                  type="button"
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                    form.risk === risk
                      ? "border-cyan-300/70 bg-cyan-500/15 text-cyan-100"
                      : "border-slate-700 bg-[#101626] text-slate-200 hover:bg-[#151d31]"
                  }`}
                  onClick={() => setForm((current) => ({ ...current, risk }))}
                >
                  {risk}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div className="mt-6 space-y-4">
          <h2 className="font-display text-3xl font-semibold text-white">Review and launch</h2>
          <p className="text-sm text-slate-300">Your demo profile is ready. Confirm and open Cortex workspace.</p>
          <div className="rounded-xl border border-slate-700 bg-[#101626] p-4 text-sm text-slate-200">
            <p>
              <span className="text-slate-400">Student:</span> {form.fullName || "Not provided"}
            </p>
            <p className="mt-1">
              <span className="text-slate-400">Major / Grad:</span> {form.major || "Not provided"} / {form.graduationYear}
            </p>
            <p className="mt-1">
              <span className="text-slate-400">Targets:</span>{" "}
              {form.targetCompanies.length > 0 ? form.targetCompanies.join(", ") : "None selected"}
            </p>
            <p className="mt-1">
              <span className="text-slate-400">Interests:</span>{" "}
              {form.interests.length > 0 ? form.interests.join(", ") : "None selected"}
            </p>
            <p className="mt-1">
              <span className="text-slate-400">Risk / Time:</span> {form.risk} risk, {form.weeklyHours}h weekly
            </p>
          </div>
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between">
        <button
          type="button"
          className="rounded-lg border border-slate-600 bg-[#101626] px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-[#151d31] disabled:opacity-40"
          disabled={step === 1}
          onClick={() => setStep((current) => Math.max(1, current - 1))}
        >
          Back
        </button>

        {step < totalSteps ? (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isStepValid}
            onClick={() => setStep((current) => Math.min(totalSteps, current + 1))}
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
            onClick={() => setSubmitted(true)}
          >
            Create profile
            <CheckCircle2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </section>
  );
}
