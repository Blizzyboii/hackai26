from __future__ import annotations

import io
import wave

import numpy as np
from fastapi.testclient import TestClient

from app.main import app


def _wav_bytes(duration_sec: int = 2, sample_rate: int = 48_000) -> bytes:
    t = np.linspace(0, duration_sec, num=duration_sec * sample_rate, endpoint=False)
    signal = 0.2 * np.sin(2 * np.pi * 220 * t)
    pcm = np.clip(signal * 32767.0, -32768, 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())
    return buf.getvalue()


def test_generate_endpoint(tmp_path):
    audio_path = tmp_path / "song.wav"
    audio_path.write_bytes(_wav_bytes())
    checkpoint_path = tmp_path / "checkpoint.pt"
    checkpoint_path.write_bytes(b"fake")
    script_path = tmp_path / "adapter.py"
    script_path.write_text(
        "import json\n"
        "print(json.dumps({'frames_3d': [[[0.0,0.0,0.0] for _ in range(17)] for _ in range(60)]}))\n"
    )

    client = TestClient(app)
    import os

    os.environ["EDGE_INFER_SCRIPT"] = str(script_path)
    os.environ["EDGE_CHECKPOINT_PATH"] = str(checkpoint_path)
    os.environ["EDGE_REQUIRE_GPU"] = "0"

    res = client.post("/generate", json={"song_path": str(audio_path), "difficulty": 50, "fps": 30})
    assert res.status_code == 200
    data = res.json()
    assert data["fps"] == 30
    assert data["joint_layout"] == "coco17"
    assert len(data["frames_3d"]) == 60
    assert len(data["frames_3d"][0]) == 17
    assert len(data["frames_2d"]) == 60
