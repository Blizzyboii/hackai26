from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import requests


class EdgeError(Exception):
    def __init__(self, message: str, code: str = "EDGE_FAILED") -> None:
        self.code = code
        super().__init__(message)


@dataclass
class EdgeMotionResult:
    fps: int
    joint_layout: str
    frames_3d: list[list[list[float]]]
    frames_2d: list[list[list[float]]]


def generate_motion_frames(
    *,
    worker_url: str,
    song_path: Path,
    difficulty: int,
    fps: int,
    chunk_seconds: int,
    overlap_seconds: int,
    checkpoint_path: str | None,
) -> EdgeMotionResult:
    payload = {
        "song_path": str(song_path),
        "difficulty": difficulty,
        "fps": fps,
        "chunk_seconds": chunk_seconds,
        "overlap_seconds": overlap_seconds,
        "checkpoint_path": checkpoint_path,
    }
    try:
        response = requests.post(f"{worker_url}/generate", json=payload, timeout=300)
    except requests.RequestException as exc:
        raise EdgeError("failed to connect to EDGE worker", code="EDGE_UNAVAILABLE") from exc

    if response.status_code >= 400:
        try:
            data = response.json()
            detail = data.get("detail", "")
        except Exception:
            detail = ""
        code = "EDGE_UNAVAILABLE" if response.status_code == 503 else "EDGE_FAILED"
        raise EdgeError(f"EDGE worker error ({response.status_code}) {detail}".strip(), code=code)

    data = response.json()
    frames_3d = data.get("frames_3d")
    frames_2d = data.get("frames_2d")
    fps_out = data.get("fps")
    joint_layout = data.get("joint_layout", "coco17")
    if not isinstance(frames_3d, list) or not frames_3d:
        raise EdgeError("EDGE worker returned invalid frame data")
    if not isinstance(frames_2d, list) or not frames_2d:
        raise EdgeError("EDGE worker returned invalid 2D frame data")
    if not isinstance(fps_out, int):
        raise EdgeError("EDGE worker returned invalid fps")
    return EdgeMotionResult(
        fps=fps_out,
        joint_layout=str(joint_layout),
        frames_3d=frames_3d,
        frames_2d=frames_2d,
    )
