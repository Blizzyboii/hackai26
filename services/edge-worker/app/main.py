from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

app = FastAPI(title="EDGE Worker", version="0.2.0")

COCO17_COUNT = 17


class GenerateRequest(BaseModel):
    song_path: str
    difficulty: int = Field(ge=0, le=100)
    fps: int = Field(gt=0, le=120, default=30)
    chunk_seconds: int = Field(ge=10, le=60, default=24)
    overlap_seconds: int = Field(ge=0, le=20, default=4)
    checkpoint_path: str | None = None


class GenerateResponse(BaseModel):
    fps: int
    joint_layout: str
    frames_3d: list[list[list[float]]]
    frames_2d: list[list[list[float]]]


def _checkpoint_available(path: Path) -> bool:
    if path.is_file():
        return True
    if not path.is_dir():
        return False

    preferred_name = os.getenv("EDGE_CHECKPOINT_NAME", "").strip()
    if preferred_name:
        return (path / preferred_name).is_file()

    for pattern in ("*.pt", "*.pth", "*.ckpt", "*.tar"):
        if any(path.glob(pattern)):
            return True
    return False


def _require_edge_runtime(checkpoint_path: str) -> None:
    script = os.getenv("EDGE_INFER_SCRIPT")
    if not script:
        raise HTTPException(status_code=503, detail="EDGE_INFER_SCRIPT is not configured")
    if not Path(script).exists():
        raise HTTPException(status_code=503, detail=f"EDGE_INFER_SCRIPT not found: {script}")
    if not checkpoint_path:
        raise HTTPException(status_code=503, detail="EDGE checkpoint path is required")
    cp = Path(checkpoint_path)
    if not cp.exists():
        raise HTTPException(status_code=503, detail=f"EDGE checkpoint path not found: {checkpoint_path}")
    if not _checkpoint_available(cp):
        raise HTTPException(status_code=503, detail=f"no checkpoint file found at EDGE_CHECKPOINT_PATH: {checkpoint_path}")

    require_gpu = os.getenv("EDGE_REQUIRE_GPU", "1") == "1"
    if require_gpu:
        probe = subprocess.run(["nvidia-smi", "-L"], capture_output=True, text=True)
        if probe.returncode != 0:
            raise HTTPException(status_code=503, detail="GPU runtime not available for EDGE (nvidia-smi failed)")


def _duration_from_wav(path: Path) -> float:
    with wave.open(str(path), "rb") as wav_file:
        frames = wav_file.getnframes()
        framerate = wav_file.getframerate()
        if framerate == 0:
            raise ValueError("invalid framerate")
    return frames / float(framerate)


def _write_wav_segment(song_path: Path, start_sec: float, end_sec: float, output_path: Path) -> None:
    with wave.open(str(song_path), "rb") as source:
        channels = source.getnchannels()
        sample_width = source.getsampwidth()
        frame_rate = source.getframerate()
        start_frame = int(start_sec * frame_rate)
        end_frame = int(end_sec * frame_rate)
        frame_count = max(0, end_frame - start_frame)
        source.setpos(min(start_frame, source.getnframes()))
        chunk = source.readframes(frame_count)

    with wave.open(str(output_path), "wb") as target:
        target.setnchannels(channels)
        target.setsampwidth(sample_width)
        target.setframerate(frame_rate)
        target.writeframes(chunk)


def _chunk_ranges(duration_sec: float, chunk_seconds: int, overlap_seconds: int) -> list[tuple[float, float]]:
    if overlap_seconds >= chunk_seconds:
        raise HTTPException(status_code=400, detail="overlap_seconds must be < chunk_seconds")
    start = 0.0
    chunks: list[tuple[float, float]] = []
    while start < duration_sec:
        end = min(duration_sec, start + chunk_seconds)
        chunks.append((start, end))
        if end >= duration_sec:
            break
        start = max(0.0, end - overlap_seconds)
    return chunks


def _parse_frames_3d(payload: dict) -> list[list[list[float]]]:
    frames = payload.get("frames_3d", payload.get("frames"))
    if not isinstance(frames, list) or not frames:
        raise RuntimeError("EDGE adapter returned invalid frame list")
    for frame in frames:
        if not isinstance(frame, list) or len(frame) != COCO17_COUNT:
            raise RuntimeError("EDGE adapter returned non-coco17 frame")
        for joint in frame:
            if not isinstance(joint, list) or len(joint) < 3:
                raise RuntimeError("EDGE adapter returned malformed joint coordinates")
    return frames


def _run_edge_script(
    *,
    script_path: str,
    song_chunk_path: Path,
    checkpoint_path: str,
    fps: int,
    difficulty: int,
) -> list[list[list[float]]]:
    cmd = [
        sys.executable,
        script_path,
        "--song_path",
        str(song_chunk_path),
        "--checkpoint_path",
        checkpoint_path,
        "--fps",
        str(fps),
        "--difficulty",
        str(difficulty),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        stderr = proc.stderr.strip() or "unknown adapter error"
        raise RuntimeError(stderr)
    try:
        payload = json.loads(proc.stdout)
    except json.JSONDecodeError as exc:
        raise RuntimeError("EDGE adapter returned non-JSON output") from exc
    return _parse_frames_3d(payload)


def _blend_frames(
    first: list[list[list[float]]],
    second: list[list[list[float]]],
    overlap_frames: int,
) -> list[list[list[float]]]:
    if overlap_frames <= 0 or not first:
        return first + second

    overlap = min(overlap_frames, len(first), len(second))
    if overlap == 0:
        return first + second

    merged: list[list[list[float]]] = first[:-overlap]
    for idx in range(overlap):
        alpha = (idx + 1) / (overlap + 1)
        prev = np.array(first[-overlap + idx], dtype=np.float32)
        nxt = np.array(second[idx], dtype=np.float32)
        blended = (1.0 - alpha) * prev + alpha * nxt
        merged.append(blended.tolist())
    merged.extend(second[overlap:])
    return merged


def _project_frames_to_2d(frames_3d: list[list[list[float]]]) -> list[list[list[float]]]:
    projected: list[list[list[float]]] = []
    for frame in frames_3d:
        frame_2d: list[list[float]] = []
        for x, y, _z in frame:
            # Keep x; invert y so reference uses y-down convention like webcam space.
            frame_2d.append([float(x), float(-y), 1.0])
        projected.append(frame_2d)
    return projected


def _generate_motion(
    *,
    song_path: Path,
    checkpoint_path: str,
    fps: int,
    difficulty: int,
    chunk_seconds: int,
    overlap_seconds: int,
) -> list[list[list[float]]]:
    duration = _duration_from_wav(song_path)
    ranges = _chunk_ranges(duration, chunk_seconds=chunk_seconds, overlap_seconds=overlap_seconds)
    script_path = os.getenv("EDGE_INFER_SCRIPT", "")
    overlap_frames = int(overlap_seconds * fps)

    with tempfile.TemporaryDirectory(prefix="edge_chunks_") as temp_dir:
        temp_root = Path(temp_dir)
        merged_frames: list[list[list[float]]] = []
        for index, (start, end) in enumerate(ranges):
            chunk_path = temp_root / f"chunk_{index:03d}.wav"
            _write_wav_segment(song_path, start_sec=start, end_sec=end, output_path=chunk_path)
            chunk_frames = _run_edge_script(
                script_path=script_path,
                song_chunk_path=chunk_path,
                checkpoint_path=checkpoint_path,
                fps=fps,
                difficulty=difficulty,
            )
            if index == 0:
                merged_frames = chunk_frames
            else:
                merged_frames = _blend_frames(merged_frames, chunk_frames, overlap_frames=overlap_frames)
    return merged_frames


def _run_generation(song_path: Path, payload: GenerateRequest) -> GenerateResponse:
    if not song_path.exists():
        raise HTTPException(status_code=404, detail="song_path not found")

    checkpoint_path = payload.checkpoint_path or os.getenv("EDGE_CHECKPOINT_PATH", "")
    _require_edge_runtime(checkpoint_path)

    try:
        frames_3d = _generate_motion(
            song_path=song_path,
            checkpoint_path=checkpoint_path,
            fps=payload.fps,
            difficulty=payload.difficulty,
            chunk_seconds=payload.chunk_seconds,
            overlap_seconds=payload.overlap_seconds,
        )
    except HTTPException:
        raise
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=f"EDGE inference failed: {exc}") from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Unexpected EDGE generation failure") from exc

    frames_2d = _project_frames_to_2d(frames_3d)
    return GenerateResponse(
        fps=payload.fps,
        joint_layout="coco17",
        frames_3d=frames_3d,
        frames_2d=frames_2d,
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/generate", response_model=GenerateResponse)
def generate(payload: GenerateRequest):
    return _run_generation(Path(payload.song_path), payload)


@app.post("/generate-upload", response_model=GenerateResponse)
async def generate_upload(
    file: UploadFile = File(...),
    difficulty: int = Form(...),
    fps: int = Form(30),
    chunk_seconds: int = Form(24),
    overlap_seconds: int = Form(4),
    checkpoint_path: str | None = Form(None),
):
    payload = GenerateRequest(
        song_path=file.filename or "uploaded.wav",
        difficulty=difficulty,
        fps=fps,
        chunk_seconds=chunk_seconds,
        overlap_seconds=overlap_seconds,
        checkpoint_path=checkpoint_path,
    )
    suffix = Path(file.filename or "uploaded.wav").suffix or ".wav"
    with tempfile.NamedTemporaryFile(prefix="edge_upload_", suffix=suffix, delete=False) as temp_fp:
        temp_path = Path(temp_fp.name)
        content = await file.read()
        temp_fp.write(content)

    try:
        return _run_generation(temp_path, payload)
    finally:
        temp_path.unlink(missing_ok=True)
