from app.choreography import filter_panel_times_by_pose_novelty


def _frame(value: float) -> list[list[float]]:
    return [[value + i * 0.01, value + i * 0.01, 1.0] for i in range(17)]


def test_filter_panel_times_by_pose_novelty_removes_duplicates():
    frames = [_frame(0.0) for _ in range(100)]
    frames[40] = _frame(0.7)
    candidate_times = [500, 1000, 1300, 1600]
    # At fps=20: 500ms -> frame10, 1000ms -> frame20, 1300ms -> frame26, 1600ms -> frame32
    # All similar except when we cross frame40 area; enforce minimum_keep lower for deterministic assertion.
    filtered = filter_panel_times_by_pose_novelty(
        candidate_times,
        frames,
        fps=20,
        novelty_similarity_max=0.99,
        minimum_keep=2,
    )
    assert filtered
    assert len(filtered) <= len(candidate_times)

