from app.choreography import difficulty_params


def test_difficulty_bounds():
    low = difficulty_params(0)
    high = difficulty_params(100)
    assert low.panels_per_min == 8
    assert high.panels_per_min == 28
    assert low.min_gap_ms == 2400
    assert high.min_gap_ms == 1000
    assert low.window_ms == 450
    assert high.window_ms == 160
    assert abs(low.pose_threshold - 0.32) < 1e-6
    assert abs(high.pose_threshold - 0.6) < 1e-6


def test_difficulty_monotonicity():
    prev = difficulty_params(0)
    for value in range(1, 101):
        curr = difficulty_params(value)
        assert curr.panels_per_min >= prev.panels_per_min
        assert curr.min_gap_ms <= prev.min_gap_ms
        assert curr.window_ms <= prev.window_ms
        assert curr.pose_threshold >= prev.pose_threshold
        prev = curr
