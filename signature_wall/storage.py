from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from pathlib import Path

from .models import BackgroundImageResponse, Point, ScreenState, SignaturePayload, SignatureRecord


class QueueOrderError(Exception):
    pass


class SignatureStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path

    def init_db(self) -> None:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS signatures (
                    sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                    id TEXT NOT NULL UNIQUE,
                    created_at INTEGER NOT NULL,
                    canvas_width INTEGER NOT NULL,
                    canvas_height INTEGER NOT NULL,
                    strokes_json TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('pending', 'background'))
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            conn.commit()

    def create_signature(self, payload: SignaturePayload) -> SignatureRecord:
        signature_id = f"sig_{uuid.uuid4().hex[:12]}"
        created_at = int(time.time() * 1000)
        strokes_json = json.dumps(
            [[point.model_dump() for point in stroke] for stroke in payload.strokes],
            ensure_ascii=False,
        )

        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO signatures (
                    id, created_at, canvas_width, canvas_height, strokes_json, status
                )
                VALUES (?, ?, ?, ?, ?, 'pending')
                """,
                (
                    signature_id,
                    created_at,
                    payload.canvas_width,
                    payload.canvas_height,
                    strokes_json,
                ),
            )
            conn.commit()

        return SignatureRecord(
            id=signature_id,
            created_at=created_at,
            canvas_width=payload.canvas_width,
            canvas_height=payload.canvas_height,
            strokes=payload.strokes,
        )

    def get_signature(self, signature_id: str) -> SignatureRecord | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT id, created_at, canvas_width, canvas_height, strokes_json
                FROM signatures
                WHERE id = ?
                """,
                (signature_id,),
            ).fetchone()

        return self._row_to_record(row) if row else None

    def pending_count(self) -> int:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS count FROM signatures WHERE status = 'pending'"
            ).fetchone()
        return int(row["count"])

    def get_screen_state(self) -> ScreenState:
        with self._connect() as conn:
            background_rows = conn.execute(
                """
                SELECT id, created_at, canvas_width, canvas_height, strokes_json
                FROM signatures
                WHERE status = 'background'
                ORDER BY sequence ASC
                """
            ).fetchall()
            pending_rows = conn.execute(
                """
                SELECT id, created_at, canvas_width, canvas_height, strokes_json
                FROM signatures
                WHERE status = 'pending'
                ORDER BY sequence ASC
                """
            ).fetchall()

        return ScreenState(
            background_signatures=[self._row_to_record(row) for row in background_rows],
            pending_signatures=[self._row_to_record(row) for row in pending_rows],
            background_image_url=self.get_background_image_url(),
        )

    def complete_signature(self, signature_id: str) -> SignatureRecord:
        with self._connect() as conn:
            first_pending = conn.execute(
                """
                SELECT id
                FROM signatures
                WHERE status = 'pending'
                ORDER BY sequence ASC
                LIMIT 1
                """
            ).fetchone()

            if first_pending is None:
                raise KeyError(signature_id)
            if first_pending["id"] != signature_id:
                raise QueueOrderError(signature_id)

            cursor = conn.execute(
                """
                UPDATE signatures
                SET status = 'background'
                WHERE id = ? AND status = 'pending'
                """,
                (signature_id,),
            )
            if cursor.rowcount == 0:
                raise KeyError(signature_id)

            row = conn.execute(
                """
                SELECT id, created_at, canvas_width, canvas_height, strokes_json
                FROM signatures
                WHERE id = ?
                """,
                (signature_id,),
            ).fetchone()
            conn.commit()

        return self._row_to_record(row)

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def get_background_image_url(self) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT value
                FROM settings
                WHERE key = 'background_image_url'
                """
            ).fetchone()
        if row is None:
            return None
        return row["value"]

    def set_background_image_url(self, image_url: str) -> BackgroundImageResponse:
        previous = self.get_background_image_url()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value)
                VALUES ('background_image_url', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (image_url,),
            )
            conn.commit()

        self._delete_previous_background_file(previous, image_url)
        return BackgroundImageResponse(background_image_url=image_url)

    def clear_background_image_url(self) -> BackgroundImageResponse:
        previous = self.get_background_image_url()
        with self._connect() as conn:
            conn.execute("DELETE FROM settings WHERE key = 'background_image_url'")
            conn.commit()
        self._delete_previous_background_file(previous, None)
        return BackgroundImageResponse(background_image_url=None)

    def get_host_ip(self) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT value
                FROM settings
                WHERE key = 'host_ip'
                """
            ).fetchone()
        if row is None:
            return None
        return row["value"]

    def set_host_ip(self, host_ip: str) -> str:
        normalized = host_ip.strip()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value)
                VALUES ('host_ip', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (normalized,),
            )
            conn.commit()
        return normalized

    def clear_signatures(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS count FROM signatures").fetchone()
            conn.execute("DELETE FROM signatures")
            conn.commit()
        return int(row["count"])

    def total_signature_count(self) -> int:
        with self._connect() as conn:
            row = conn.execute("SELECT COUNT(*) AS count FROM signatures").fetchone()
        return int(row["count"])

    def list_all_signatures(self) -> list[SignatureRecord]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT id, created_at, canvas_width, canvas_height, strokes_json
                FROM signatures
                ORDER BY sequence ASC
                """
            ).fetchall()
        return [self._row_to_record(row) for row in rows]

    def get_screen_title(self) -> str:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT value
                FROM settings
                WHERE key = 'screen_title'
                """
            ).fetchone()
        if row is None:
            return "现场签名正在汇聚"
        return row["value"]

    def set_screen_title(self, screen_title: str) -> str:
        normalized = screen_title.strip()
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value)
                VALUES ('screen_title', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (normalized,),
            )
            conn.commit()
        return normalized

    def get_pledge_lines(self) -> list[str]:
        with self._connect() as conn:
            row = conn.execute(
                """
                SELECT value
                FROM settings
                WHERE key = 'pledge_lines'
                """
            ).fetchone()
        if row is None:
            return [
                "依法管水、科学配水、节水优先，守护右江灌区每一滴水",
                "珍惜水资源、使用节水器具、参与灌区节水，让水润万家",
                "小手拉大手，节水一起走，做右江灌区的小小节水宣传员",
            ]
        return json.loads(row["value"])

    def set_pledge_lines(self, pledge_lines: list[str]) -> list[str]:
        normalized = [line.strip() for line in pledge_lines if line.strip()]
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO settings (key, value)
                VALUES ('pledge_lines', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (json.dumps(normalized, ensure_ascii=False),),
            )
            conn.commit()
        return normalized

    def _delete_previous_background_file(self, previous_url: str | None, current_url: str | None) -> None:
        if not previous_url or previous_url == current_url:
            return
        if not previous_url.startswith("/uploads/backgrounds/"):
            return
        relative_path = previous_url.removeprefix("/uploads/")
        file_path = self.db_path.parent / relative_path
        if file_path.exists():
            os.remove(file_path)

    def _row_to_record(self, row: sqlite3.Row) -> SignatureRecord:
        raw_strokes = json.loads(row["strokes_json"])
        strokes = [[Point(**point) for point in stroke] for stroke in raw_strokes]
        return SignatureRecord(
            id=row["id"],
            created_at=row["created_at"],
            canvas_width=row["canvas_width"],
            canvas_height=row["canvas_height"],
            strokes=strokes,
        )
