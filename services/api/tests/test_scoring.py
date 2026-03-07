from app.choreography import normalize_pose_keypoints
from app.scoring import panel_score, weighted_pose_similarity


def _sample_pose(offset_x: float = 0.0, scale: float = 1.0) -> list[list[float]]:
    points = []
    for i in range(17):
        x = ((i % 4) - 1.5) * 0.2 * scale + offset_x
        y = (i // 4) * 0.2 * scale
        points.append([x, y, 1.0])
    points[5] = [-0.3 * scale + offset_x, 1.0 * scale, 1.0]
    points[6] = [0.3 * scale + offset_x, 1.0 * scale, 1.0]
    points[11] = [-0.2 * scale + offset_x, 0.2 * scale, 1.0]
    points[12] = [0.2 * scale + offset_x, 0.2 * scale, 1.0]
    return points


def test_normalize_pose_translation_and_scale_invariant():
    ref = normalize_pose_keypoints(_sample_pose(offset_x=0.0, scale=1.0))
    shifted = normalize_pose_keypoints(_sample_pose(offset_x=1.2, scale=1.8))
    sim = weighted_pose_similarity(shifted, ref)
    assert sim > 0.995


def test_panel_score_hit_near_miss():
    hit = panel_score(0.95, offset_ms=10, window_ms=200)
    near_miss = panel_score(0.55, offset_ms=190, window_ms=200)
    miss = panel_score(0.1, offset_ms=240, window_ms=200)
    assert hit > near_miss
    assert near_miss > miss
    assert miss <= 10

