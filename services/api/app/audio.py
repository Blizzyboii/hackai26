from __future__ import annotations

import io
import math
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import resample_poly


class AudioError(Exception):
    pass


def transcode_to_wav(input_path: Path, output_path: Path, sample_rate: int = 48_000) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        str(output_path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True)
    if proc.returncode != 0:
        raise AudioError("ffmpeg failed while transcoding audio")


def probe_duration_seconds(wav_path: Path) -> float:
    try:
        with wave.open(str(wav_path), "rb") as wav_file:
            frames = wav_file.getnframes()
            rate = wav_file.getframerate()
        if rate == 0:
            raise AudioError("invalid WAV sample rate")
        return frames / float(rate)
    except (wave.Error, OSError) as exc:
        raise AudioError("failed to probe audio duration") from exc


def _wav_bytes_to_float32(wav_bytes: bytes, target_sr: int) -> np.ndarray:
    rate, data = wavfile.read(io.BytesIO(wav_bytes))
    if data.ndim > 1:
        data = data.mean(axis=1)
    data = data.astype(np.float32)
    if np.max(np.abs(data)) > 1.0:
        data /= 32768.0
    if rate != target_sr:
        gcd = math.gcd(rate, target_sr)
        up = target_sr // gcd
        down = rate // gcd
        data = resample_poly(data, up, down).astype(np.float32)
    return data


def stitch_wav_clips(
    clips: list[bytes],
    *,
    target_sr: int = 48_000,
    crossfade_ms: int = 250,
    target_duration_sec: int | None = None,
) -> bytes:
    if not clips:
        raise AudioError("no clips provided")

    clip_data = [_wav_bytes_to_float32(clip, target_sr=target_sr) for clip in clips]
    crossfade_samples = int(target_sr * (crossfade_ms / 1000.0))
    mixed = clip_data[0]

    for next_clip in clip_data[1:]:
        if crossfade_samples > 0 and len(mixed) > crossfade_samples and len(next_clip) > crossfade_samples:
            fade_out = np.linspace(1.0, 0.0, crossfade_samples, dtype=np.float32)
            fade_in = 1.0 - fade_out
            overlap = mixed[-crossfade_samples:] * fade_out + next_clip[:crossfade_samples] * fade_in
            mixed = np.concatenate([mixed[:-crossfade_samples], overlap, next_clip[crossfade_samples:]])
        else:
            mixed = np.concatenate([mixed, next_clip])

    if target_duration_sec is not None:
        target_samples = target_duration_sec * target_sr
        if len(mixed) > target_samples:
            mixed = mixed[:target_samples]

    int16 = np.clip(mixed * 32767.0, -32768, 32767).astype(np.int16)
    output = io.BytesIO()
    wavfile.write(output, target_sr, int16)
    return output.getvalue()


def generate_mock_song(duration_sec: int, sample_rate: int = 48_000) -> bytes:
    t = np.linspace(0, duration_sec, num=duration_sec * sample_rate, endpoint=False)
    signal = 0.25 * np.sin(2 * np.pi * 220 * t) + 0.15 * np.sin(2 * np.pi * 440 * t)
    int16 = np.clip(signal * 32767.0, -32768, 32767).astype(np.int16)
    output = io.BytesIO()
    wavfile.write(output, sample_rate, int16)
    return output.getvalue()
