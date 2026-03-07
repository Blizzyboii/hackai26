from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Song(Base):
    __tablename__ = "songs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    duration_sec: Mapped[float] = mapped_column(Float, nullable=False)
    wav_path: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    routines: Mapped[list["Routine"]] = relationship(back_populates="song")


class Routine(Base):
    __tablename__ = "routines"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    song_id: Mapped[str] = mapped_column(ForeignKey("songs.id"), nullable=False)
    difficulty: Mapped[int] = mapped_column(Integer, nullable=False)
    fps: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    pose_threshold: Mapped[float] = mapped_column(Float, default=0.45, nullable=False)
    preview_motion_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    scoring_motion_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_fps: Mapped[int] = mapped_column(Integer, default=30, nullable=False)
    preview_joint_layout: Mapped[str] = mapped_column(String(32), default="coco17", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default="queued", nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)

    song: Mapped[Song] = relationship(back_populates="routines")
    panels: Mapped[list["Panel"]] = relationship(
        back_populates="routine",
        order_by="Panel.panel_index",
        cascade="all, delete-orphan",
    )


class Panel(Base):
    __tablename__ = "panels"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    routine_id: Mapped[str] = mapped_column(ForeignKey("routines.id"), nullable=False, index=True)
    panel_index: Mapped[int] = mapped_column(Integer, nullable=False)
    target_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    window_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    ref_keypoints_json: Mapped[str] = mapped_column(Text, nullable=False)
    ref_keypoints_3d_json: Mapped[str] = mapped_column(Text, nullable=False)
    thumbnail_path: Mapped[str] = mapped_column(Text, nullable=False)

    routine: Mapped[Routine] = relationship(back_populates="panels")


class SessionResult(Base):
    __tablename__ = "session_results"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    routine_id: Mapped[str] = mapped_column(ForeignKey("routines.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), default="started", nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    final_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_combo: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rank_grade: Mapped[str | None] = mapped_column(String(2), nullable=True)
    panel_results_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
