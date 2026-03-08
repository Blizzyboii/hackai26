from __future__ import annotations

import json
import logging
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import delete

from app import choreography
from app.database import session_scope
from app.edge_client import EdgeError, generate_motion_frames
from app.models import Panel, Routine, Song
from app.settings import get_settings

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _nearest_frame(frames: list[list[list[float]]], target_ms: int, fps: int) -> list[list[float]]:
    idx = int(round((target_ms / 1000.0) * fps))
    idx = max(0, min(idx, len(frames) - 1))
    return frames[idx]


def generate_routine_job(routine_id: str) -> None:
    settings = get_settings()

    with session_scope() as db:
        routine = db.get(Routine, routine_id)
        if not routine:
            return
        routine.status = "running"
        routine.error_code = None
        routine.updated_at = _utc_now()

    try:
        with session_scope() as db:
            routine = db.get(Routine, routine_id)
            if not routine:
                return
            song = db.get(Song, routine.song_id)
            if not song:
                routine.status = "failed"
                routine.error_code = "AUDIO_INVALID"
                routine.updated_at = _utc_now()
                return

            params = choreography.difficulty_params(routine.difficulty)
            routine.pose_threshold = params.pose_threshold
            routine.updated_at = _utc_now()

            edge_t0 = time.perf_counter()
            edge_auth_args: dict[str, str] = {}
            if settings.edge_worker_auth_header:
                edge_auth_args["worker_auth_header"] = settings.edge_worker_auth_header
            elif settings.edge_worker_username:
                edge_auth_args["worker_username"] = settings.edge_worker_username
                if settings.edge_worker_password:
                    edge_auth_args["worker_password"] = settings.edge_worker_password
            motion = generate_motion_frames(
                worker_url=settings.edge_worker_url,
                song_path=Path(song.wav_path),
                difficulty=routine.difficulty,
                fps=routine.fps,
                chunk_seconds=settings.edge_chunk_seconds,
                overlap_seconds=settings.edge_overlap_seconds,
                checkpoint_path=settings.edge_checkpoint_path,
                **edge_auth_args,
            )
            logger.info("routine=%s edge_ms=%d", routine.id, int((time.perf_counter() - edge_t0) * 1000))

            motion_3d_rel = f"motions/{routine.id}_motion_3d.json"
            motion_2d_rel = f"motions/{routine.id}_motion_2d.json"
            motion_3d_abs = settings.assets_dir / motion_3d_rel
            motion_2d_abs = settings.assets_dir / motion_2d_rel
            motion_3d_abs.parent.mkdir(parents=True, exist_ok=True)
            motion_2d_abs.parent.mkdir(parents=True, exist_ok=True)
            motion_3d_abs.write_text(
                json.dumps(
                    {"fps": motion.fps, "joint_layout": motion.joint_layout, "frames": motion.frames_3d},
                    separators=(",", ":"),
                )
            )
            motion_2d_abs.write_text(
                json.dumps(
                    {"fps": motion.fps, "joint_layout": motion.joint_layout, "frames": motion.frames_2d},
                    separators=(",", ":"),
                )
            )
            routine.preview_motion_path = motion_3d_rel
            routine.scoring_motion_path = motion_2d_rel
            routine.fps = motion.fps
            routine.preview_fps = motion.fps
            routine.preview_joint_layout = motion.joint_layout

            onsets_t0 = time.perf_counter()
            onset_candidates = choreography.extract_onset_candidates(Path(song.wav_path), song.duration_sec)
            panel_times = choreography.choose_panel_times(
                onset_candidates,
                duration_sec=song.duration_sec,
                panels_per_min=params.panels_per_min,
                min_gap_ms=params.min_gap_ms,
            )
            panel_times = choreography.filter_panel_times_by_pose_novelty(
                panel_times,
                motion.frames_2d,
                routine.fps,
                novelty_similarity_max=0.95,
                minimum_keep=4,
            )
            logger.info(
                "routine=%s panel_select_ms=%d count=%d",
                routine.id,
                int((time.perf_counter() - onsets_t0) * 1000),
                len(panel_times),
            )

            db.execute(delete(Panel).where(Panel.routine_id == routine.id))
            for idx, target_ms in enumerate(panel_times):
                raw_pose_2d = _nearest_frame(motion.frames_2d, target_ms, routine.fps)
                normalized_2d = choreography.normalize_pose_keypoints(raw_pose_2d)
                raw_pose_3d = _nearest_frame(motion.frames_3d, target_ms, routine.fps)
                thumb_rel = f"thumbnails/{routine.id}_{idx}.png"
                thumb_abs = settings.assets_dir / thumb_rel
                choreography.render_panel_thumbnail(normalized_2d, thumb_abs)

                db.add(
                    Panel(
                        routine_id=routine.id,
                        panel_index=idx,
                        target_ms=target_ms,
                        window_ms=params.window_ms,
                        ref_keypoints_json=choreography.panel_to_json(normalized_2d),
                        ref_keypoints_3d_json=choreography.panel_to_json(raw_pose_3d),
                        thumbnail_path=thumb_rel,
                    )
                )

            routine.status = "succeeded"
            routine.updated_at = _utc_now()

    except EdgeError as exc:
        logger.exception("EDGE generation failed for routine=%s", routine_id)
        with session_scope() as db:
            routine = db.get(Routine, routine_id)
            if routine:
                routine.status = "failed"
                routine.error_code = exc.code
                routine.updated_at = _utc_now()
        return
    except Exception:
        logger.exception("Unhandled routine generation error routine=%s", routine_id)
        with session_scope() as db:
            routine = db.get(Routine, routine_id)
            if routine:
                routine.status = "failed"
                routine.error_code = "EDGE_FAILED"
                routine.updated_at = _utc_now()
