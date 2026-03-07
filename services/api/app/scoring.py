from __future__ import annotations

import math

import numpy as np

JOINT_WEIGHTS = np.array(
    [
        0.6,  # nose
        0.3,  # left_eye
        0.3,  # right_eye
        0.2,  # left_ear
        0.2,  # right_ear
        1.0,  # left_shoulder
        1.0,  # right_shoulder
        1.0,  # left_elbow
        1.0,  # right_elbow
        1.0,  # left_wrist
        1.0,  # right_wrist
        1.0,  # left_hip
        1.0,  # right_hip
        0.9,  # left_knee
        0.9,  # right_knee
        0.8,  # left_ankle
        0.8,  # right_ankle
    ],
    dtype=np.float32,
)


def weighted_pose_similarity(player: list[list[float]], reference: list[list[float]]) -> float:
    p = np.array(player, dtype=np.float32)
    r = np.array(reference, dtype=np.float32)
    if p.shape != (17, 3) or r.shape != (17, 3):
        return 0.0

    p_xy = p[:, :2].reshape(-1)
    r_xy = r[:, :2].reshape(-1)
    weights = np.repeat(JOINT_WEIGHTS, 2)
    p_weighted = p_xy * weights
    r_weighted = r_xy * weights

    p_norm = np.linalg.norm(p_weighted)
    r_norm = np.linalg.norm(r_weighted)
    if p_norm < 1e-6 or r_norm < 1e-6:
        return 0.0
    cosine = float(np.dot(p_weighted, r_weighted) / (p_norm * r_norm))
    return max(0.0, min(1.0, (cosine + 1.0) / 2.0))


def panel_score(pose_sim: float, offset_ms: int, window_ms: int) -> int:
    time_sim = max(0.0, 1.0 - (abs(offset_ms) / float(max(window_ms, 1))))
    score = round(100 * (0.7 * pose_sim + 0.3 * time_sim))
    return int(max(0, min(100, score)))


def rank_grade(final_score: int) -> str:
    if final_score >= 9000:
        return "S"
    if final_score >= 8000:
        return "A"
    if final_score >= 6500:
        return "B"
    if final_score >= 5000:
        return "C"
    return "D"

