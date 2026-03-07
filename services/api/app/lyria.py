from __future__ import annotations

import base64
import logging
import math
import os
from dataclasses import dataclass

import requests

from app.audio import AudioError, generate_mock_song, stitch_wav_clips
from app.settings import Settings

logger = logging.getLogger(__name__)


class LyriaUnavailable(Exception):
    pass


@dataclass
class LyriaGenerationResult:
    wav_bytes: bytes
    clip_count: int


def _google_access_token() -> str:
    token = os.getenv("GOOGLE_OAUTH_ACCESS_TOKEN")
    if token:
        return token

    try:
        import google.auth
        from google.auth.transport.requests import Request
    except ImportError as exc:
        raise LyriaUnavailable("google-auth is not available") from exc

    creds, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    creds.refresh(Request())
    if not creds.token:
        raise LyriaUnavailable("failed to obtain Google OAuth token")
    return creds.token


def _extract_audio_base64(prediction: dict) -> str | None:
    for key in ("bytesBase64Encoded", "audio", "audioBytes"):
        if key in prediction and isinstance(prediction[key], str):
            return prediction[key]
    candidates = prediction.get("candidates")
    if isinstance(candidates, list) and candidates:
        first = candidates[0]
        if isinstance(first, dict):
            for key in ("audio", "bytesBase64Encoded"):
                value = first.get(key)
                if isinstance(value, str):
                    return value
    return None


def _predict_clip(
    *,
    prompt: str,
    seconds: int,
    settings: Settings,
    timeout_sec: int = 120,
) -> bytes:
    if not settings.lyria_project:
        raise LyriaUnavailable("LYRIA_PROJECT is not configured")

    endpoint = (
        f"https://{settings.lyria_location}-aiplatform.googleapis.com/v1/projects/"
        f"{settings.lyria_project}/locations/{settings.lyria_location}/publishers/google/models/"
        f"{settings.lyria_model}:predict"
    )

    payload = {
        "instances": [
            {
                "prompt": prompt,
                "seconds": seconds,
            }
        ],
    }
    headers = {"Authorization": f"Bearer {_google_access_token()}"}
    response = requests.post(endpoint, headers=headers, json=payload, timeout=timeout_sec)
    if response.status_code in (401, 403, 429):
        raise LyriaUnavailable(f"Lyria auth/quota error ({response.status_code})")
    if response.status_code >= 400:
        raise LyriaUnavailable(f"Lyria request failed ({response.status_code})")

    data = response.json()
    predictions = data.get("predictions", [])
    if not predictions:
        raise LyriaUnavailable("Lyria returned no predictions")
    encoded_audio = _extract_audio_base64(predictions[0])
    if not encoded_audio:
        raise LyriaUnavailable("Lyria response missing audio payload")
    try:
        return base64.b64decode(encoded_audio)
    except Exception as exc:
        raise LyriaUnavailable("failed to decode Lyria audio payload") from exc


def generate_song_from_prompt(
    *,
    prompt: str,
    genre: str,
    mood: str,
    target_duration_sec: int,
    settings: Settings,
) -> LyriaGenerationResult:
    final_prompt = f"{prompt}. Genre: {genre}. Mood: {mood}."

    if settings.lyria_enable_mock:
        return LyriaGenerationResult(
            wav_bytes=generate_mock_song(target_duration_sec),
            clip_count=max(1, math.ceil(target_duration_sec / 30)),
        )

    clip_count = max(1, math.ceil(target_duration_sec / 30))
    clips: list[bytes] = []
    for idx in range(clip_count):
        clip_seconds = min(30, target_duration_sec - idx * 30)
        clip_prompt = f"{final_prompt} Segment {idx + 1} of {clip_count}."
        clips.append(_predict_clip(prompt=clip_prompt, seconds=clip_seconds, settings=settings))

    try:
        wav_bytes = stitch_wav_clips(clips, crossfade_ms=250, target_duration_sec=target_duration_sec)
    except AudioError as exc:
        raise LyriaUnavailable("failed to stitch Lyria clips") from exc

    return LyriaGenerationResult(wav_bytes=wav_bytes, clip_count=clip_count)

