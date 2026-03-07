from __future__ import annotations

import shutil
import time
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


def test_lyria_unavailable_returns_explicit_error(monkeypatch):
    import app.main as main_mod
    from app.lyria import LyriaUnavailable

    def fake_generate_song_from_prompt(*args, **kwargs):
        raise LyriaUnavailable("quota exceeded")

    monkeypatch.setattr(main_mod, "generate_song_from_prompt", fake_generate_song_from_prompt)
    client = TestClient(app)
    res = client.post(
        "/api/songs/generate",
        json={
            "prompt": "driving synth groove",
            "genre": "electronic",
            "mood": "energetic",
            "target_duration_sec": 60,
        },
    )
    assert res.status_code == 503
    payload = res.json()
    assert payload["error_code"] == "LYRIA_UNAVAILABLE"


def test_edge_failure_marks_routine_failed(monkeypatch):
    import app.audio as audio
    import app.jobs as jobs
    import app.main as main_mod
    from app.edge_client import EdgeError

    def fake_transcode(input_path: Path, output_path: Path, sample_rate: int = 48_000) -> None:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(input_path, output_path)

    def fake_probe_duration(_wav_path: Path) -> float:
        return 20.0

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
        raise EdgeError("worker down")

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

    routine_res = client.post("/api/routines/generate", json={"song_id": song_id, "difficulty": 10})
    assert routine_res.status_code == 200
    routine_id = routine_res.json()["routine_id"]

    status = "queued"
    payload = {}
    for _ in range(20):
        poll = client.get(f"/api/routines/{routine_id}")
        assert poll.status_code == 200
        payload = poll.json()
        status = payload["status"]
        if status in {"failed", "succeeded"}:
            break
        time.sleep(0.1)

    assert status == "failed"
    assert payload["error_code"] == "EDGE_FAILED"
