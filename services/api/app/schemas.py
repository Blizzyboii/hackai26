from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, conint


class SongUploadResponse(BaseModel):
    song_id: str
    duration_sec: float


class SongGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=400)
    genre: str = Field(min_length=1, max_length=80)
    mood: str = Field(min_length=1, max_length=80)
    target_duration_sec: conint(gt=0, le=180) = 90


class SongGenerateResponse(BaseModel):
    song_id: str
    duration_sec: float
    clips_used: int


class RoutineGenerateRequest(BaseModel):
    song_id: str
    difficulty: conint(ge=0, le=100)


class RoutineGenerateResponse(BaseModel):
    routine_id: str
    status: str


class PanelOut(BaseModel):
    index: int
    target_ms: int
    window_ms: int
    ref_keypoints: list[list[float]]
    ref_keypoints_3d: list[list[float]]
    thumbnail_url: str


class RoutineOut(BaseModel):
    routine_id: str
    song_id: str
    song_url: str
    difficulty: int
    fps: int
    pose_threshold: float
    preview_motion_url: str
    preview_fps: int
    preview_joint_layout: str
    status: str
    error_code: str | None
    panels: list[PanelOut]


class SessionStartRequest(BaseModel):
    routine_id: str


class SessionStartResponse(BaseModel):
    session_id: str
    started_at: datetime


class PanelResultIn(BaseModel):
    index: int
    panel_score: int
    pose_sim: float
    offset_ms: int
    hit: bool


class SessionCompleteRequest(BaseModel):
    final_score: int = Field(ge=0)
    max_combo: int = Field(ge=0)
    panel_results: list[PanelResultIn]


class SessionCompleteResponse(BaseModel):
    rank_grade: str
    persisted: bool
