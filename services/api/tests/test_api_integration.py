from __future__ import annotations

import shutil
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def _fake_frame() -> list[list[float]]:
    return [
        [0.0, 1.2, 1.0],
        [-0.08, 1.28, 1.0],
        [0.08, 1.28, 1.0],
        [-0.15, 1.24, 1.0],
        [0.15, 1.24, 1.0],
        [-0.25, 1.0, 1.0],
        [0.25, 1.0, 1.0],
        [-0.45, 0.75, 1.0],
        [0.45, 0.75, 1.0],
        [-0.58, 0.5, 1.0],
        [0.58, 0.5, 1.0],
        [-0.2, 0.2, 1.0],
        [0.2, 0.2, 1.0],
        [-0.24, -0.35, 1.0],
        [0.24, -0.35, 1.0],
        [-0.28, -0.95, 1.0],
        [0.28, -0.95, 1.0],
    ]


def test_upload_to_routine_generation_flow(monkeypatch):
    import app.audio as audio
    import app.jobs as jobs
    import app.main as main_mod

    def fake_transcode(input_path: Path, output_path: Path, sample_rate: int = 48_000) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(input_path, output_path)

    def fake_probe_duration(_wav_path: Path) -> float:
        return 30.0

    class FakeMotion:
        def __init__(self, fps: int):
            self.fps = fps
            self.joint_layout = "coco17"
            self.frames_3d = [_fake_frame() for _ in range(30 * fps)]
            self.frames_2d = [_fake_frame() for _ in range(30 * fps)]

    def fake_generate_motion_frames(
        *,
        worker_url: str,
        song_path: Path,
        difficulty: int,
        fps: int,
        chunk_seconds: int,
        overlap_seconds: int,
        checkpoint_path: str | None,
    ):
        return FakeMotion(fps)

    monkeypatch.setattr(audio, "transcode_to_wav", fake_transcode)
    monkeypatch.setattr(audio, "probe_duration_seconds", fake_probe_duration)
    monkeypatch.setattr(main_mod, "transcode_to_wav", fake_transcode)
    monkeypatch.setattr(main_mod, "probe_duration_seconds", fake_probe_duration)
    monkeypatch.setattr(jobs, "generate_motion_frames", fake_generate_motion_frames)

    client = TestClient(app)
    upload_res = client.post(
        "/api/songs/upload",
        files={"file": ("demo.wav", b"RIFFFAKEWAVDATA", "audio/wav")},
    )
    assert upload_res.status_code == 200
    song_id = upload_res.json()["song_id"]

    routine_res = client.post(
        "/api/routines/generate",
        json={"song_id": song_id, "difficulty": 55},
    )
    assert routine_res.status_code == 200
    routine_id = routine_res.json()["routine_id"]

    status = "queued"
    routine_payload = {}
    for _ in range(20):
        poll_res = client.get(f"/api/routines/{routine_id}")
        assert poll_res.status_code == 200
        routine_payload = poll_res.json()
        status = routine_payload["status"]
        if status in {"succeeded", "failed"}:
            break
        time.sleep(0.1)

    assert status == "succeeded"
    assert routine_payload["panels"]
    assert routine_payload["preview_joint_layout"] == "coco17"
