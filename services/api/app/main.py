from __future__ import annotations

import json
import logging
import shutil
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.audio import AudioError, probe_duration_seconds, transcode_to_wav
from app.choreography import panel_from_json
from app.database import get_db, init_db
from app.errors import AppError
from app.jobs import generate_routine_job
from app.lyria import LyriaUnavailable, generate_song_from_prompt
from app.models import Panel, Routine, SessionResult, Song
from app.schemas import (
    RoutineGenerateRequest,
    RoutineGenerateResponse,
    RoutineOut,
    SessionCompleteRequest,
    SessionCompleteResponse,
    SessionStartRequest,
    SessionStartResponse,
    SongGenerateRequest,
    SongGenerateResponse,
    SongUploadResponse,
    PanelOut,
)
from app.scoring import rank_grade
from app.settings import get_settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

settings = get_settings()
settings.audio_dir.mkdir(parents=True, exist_ok=True)
settings.thumbs_dir.mkdir(parents=True, exist_ok=True)
settings.motions_dir.mkdir(parents=True, exist_ok=True)
settings.tmp_dir.mkdir(parents=True, exist_ok=True)
init_db()

app = FastAPI(title="Just-Dance API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_origin_regex=settings.api_allowed_origin_regex,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/assets", StaticFiles(directory=str(settings.assets_dir)), name="assets")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _to_asset_url(rel_path: str) -> str:
    return f"/assets/{rel_path.replace('\\', '/')}"


def _assert_audio_extension(filename: str) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in {".mp3", ".wav", ".m4a"}:
        raise AppError(code="AUDIO_INVALID", message="supported formats: mp3, wav, m4a", status_code=400)


@app.exception_handler(AppError)
async def app_error_handler(_request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={"error_code": exc.code, "message": exc.message})


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/songs/upload", response_model=SongUploadResponse)
async def upload_song(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename:
        raise AppError(code="AUDIO_INVALID", message="missing filename", status_code=400)
    _assert_audio_extension(file.filename)

    transcode_t0 = time.perf_counter()
    song_id = str(uuid.uuid4())
    temp_path = settings.tmp_dir / f"{song_id}{Path(file.filename).suffix.lower()}"
    out_path = settings.audio_dir / f"{song_id}.wav"

    with temp_path.open("wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    try:
        transcode_to_wav(temp_path, out_path)
        duration_sec = probe_duration_seconds(out_path)
    except AudioError:
        raise AppError(code="AUDIO_INVALID", message="failed to process uploaded audio", status_code=400)
    finally:
        temp_path.unlink(missing_ok=True)

    if duration_sec > settings.api_max_duration_sec:
        out_path.unlink(missing_ok=True)
        raise AppError(
            code="AUDIO_INVALID",
            message=f"audio exceeds max duration of {settings.api_max_duration_sec}s",
            status_code=400,
        )

    db.add(
        Song(
            id=song_id,
            source="upload",
            duration_sec=duration_sec,
            wav_path=str(out_path),
        )
    )
    db.commit()
    logger.info("song=%s upload_transcode_ms=%d", song_id, int((time.perf_counter() - transcode_t0) * 1000))
    return SongUploadResponse(song_id=song_id, duration_sec=duration_sec)


@app.post("/api/songs/generate", response_model=SongGenerateResponse)
def generate_song(payload: SongGenerateRequest, db: Session = Depends(get_db)):
    if payload.target_duration_sec > settings.api_max_duration_sec:
        raise AppError(
            code="AUDIO_INVALID",
            message=f"target_duration_sec must be <= {settings.api_max_duration_sec}",
            status_code=400,
        )

    song_id = str(uuid.uuid4())
    generation_t0 = time.perf_counter()
    try:
        result = generate_song_from_prompt(
            prompt=payload.prompt,
            genre=payload.genre,
            mood=payload.mood,
            target_duration_sec=payload.target_duration_sec,
            settings=settings,
        )
    except LyriaUnavailable as exc:
        raise AppError(code="LYRIA_UNAVAILABLE", message=str(exc), status_code=503)

    out_path = settings.audio_dir / f"{song_id}.wav"
    out_path.write_bytes(result.wav_bytes)

    try:
        duration_sec = probe_duration_seconds(out_path)
    except AudioError:
        out_path.unlink(missing_ok=True)
        raise AppError(code="AUDIO_INVALID", message="generated audio is invalid", status_code=500)

    db.add(
        Song(
            id=song_id,
            source="lyria",
            duration_sec=duration_sec,
            wav_path=str(out_path),
        )
    )
    db.commit()
    logger.info("song=%s generation_ms=%d", song_id, int((time.perf_counter() - generation_t0) * 1000))
    return SongGenerateResponse(song_id=song_id, duration_sec=duration_sec, clips_used=result.clip_count)


@app.post("/api/routines/generate", response_model=RoutineGenerateResponse)
def generate_routine(payload: RoutineGenerateRequest, bg: BackgroundTasks, db: Session = Depends(get_db)):
    song = db.get(Song, payload.song_id)
    if not song:
        raise HTTPException(status_code=404, detail="song not found")

    routine_id = str(uuid.uuid4())
    routine = Routine(
        id=routine_id,
        song_id=song.id,
        difficulty=payload.difficulty,
        fps=30,
        pose_threshold=0.45,
        status="queued",
    )
    db.add(routine)
    db.commit()

    bg.add_task(generate_routine_job, routine_id)
    return RoutineGenerateResponse(routine_id=routine_id, status="queued")


@app.get("/api/routines/{routine_id}", response_model=RoutineOut)
def get_routine(routine_id: str, db: Session = Depends(get_db)):
    routine = db.get(Routine, routine_id)
    if not routine:
        raise HTTPException(status_code=404, detail="routine not found")
    song = db.get(Song, routine.song_id)
    if not song:
        raise HTTPException(status_code=500, detail="routine song missing")

    panels_rows = db.execute(select(Panel).where(Panel.routine_id == routine.id).order_by(Panel.panel_index)).scalars()
    panels = [
        PanelOut(
            index=row.panel_index,
            target_ms=row.target_ms,
            window_ms=row.window_ms,
            ref_keypoints=panel_from_json(row.ref_keypoints_json),
            ref_keypoints_3d=panel_from_json(row.ref_keypoints_3d_json),
            thumbnail_url=_to_asset_url(row.thumbnail_path),
        )
        for row in panels_rows
    ]

    preview_url = _to_asset_url(routine.preview_motion_path) if routine.preview_motion_path else ""

    return RoutineOut(
        routine_id=routine.id,
        song_id=song.id,
        song_url=_to_asset_url(f"audio/{song.id}.wav"),
        difficulty=routine.difficulty,
        fps=routine.fps,
        pose_threshold=routine.pose_threshold,
        preview_motion_url=preview_url,
        preview_fps=routine.preview_fps,
        preview_joint_layout=routine.preview_joint_layout,
        status=routine.status,
        error_code=routine.error_code,
        panels=panels,
    )


@app.post("/api/sessions/start", response_model=SessionStartResponse)
def start_session(payload: SessionStartRequest, db: Session = Depends(get_db)):
    routine = db.get(Routine, payload.routine_id)
    if not routine:
        raise HTTPException(status_code=404, detail="routine not found")
    if routine.status != "succeeded":
        raise AppError(code="ROUTINE_NOT_READY", message="routine must be succeeded before play", status_code=409)

    session_id = str(uuid.uuid4())
    started = _utc_now()
    db.add(SessionResult(id=session_id, routine_id=routine.id, status="started", started_at=started))
    db.commit()
    return SessionStartResponse(session_id=session_id, started_at=started)


@app.post("/api/sessions/{session_id}/complete", response_model=SessionCompleteResponse)
def complete_session(session_id: str, payload: SessionCompleteRequest, db: Session = Depends(get_db)):
    save_t0 = time.perf_counter()
    session_row = db.get(SessionResult, session_id)
    if not session_row:
        raise HTTPException(status_code=404, detail="session not found")
    if session_row.status == "completed":
        return SessionCompleteResponse(rank_grade=session_row.rank_grade or "D", persisted=True)

    grade = rank_grade(payload.final_score)
    session_row.status = "completed"
    session_row.completed_at = _utc_now()
    session_row.final_score = payload.final_score
    session_row.max_combo = payload.max_combo
    session_row.rank_grade = grade
    session_row.panel_results_json = json.dumps([item.model_dump() for item in payload.panel_results])
    db.commit()
    logger.info("session=%s save_ms=%d", session_id, int((time.perf_counter() - save_t0) * 1000))
    return SessionCompleteResponse(rank_grade=grade, persisted=True)
