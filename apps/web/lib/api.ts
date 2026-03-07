export type SongUploadResponse = {
  song_id: string;
  duration_sec: number;
};

export type SongGenerateResponse = {
  song_id: string;
  duration_sec: number;
  clips_used: number;
};

export type RoutineGenerateResponse = {
  routine_id: string;
  status: string;
};

export type Panel = {
  index: number;
  target_ms: number;
  window_ms: number;
  ref_keypoints: number[][];
  ref_keypoints_3d: number[][];
  thumbnail_url: string;
};

export type Routine = {
  routine_id: string;
  song_id: string;
  song_url: string;
  difficulty: number;
  fps: number;
  pose_threshold: number;
  preview_motion_url: string;
  preview_fps: number;
  preview_joint_layout: "coco17" | string;
  status: "queued" | "running" | "succeeded" | "failed";
  error_code?: string | null;
  panels: Panel[];
};

export type SessionStartResponse = {
  session_id: string;
  started_at: string;
};

export type SessionCompleteResponse = {
  rank_grade: string;
  persisted: boolean;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "/api/proxy";

export function assetUrl(path: string): string {
  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }
  return `${API_BASE}${path}`;
}

async function parseJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const err = await res.json();
      if (err?.message && typeof err.message === "string") {
        message = `${err.error_code ?? "API_ERROR"}: ${err.message}`;
        if (err.detail && typeof err.detail === "string") {
          message = `${message} (${err.detail})`;
        }
      }
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return res.json() as Promise<T>;
}

async function fetchApi(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${path}`, init);
  } catch {
    const origin = typeof window !== "undefined" ? window.location.origin : "your browser origin";
    throw new Error(
      `Load failed: cannot reach API at ${API_BASE}. Verify the API server is running and CORS allows ${origin}.`
    );
  }
}

export async function uploadSong(file: File): Promise<SongUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetchApi("/api/songs/upload", { method: "POST", body: formData });
  return parseJson<SongUploadResponse>(res);
}

export async function generateSong(payload: {
  prompt: string;
  genre: string;
  mood: string;
  target_duration_sec: number;
}): Promise<SongGenerateResponse> {
  const res = await fetchApi("/api/songs/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<SongGenerateResponse>(res);
}

export async function generateRoutine(songId: string, difficulty: number): Promise<RoutineGenerateResponse> {
  const res = await fetchApi("/api/routines/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ song_id: songId, difficulty }),
  });
  return parseJson<RoutineGenerateResponse>(res);
}

export async function getRoutine(routineId: string): Promise<Routine> {
  const res = await fetchApi(`/api/routines/${routineId}`, { cache: "no-store" });
  return parseJson<Routine>(res);
}

export async function startSession(routineId: string): Promise<SessionStartResponse> {
  const res = await fetchApi("/api/sessions/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ routine_id: routineId }),
  });
  return parseJson<SessionStartResponse>(res);
}

export async function completeSession(
  sessionId: string,
  payload: { final_score: number; max_combo: number; panel_results: unknown[] }
): Promise<SessionCompleteResponse> {
  const res = await fetchApi(`/api/sessions/${sessionId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return parseJson<SessionCompleteResponse>(res);
}
