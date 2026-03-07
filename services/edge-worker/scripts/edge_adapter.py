#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import pickle
import shutil
import subprocess
import sys
import tempfile
import wave
from pathlib import Path

import numpy as np

COCO17_COUNT = 17
SMPL24_COUNT = 24


def _resolve_checkpoint(path: Path) -> Path:
    if path.is_file():
        return path
    if not path.is_dir():
        raise RuntimeError(f"checkpoint path not found: {path}")

    preferred_name = os.getenv("EDGE_CHECKPOINT_NAME", "").strip()
    if preferred_name:
        preferred = path / preferred_name
        if preferred.exists() and preferred.is_file():
            return preferred

    candidates: list[Path] = []
    for pattern in ("*.pt", "*.pth", "*.ckpt", "*.tar"):
        candidates.extend(sorted(path.glob(pattern)))
    if not candidates:
        raise RuntimeError(f"no checkpoint file found in directory: {path}")
    return candidates[0]


def _wav_duration_seconds(path: Path) -> float:
    with wave.open(str(path), "rb") as wf:
        frame_rate = wf.getframerate()
        frame_count = wf.getnframes()
        if frame_rate <= 0:
            raise RuntimeError("invalid wav framerate")
    return frame_count / float(frame_rate)


def _run_edge_test_py(song_path: Path, checkpoint_path: Path, out_length_seconds: int) -> dict:
    edge_repo_dir = Path(os.getenv("EDGE_REPO_PATH", "/opt/EDGE")).resolve()
    test_py = edge_repo_dir / "test.py"
    if not test_py.exists():
        raise RuntimeError(f"EDGE test.py not found at {test_py}")
    resolved_checkpoint = _resolve_checkpoint(checkpoint_path)

    feature_type = os.getenv("EDGE_FEATURE_TYPE", "").strip()
    with tempfile.TemporaryDirectory(prefix="edge_adapter_") as tmp:
        temp_root = Path(tmp)
        music_dir = temp_root / "music"
        motion_dir = temp_root / "motions"
        music_dir.mkdir(parents=True, exist_ok=True)
        motion_dir.mkdir(parents=True, exist_ok=True)
        music_file = music_dir / "input.wav"
        shutil.copy(song_path, music_file)

        edge_python_bin = os.getenv("EDGE_PYTHON_BIN", "").strip() or sys.executable
        cmd = [
            edge_python_bin,
            str(test_py),
            "--music_dir",
            str(music_dir),
            "--checkpoint",
            str(resolved_checkpoint),
            "--save_motions",
            "--motion_save_dir",
            str(motion_dir),
            "--no_render",
            "--out_length",
            str(max(5, out_length_seconds)),
        ]
        if feature_type:
            cmd.extend(["--feature_type", feature_type])

        proc = subprocess.run(cmd, cwd=str(edge_repo_dir), capture_output=True, text=True)
        if proc.returncode != 0:
            stderr = proc.stderr.strip()
            stdout = proc.stdout.strip()
            detail = stderr or stdout or "EDGE test.py failed"
            raise RuntimeError(detail)

        pkl_files = sorted(motion_dir.glob("*.pkl"), key=lambda item: item.stat().st_mtime)
        if not pkl_files:
            raise RuntimeError("EDGE did not write motion pickle output")
        latest = pkl_files[-1]
        with latest.open("rb") as fp:
            payload = pickle.load(fp)
        if not isinstance(payload, dict):
            raise RuntimeError("EDGE motion output is not a dict")
        return payload


def _smpl_frame_to_coco17(frame24: np.ndarray) -> list[list[float]]:
    if frame24.shape[0] < SMPL24_COUNT or frame24.shape[1] < 3:
        raise RuntimeError("EDGE frame does not contain SMPL24 xyz joints")

    left_shoulder = frame24[16, :3]
    right_shoulder = frame24[17, :3]
    neck = frame24[12, :3]
    head = frame24[15, :3]

    side = left_shoulder - right_shoulder
    side_norm = float(np.linalg.norm(side))
    if side_norm < 1e-5:
        side_unit = np.array([1.0, 0.0, 0.0], dtype=np.float32)
    else:
        side_unit = side / side_norm
    up = head - neck
    up_norm = float(np.linalg.norm(up))
    if up_norm < 1e-5:
        up_unit = np.array([0.0, 1.0, 0.0], dtype=np.float32)
    else:
        up_unit = up / up_norm

    eye_offset = side_unit * 0.03 + up_unit * 0.02
    ear_offset = side_unit * 0.055
    left_eye = head + eye_offset
    right_eye = head - eye_offset
    left_ear = head + ear_offset
    right_ear = head - ear_offset

    points = [
        head,  # nose
        left_eye,
        right_eye,
        left_ear,
        right_ear,
        frame24[16, :3],  # left shoulder
        frame24[17, :3],  # right shoulder
        frame24[18, :3],  # left elbow
        frame24[19, :3],  # right elbow
        frame24[20, :3],  # left wrist
        frame24[21, :3],  # right wrist
        frame24[1, :3],  # left hip
        frame24[2, :3],  # right hip
        frame24[4, :3],  # left knee
        frame24[5, :3],  # right knee
        frame24[7, :3],  # left ankle
        frame24[8, :3],  # right ankle
    ]
    return [[float(p[0]), float(p[1]), float(p[2])] for p in points]


def _convert_payload_to_coco17_frames(payload: dict) -> list[list[list[float]]]:
    raw = payload.get("full_pose")
    if raw is None:
        raise RuntimeError("EDGE motion payload missing full_pose")

    arr = np.asarray(raw, dtype=np.float32)
    if arr.ndim == 4 and arr.shape[0] == 1:
        arr = arr[0]
    if arr.ndim != 3:
        raise RuntimeError("EDGE full_pose has invalid rank")
    if arr.shape[1] < SMPL24_COUNT or arr.shape[2] < 3:
        raise RuntimeError("EDGE full_pose must be [frames,24,3]")

    frames: list[list[list[float]]] = []
    for frame in arr:
        coco = _smpl_frame_to_coco17(frame)
        if len(coco) != COCO17_COUNT:
            raise RuntimeError("EDGE coco conversion produced invalid joint count")
        frames.append(coco)
    if not frames:
        raise RuntimeError("EDGE output contains zero frames")
    return frames


def _resample_frames(frames: list[list[list[float]]], source_fps: float, target_fps: int) -> list[list[list[float]]]:
    if source_fps <= 0:
        source_fps = 30.0
    if target_fps <= 0:
        target_fps = int(round(source_fps))
    if abs(source_fps - float(target_fps)) < 1e-3:
        return frames

    src_count = len(frames)
    target_count = max(1, int(round(src_count * float(target_fps) / source_fps)))
    indices = np.linspace(0, src_count - 1, num=target_count)
    out: list[list[list[float]]] = []
    for idx in indices:
        src_idx = int(round(float(idx)))
        src_idx = max(0, min(src_idx, src_count - 1))
        out.append(frames[src_idx])
    return out


def _fit_frame_count(frames: list[list[list[float]]], target_count: int) -> list[list[list[float]]]:
    if target_count <= 0:
        return frames
    if len(frames) == target_count:
        return frames
    if len(frames) > target_count:
        return frames[:target_count]
    if not frames:
        raise RuntimeError("cannot pad empty frame list")
    padded = list(frames)
    while len(padded) < target_count:
        padded.append(padded[-1])
    return padded


def run_edge_inference(song_path: Path, checkpoint_path: Path, fps: int, difficulty: int) -> list[list[list[float]]]:
    del difficulty  # reserved for future EDGE conditioning

    duration_sec = _wav_duration_seconds(song_path)
    out_length = max(5, int(round(duration_sec)))
    payload = _run_edge_test_py(song_path=song_path, checkpoint_path=checkpoint_path, out_length_seconds=out_length)
    frames = _convert_payload_to_coco17_frames(payload)

    source_fps = float(payload.get("fps") or 30.0)
    frames = _resample_frames(frames, source_fps=source_fps, target_fps=fps)
    target_count = max(1, int(round(duration_sec * fps)))
    frames = _fit_frame_count(frames, target_count=target_count)
    return frames


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--song_path", required=True)
    parser.add_argument("--checkpoint_path", required=True)
    parser.add_argument("--fps", type=int, required=True)
    parser.add_argument("--difficulty", type=int, required=True)
    args = parser.parse_args()

    frames = run_edge_inference(
        song_path=Path(args.song_path),
        checkpoint_path=Path(args.checkpoint_path),
        fps=args.fps,
        difficulty=args.difficulty,
    )
    print(json.dumps({"frames_3d": frames}))


if __name__ == "__main__":
    main()
