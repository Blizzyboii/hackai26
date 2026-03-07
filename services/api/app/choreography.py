from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import librosa
import numpy as np
from PIL import Image, ImageDraw


@dataclass
class DifficultyParams:
    panels_per_min: int
    min_gap_ms: int
    window_ms: int
    pose_threshold: float


COCO17_EDGES = [
    (5, 7),
    (7, 9),
    (6, 8),
    (8, 10),
    (5, 6),
    (5, 11),
    (6, 12),
    (11, 12),
    (11, 13),
    (13, 15),
    (12, 14),
    (14, 16),
    (0, 1),
    (0, 2),
    (1, 3),
    (2, 4),
]


def difficulty_params(difficulty: int) -> DifficultyParams:
    d = max(0.0, min(1.0, difficulty / 100.0))
    return DifficultyParams(
        panels_per_min=round(8 + 20 * d),
        min_gap_ms=round(2400 - 1400 * d),
        window_ms=round(450 - 290 * d),
        pose_threshold=0.32 + 0.28 * d,
    )


def extract_onset_candidates(wav_path: Path, duration_sec: float) -> list[int]:
    try:
        y, sr = librosa.load(str(wav_path), sr=48_000, mono=True)
        if y.size == 0:
            raise ValueError("empty waveform")
        onset_frames = librosa.onset.onset_detect(y=y, sr=sr, units="frames")
        onset_times = librosa.frames_to_time(onset_frames, sr=sr)
        candidates = [int(t * 1000) for t in onset_times if 1000 <= t * 1000 <= (duration_sec * 1000 - 1000)]
        if len(candidates) >= 4:
            return sorted(set(candidates))
    except Exception:
        pass

    step_ms = 1200
    end_ms = int(duration_sec * 1000)
    return list(range(1200, max(1201, end_ms - 1200), step_ms))


def choose_panel_times(
    onset_candidates_ms: list[int],
    duration_sec: float,
    panels_per_min: int,
    min_gap_ms: int,
) -> list[int]:
    target_count = max(4, int(round((duration_sec / 60.0) * panels_per_min)))
    selected: list[int] = []
    for candidate in sorted(set(onset_candidates_ms)):
        if selected and candidate - selected[-1] < min_gap_ms:
            continue
        selected.append(candidate)
        if len(selected) >= target_count:
            break

    if len(selected) < target_count:
        start_ms = 1200
        end_ms = max(start_ms + min_gap_ms, int(duration_sec * 1000) - 1200)
        if end_ms <= start_ms:
            return selected
        for value in np.linspace(start_ms, end_ms, target_count, dtype=int):
            if selected and any(abs(value - t) < min_gap_ms for t in selected):
                continue
            selected.append(int(value))
            if len(selected) >= target_count:
                break

    return sorted(selected)


def _pose_similarity_xy(left_pose: list[list[float]], right_pose: list[list[float]]) -> float:
    left = np.array(left_pose, dtype=np.float32)
    right = np.array(right_pose, dtype=np.float32)
    if left.shape != (17, 3) or right.shape != (17, 3):
        return 0.0
    left_xy = left[:, :2].reshape(-1)
    right_xy = right[:, :2].reshape(-1)
    denom = float(np.linalg.norm(left_xy) * np.linalg.norm(right_xy))
    if denom < 1e-6:
        return 0.0
    cosine = float(np.dot(left_xy, right_xy) / denom)
    return max(0.0, min(1.0, (cosine + 1.0) / 2.0))


def _nearest_frame(frames: list[list[list[float]]], target_ms: int, fps: int) -> list[list[float]]:
    idx = int(round((target_ms / 1000.0) * fps))
    idx = max(0, min(idx, len(frames) - 1))
    return frames[idx]


def filter_panel_times_by_pose_novelty(
    panel_times_ms: list[int],
    frames_2d: list[list[list[float]]],
    fps: int,
    *,
    novelty_similarity_max: float = 0.95,
    minimum_keep: int = 4,
) -> list[int]:
    if not panel_times_ms:
        return []

    kept: list[int] = []
    last_pose: list[list[float]] | None = None
    for target_ms in panel_times_ms:
        frame = _nearest_frame(frames_2d, target_ms, fps)
        normalized = normalize_pose_keypoints(frame)
        if last_pose is None:
            kept.append(target_ms)
            last_pose = normalized
            continue
        similarity = _pose_similarity_xy(last_pose, normalized)
        if similarity <= novelty_similarity_max:
            kept.append(target_ms)
            last_pose = normalized

    if len(kept) >= minimum_keep:
        return kept

    unique_original = sorted(set(panel_times_ms))
    fallback = unique_original[: max(minimum_keep, len(kept))]
    return fallback


def normalize_pose_keypoints(keypoints: list[list[float]]) -> list[list[float]]:
    arr = np.array(keypoints, dtype=np.float32)
    if arr.shape != (17, 3):
        raise ValueError("expected 17x3 keypoint shape")

    left_hip = arr[11, :2]
    right_hip = arr[12, :2]
    left_shoulder = arr[5, :2]
    right_shoulder = arr[6, :2]
    hip_center = (left_hip + right_hip) / 2.0
    shoulder_center = (left_shoulder + right_shoulder) / 2.0
    torso_scale = float(np.linalg.norm(shoulder_center - hip_center))
    if torso_scale < 1e-5:
        torso_scale = 1.0

    arr[:, 0] = (arr[:, 0] - hip_center[0]) / torso_scale
    arr[:, 1] = (arr[:, 1] - hip_center[1]) / torso_scale
    arr[:, 2] = np.clip(arr[:, 2], 0.0, 1.0)
    return arr.tolist()


def render_panel_thumbnail(ref_keypoints: list[list[float]], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGB", (320, 240), color=(16, 21, 28))
    draw = ImageDraw.Draw(img)

    points = []
    for x, y, _v in ref_keypoints:
        px = int(160 + x * 42)
        py = int(125 + y * 42)
        points.append((px, py))

    for a, b in COCO17_EDGES:
        draw.line((points[a][0], points[a][1], points[b][0], points[b][1]), fill=(58, 210, 140), width=3)
    for px, py in points:
        draw.ellipse((px - 4, py - 4, px + 4, py + 4), fill=(255, 214, 92))

    img.save(output_path)


def panel_to_json(ref_keypoints: list[list[float]]) -> str:
    return json.dumps(ref_keypoints)


def panel_from_json(ref_keypoints_json: str) -> list[list[float]]:
    return json.loads(ref_keypoints_json)
