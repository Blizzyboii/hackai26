from __future__ import annotations

from contextlib import contextmanager

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.settings import get_settings


class Base(DeclarativeBase):
    pass


settings = get_settings()
settings.data_dir.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{settings.db_path}", echo=False, future=True)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)


def init_db() -> None:
    from app import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _apply_sqlite_migrations()


def _sqlite_columns(table_name: str) -> set[str]:
    with engine.connect() as conn:
        rows = conn.execute(text(f"PRAGMA table_info({table_name})")).all()
    return {row[1] for row in rows}


def _apply_sqlite_migrations() -> None:
    routines_columns = _sqlite_columns("routines")
    panels_columns = _sqlite_columns("panels")
    statements: list[str] = []

    if "preview_motion_path" not in routines_columns:
        statements.append("ALTER TABLE routines ADD COLUMN preview_motion_path TEXT")
    if "scoring_motion_path" not in routines_columns:
        statements.append("ALTER TABLE routines ADD COLUMN scoring_motion_path TEXT")
    if "preview_fps" not in routines_columns:
        statements.append("ALTER TABLE routines ADD COLUMN preview_fps INTEGER NOT NULL DEFAULT 30")
    if "preview_joint_layout" not in routines_columns:
        statements.append("ALTER TABLE routines ADD COLUMN preview_joint_layout VARCHAR(32) NOT NULL DEFAULT 'coco17'")
    if "ref_keypoints_3d_json" not in panels_columns:
        statements.append("ALTER TABLE panels ADD COLUMN ref_keypoints_3d_json TEXT NOT NULL DEFAULT '[]'")

    if statements:
        with engine.begin() as conn:
            for stmt in statements:
                conn.execute(text(stmt))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@contextmanager
def session_scope():
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
