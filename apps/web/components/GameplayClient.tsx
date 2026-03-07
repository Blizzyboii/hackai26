"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { PoseLandmarker } from "@mediapipe/tasks-vision";
import { MotionPreview3D } from "@/components/MotionPreview3D";
import { assetUrl, completeSession, getRoutine, startSession, type Routine } from "@/lib/api";
import { createPoseLandmarker, extractCoco17 } from "@/lib/pose";
import { bestPoseSimilarity, normalizePose, panelScore, type Keypoint } from "@/lib/scoring";

type PanelState = {
  finalized: boolean;
  bestPoseSim: number;
  bestOffsetMs: number;
  bestPanelScore: number;
  hit: boolean;
};

type FinalizedResult = {
  index: number;
  panel_score: number;
  pose_sim: number;
  offset_ms: number;
  hit: boolean;
};

type PreviewMotion = {
  fps: number;
  frames: number[][][];
};

export function GameplayClient({ routineId }: { routineId: string }) {
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [previewMotion, setPreviewMotion] = useState<PreviewMotion | null>(null);
  const [currentMs, setCurrentMs] = useState(0);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [finalGrade, setFinalGrade] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const [livePoseSim, setLivePoseSim] = useState<number>(0);
  const [liveTimingOffset, setLiveTimingOffset] = useState<number>(0);
  const [livePanelText, setLivePanelText] = useState<string>("Waiting");
  const [lastJudgement, setLastJudgement] = useState<string>("None");

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const detectorRef = useRef<PoseLandmarker | null>(null);
  const loopRef = useRef<number | null>(null);
  const panelStatesRef = useRef<Record<number, PanelState>>({});
  const streamRef = useRef<MediaStream | null>(null);

  const currentPanelIndex = useMemo(() => {
    if (!routine) {
      return -1;
    }
    for (const panel of routine.panels) {
      if (currentMs < panel.target_ms + panel.window_ms) {
        return panel.index;
      }
    }
    return routine.panels.length - 1;
  }, [routine, currentMs]);

  const deferredPanelIndex = useDeferredValue(currentPanelIndex);

  useEffect(() => {
    let mounted = true;
    async function init() {
      try {
        const routineResponse = await getRoutine(routineId);
        if (!mounted) {
          return;
        }
        if (routineResponse.status !== "succeeded") {
          throw new Error("Routine is not ready yet. Return to setup and wait for generation to finish.");
        }
        setRoutine(routineResponse);
        if (routineResponse.preview_motion_url) {
          try {
            const previewRes = await fetch(assetUrl(routineResponse.preview_motion_url), { cache: "no-store" });
            if (previewRes.ok) {
              const payload = (await previewRes.json()) as PreviewMotion;
              if (payload.frames && payload.frames.length > 0) {
                setPreviewMotion(payload);
              }
            }
          } catch {
            // Preview is optional; keep gameplay available even if preview fetch fails.
          }
        }
        const sessionResponse = await startSession(routineId);
        if (!mounted) {
          return;
        }
        setSessionId(sessionResponse.session_id);
      } catch (initError) {
        if (mounted) {
          setError(initError instanceof Error ? initError.message : "Failed to load routine");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      mounted = false;
    };
  }, [routineId]);

  useEffect(() => {
    let mounted = true;
    async function initWebcamAndPose() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        if (!mounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        if (mounted) {
          setWebcamError("Webcam unavailable or permission denied. Scoring will continue but all panels will miss.");
        }
      }

      try {
        const detector = await createPoseLandmarker();
        if (mounted) {
          detectorRef.current = detector;
        } else {
          detector.close();
        }
      } catch {
        if (mounted) {
          setWebcamError("MediaPipe pose model failed to load.");
        }
      }
    }

    initWebcamAndPose();
    return () => {
      mounted = false;
      if (loopRef.current) {
        cancelAnimationFrame(loopRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      detectorRef.current?.close();
    };
  }, []);

  function drawPose(points: Keypoint[] | null) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!points) {
      return;
    }
    ctx.fillStyle = "rgba(255, 225, 107, 0.9)";
    for (const [x, y] of points) {
      ctx.beginPath();
      ctx.arc(x * canvas.width, y * canvas.height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function ensurePanelState(index: number): PanelState {
    const existing = panelStatesRef.current[index];
    if (existing) {
      return existing;
    }
    const created: PanelState = {
      finalized: false,
      bestPoseSim: 0,
      bestOffsetMs: 999_999,
      bestPanelScore: 0,
      hit: false,
    };
    panelStatesRef.current[index] = created;
    return created;
  }

  function computeTotalsFromStates(currentRoutine: Routine): { finalScore: number; combo: number; maxCombo: number } {
    let computedScore = 0;
    let computedCombo = 0;
    let computedMaxCombo = 0;
    for (const panel of currentRoutine.panels) {
      const st = panelStatesRef.current[panel.index];
      if (!st || !st.finalized) {
        continue;
      }
      if (st.hit) {
        computedCombo += 1;
        const mult = Math.min(1 + computedCombo * 0.05, 1.5);
        computedScore += Math.round(st.bestPanelScore * mult);
      } else {
        computedCombo = 0;
      }
      computedMaxCombo = Math.max(computedMaxCombo, computedCombo);
    }
    return { finalScore: computedScore, combo: computedCombo, maxCombo: computedMaxCombo };
  }

  function recomputeLiveMetrics() {
    if (!routine) {
      return;
    }
    const totals = computeTotalsFromStates(routine);
    setScore(totals.finalScore);
    setCombo(totals.combo);
    setMaxCombo(totals.maxCombo);
  }

  function evaluateFrame(nowMs: number, playerPose: Keypoint[] | null) {
    if (!routine) {
      return;
    }
    const normalizedPlayer = playerPose ? normalizePose(playerPose) : null;
    let panelText = "No active panel";
    let panelPose = 0;
    let panelOffset = 0;

    for (const panel of routine.panels) {
      const state = ensurePanelState(panel.index);
      if (state.finalized) {
        continue;
      }
      const offset = Math.round(nowMs - panel.target_ms);

      if (Math.abs(offset) <= panel.window_ms) {
        panelText = `Panel ${panel.index + 1}`;
        panelOffset = offset;
      }

      if (normalizedPlayer && Math.abs(offset) <= panel.window_ms) {
        const reference = panel.ref_keypoints as Keypoint[];
        const poseSim = bestPoseSimilarity(normalizedPlayer, reference);
        const scoreValue = panelScore(poseSim, offset, panel.window_ms);
        if (scoreValue > state.bestPanelScore) {
          state.bestPanelScore = scoreValue;
          state.bestPoseSim = poseSim;
          state.bestOffsetMs = offset;
        }
        if (panel.index === currentPanelIndex) {
          panelPose = poseSim;
        }
      }

      if (offset > panel.window_ms) {
        const wasFinalized = state.finalized;
        state.finalized = true;
        state.hit = state.bestPoseSim >= routine.pose_threshold;
        if (!wasFinalized) {
          setLastJudgement(state.hit ? `HIT (+${state.bestPanelScore})` : "MISS");
        }
      }
    }

    setLivePanelText(panelText);
    setLivePoseSim(panelPose);
    setLiveTimingOffset(panelOffset);
    recomputeLiveMetrics();
  }

  function buildFinalResults(): FinalizedResult[] {
    if (!routine) {
      return [];
    }
    const results: FinalizedResult[] = [];
    for (const panel of routine.panels) {
      const state = ensurePanelState(panel.index);
      if (!state.finalized) {
        state.finalized = true;
        state.hit = state.bestPoseSim >= routine.pose_threshold;
      }
      results.push({
        index: panel.index,
        panel_score: state.bestPanelScore,
        pose_sim: Number(state.bestPoseSim.toFixed(4)),
        offset_ms: state.bestOffsetMs === 999_999 ? panel.window_ms + 1 : state.bestOffsetMs,
        hit: state.hit,
      });
    }
    return results;
  }

  async function finishSession() {
    if (!sessionId || !routine || isSubmitting) {
      return;
    }
    setIsSubmitting(true);
    try {
      const panelResults = buildFinalResults();
      const totals = computeTotalsFromStates(routine);
      setScore(totals.finalScore);
      setCombo(totals.combo);
      setMaxCombo(totals.maxCombo);
      const complete = await completeSession(sessionId, {
        final_score: totals.finalScore,
        max_combo: totals.maxCombo,
        panel_results: panelResults,
      });
      setFinalGrade(complete.rank_grade);
    } catch (finishError) {
      setError(finishError instanceof Error ? finishError.message : "Failed to complete session");
    } finally {
      setIsSubmitting(false);
      setIsPlaying(false);
    }
  }

  function runLoop() {
    const video = videoRef.current;
    const audio = audioRef.current;
    const detector = detectorRef.current;
    if (!video || !audio) {
      return;
    }

    const step = () => {
      if (!audio || audio.paused) {
        return;
      }

      const now = audio.currentTime * 1000;
      setCurrentMs(now);
      let pose: Keypoint[] | null = null;
      if (detector && video.readyState >= 2) {
        const raw = detector.detectForVideo(video, performance.now());
        pose = extractCoco17(raw);
      }
      drawPose(pose);
      evaluateFrame(now, pose);
      loopRef.current = requestAnimationFrame(step);
    };
    loopRef.current = requestAnimationFrame(step);
  }

  function handleStart() {
    if (!audioRef.current) {
      return;
    }
    setFinalGrade(null);
    setError(null);
    setLivePoseSim(0);
    setLiveTimingOffset(0);
    setLivePanelText("Starting");
    setLastJudgement("None");
    panelStatesRef.current = {};
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setCurrentMs(0);
    void audioRef.current.play();
    setIsPlaying(true);
    runLoop();
  }

  if (loading) {
    return (
      <main className="shell">
        <section className="card">Loading dance routine...</section>
      </main>
    );
  }

  if (error && !routine) {
    return (
      <main className="shell">
        <section className="card">
          <div className="pill warn">{error}</div>
        </section>
      </main>
    );
  }

  if (!routine) {
    return null;
  }

  return (
    <main className="shell">
      <section className="card">
        <h1 className="headline">Dance Session</h1>
        <p className="subtle">
          Routine {routine.routine_id.slice(0, 8)} • threshold {routine.pose_threshold.toFixed(2)} • layout{" "}
          {routine.preview_joint_layout}
        </p>
      </section>

      <section className="card hud-two-up">
        <div className="stage">
          <video ref={videoRef} autoPlay muted playsInline />
          <canvas ref={canvasRef} />
        </div>
        <div className="target-stage">
          <MotionPreview3D motion={previewMotion} currentMs={currentMs} />
        </div>
      </section>

      <section className="card panel-strip">
        {routine.panels.map((panel) => (
          <div key={panel.index} className={`panel-item ${deferredPanelIndex === panel.index ? "active" : ""}`}>
            <img src={assetUrl(panel.thumbnail_url)} alt={`Panel ${panel.index + 1}`} />
            <div>
              <div>Panel {panel.index + 1}</div>
              <div className="subtle">t={Math.round(panel.target_ms / 1000)}s</div>
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <audio
          ref={audioRef}
          src={assetUrl(routine.song_url)}
          onEnded={() => {
            if (loopRef.current) {
              cancelAnimationFrame(loopRef.current);
              loopRef.current = null;
            }
            void finishSession();
          }}
        />
        <div className="grid">
          <div className="results">
            <div>Score: {score}</div>
            <div>Combo: {combo}</div>
            <div>Max combo: {maxCombo}</div>
            <div>Time: {(currentMs / 1000).toFixed(1)}s</div>
            <div>Target: {livePanelText}</div>
            <div>Pose sim: {livePoseSim.toFixed(2)}</div>
            <div>Timing: {liveTimingOffset} ms</div>
            <div>Last: {lastJudgement}</div>
          </div>
          <div style={{ display: "grid", gap: "0.55rem", alignContent: "start" }}>
            <button disabled={isPlaying || isSubmitting} onClick={handleStart}>
              {isPlaying ? "Playing..." : "Start Song"}
            </button>
            <button
              className="secondary"
              disabled={!isPlaying || isSubmitting}
              onClick={() => {
                audioRef.current?.pause();
                if (loopRef.current) {
                  cancelAnimationFrame(loopRef.current);
                  loopRef.current = null;
                }
                void finishSession();
              }}
            >
              End Session
            </button>
            {webcamError ? <div className="pill warn">{webcamError}</div> : null}
            {error ? <div className="pill warn">{error}</div> : null}
            {finalGrade ? <div className="pill success">Grade: {finalGrade}</div> : null}
          </div>
        </div>
      </section>
    </main>
  );
}
