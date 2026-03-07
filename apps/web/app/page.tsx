"use client";

import { FormEvent, startTransition, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { generateRoutine, generateSong, getRoutine, uploadSong } from "@/lib/api";

type SourceMode = "upload" | "lyria";

export default function HomePage() {
  const router = useRouter();
  const [mode, setMode] = useState<SourceMode>("upload");
  const [difficulty, setDifficulty] = useState(50);
  const [songFile, setSongFile] = useState<File | null>(null);
  const [prompt, setPrompt] = useState("");
  const [genre, setGenre] = useState("electronic");
  const [mood, setMood] = useState("energetic");
  const [targetDurationSec, setTargetDurationSec] = useState(90);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songId, setSongId] = useState<string | null>(null);
  const [routineId, setRoutineId] = useState<string | null>(null);
  const [routineStatus, setRoutineStatus] = useState<string | null>(null);
  const [routineErrorCode, setRoutineErrorCode] = useState<string | null>(null);

  useEffect(() => {
    if (!routineId || !routineStatus || routineStatus === "succeeded" || routineStatus === "failed") {
      return;
    }

    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const routine = await getRoutine(routineId);
        if (cancelled) {
          return;
        }
        setRoutineStatus(routine.status);
        setRoutineErrorCode(routine.error_code ?? null);
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : "Failed to poll routine status");
        }
      }
    }, 1600);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [routineId, routineStatus]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSongId(null);
    setRoutineId(null);
    setRoutineStatus(null);
    setRoutineErrorCode(null);

    try {
      let finalSongId: string;
      if (mode === "upload") {
        if (!songFile) {
          throw new Error("Choose an audio file first.");
        }
        const uploadRes = await uploadSong(songFile);
        finalSongId = uploadRes.song_id;
      } else {
        if (!prompt.trim()) {
          throw new Error("Prompt is required for Lyria generation.");
        }
        const generated = await generateSong({
          prompt: prompt.trim(),
          genre: genre.trim(),
          mood: mood.trim(),
          target_duration_sec: targetDurationSec,
        });
        finalSongId = generated.song_id;
      }
      setSongId(finalSongId);
      const routine = await generateRoutine(finalSongId, difficulty);
      setRoutineId(routine.routine_id);
      setRoutineStatus(routine.status);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to create routine");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <h1 className="headline">Dance Forge</h1>
        <p className="subtle">
          Choose a song source, set difficulty, pre-generate move panels, then play with webcam scoring.
        </p>
      </section>

      <section className="card">
        <form onSubmit={onSubmit} className="grid">
          <div>
            <label>Song source</label>
            <select value={mode} onChange={(e) => setMode(e.target.value as SourceMode)}>
              <option value="upload">Upload song</option>
              <option value="lyria">Generate with Lyria</option>
            </select>
          </div>

          <div>
            <label>
              Difficulty ({difficulty})
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={difficulty}
              onChange={(e) => setDifficulty(Number(e.target.value))}
            />
          </div>

          {mode === "upload" ? (
            <div>
              <label>Audio file (`.mp3`, `.wav`, `.m4a`)</label>
              <input
                type="file"
                accept=".mp3,.wav,.m4a,audio/*"
                onChange={(e) => setSongFile(e.target.files?.[0] ?? null)}
              />
            </div>
          ) : (
            <>
              <div>
                <label>Prompt</label>
                <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} />
              </div>
              <div className="grid">
                <div>
                  <label>Genre</label>
                  <input type="text" value={genre} onChange={(e) => setGenre(e.target.value)} />
                </div>
                <div>
                  <label>Mood</label>
                  <input type="text" value={mood} onChange={(e) => setMood(e.target.value)} />
                </div>
                <div>
                  <label>Target seconds (max 180)</label>
                  <input
                    type="range"
                    min={30}
                    max={180}
                    step={10}
                    value={targetDurationSec}
                    onChange={(e) => setTargetDurationSec(Number(e.target.value))}
                  />
                  <div className="subtle">{targetDurationSec}s</div>
                </div>
              </div>
            </>
          )}

          <div>
            <button disabled={isSubmitting}>{isSubmitting ? "Preparing..." : "Generate Routine"}</button>
          </div>
        </form>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Pipeline status</h2>
        <p className="subtle">Song upload/generation, routine generation, then play.</p>
        <div style={{ display: "grid", gap: "0.6rem" }}>
          <div>
            Song:{" "}
            {songId ? <span className="pill success">{songId}</span> : <span className="pill">Not ready</span>}
          </div>
          <div>
            Routine:{" "}
            {routineStatus ? (
              <span className={`pill ${routineStatus === "failed" ? "warn" : routineStatus === "succeeded" ? "success" : ""}`}>
                {routineStatus}
              </span>
            ) : (
              <span className="pill">Not started</span>
            )}
          </div>
          {routineErrorCode ? <div className="subtle">Error code: {routineErrorCode}</div> : null}
          {error ? (
            <div className="pill warn">{error}</div>
          ) : null}
          {mode === "lyria" && error?.includes("LYRIA_UNAVAILABLE") ? (
            <div className="subtle">Lyria is unavailable right now. Switch to upload mode to continue immediately.</div>
          ) : null}
          {routineId && routineStatus === "succeeded" ? (
            <div>
              <button
                className="secondary"
                onClick={() => {
                  startTransition(() => router.push(`/play/${routineId}`));
                }}
              >
                Start Dance Session
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
