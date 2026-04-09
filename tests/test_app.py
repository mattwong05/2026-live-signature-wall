from __future__ import annotations

import io
import tempfile
import zipfile
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from signature_wall.main import app
from signature_wall.storage import SignatureStore


def sample_payload(x_offset: int = 0) -> dict[str, object]:
    return {
        "canvas_width": 800,
        "canvas_height": 400,
        "strokes": [
            [
                {"x": 20 + x_offset, "y": 20, "t": 0},
                {"x": 60 + x_offset, "y": 48, "t": 35},
            ]
        ],
    }


@contextmanager
def isolated_app(tmp_dir: str, with_uploads: bool = False):
    from signature_wall import main as main_module

    original_store = main_module.store
    original_db_path = main_module.DB_PATH
    original_uploads_dir = main_module.UPLOADS_DIR
    original_background_dir = main_module.BACKGROUND_DIR

    try:
        test_db_path = Path(tmp_dir) / "test.db"
        main_module.store = SignatureStore(test_db_path)
        main_module.DB_PATH = test_db_path
        if with_uploads:
            main_module.UPLOADS_DIR = Path(tmp_dir) / "uploads"
            main_module.BACKGROUND_DIR = main_module.UPLOADS_DIR / "backgrounds"
            main_module.BACKGROUND_DIR.mkdir(parents=True, exist_ok=True)
        main_module.store.init_db()

        with TestClient(app) as client:
            yield client, main_module
    finally:
        main_module.store = original_store
        main_module.DB_PATH = original_db_path
        main_module.UPLOADS_DIR = original_uploads_dir
        main_module.BACKGROUND_DIR = original_background_dir


def test_signature_submission_and_playback_completion() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        app.dependency_overrides = {}
        with isolated_app(tmp_dir) as (client, _main_module):
            create_response = client.post("/api/signatures", json=sample_payload())
            assert create_response.status_code == 201
            signature_id = create_response.json()["signature_id"]

            get_response = client.get(f"/api/signatures/{signature_id}")
            assert get_response.status_code == 200
            assert get_response.json()["strokes"][0][1]["t"] == 35

            state_response = client.get("/api/screen-state")
            assert state_response.status_code == 200
            assert len(state_response.json()["pending_signatures"]) == 1

            complete_response = client.post(f"/api/signatures/{signature_id}/complete")
            assert complete_response.status_code == 200

            updated_state = client.get("/api/screen-state").json()
            assert len(updated_state["pending_signatures"]) == 0
            assert len(updated_state["background_signatures"]) == 1

            admin_config = client.get("/api/admin/config")
            assert admin_config.status_code == 200
            assert admin_config.json()["signature_count"] == 1


def test_completion_must_follow_queue_order() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        with isolated_app(tmp_dir) as (client, _main_module):
            first = client.post("/api/signatures", json=sample_payload()).json()["signature_id"]
            second = client.post("/api/signatures", json=sample_payload(100)).json()["signature_id"]

            response = client.post(f"/api/signatures/{second}/complete")
            assert response.status_code == 409

            first_response = client.post(f"/api/signatures/{first}/complete")
            assert first_response.status_code == 200


def test_empty_signature_is_rejected() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        with isolated_app(tmp_dir) as (client, _main_module):
            response = client.post(
                "/api/signatures",
                json={
                    "canvas_width": 800,
                    "canvas_height": 400,
                    "strokes": [],
                },
            )
            assert response.status_code == 400


def test_background_image_setting_round_trip() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        with isolated_app(tmp_dir, with_uploads=True) as (client, _main_module):
            response = client.post(
                "/api/admin/background-image",
                files={"file": ("bg.png", b"fake-image-content", "image/png")},
            )
            assert response.status_code == 200
            image_url = response.json()["background_image_url"]
            assert image_url.startswith("/uploads/backgrounds/background_")

            state_response = client.get("/api/screen-state")
            assert state_response.status_code == 200
            assert state_response.json()["background_image_url"] == image_url

            delete_response = client.delete("/api/admin/background-image")
            assert delete_response.status_code == 200
            assert delete_response.json()["background_image_url"] is None


def test_admin_host_ip_and_clear_signatures() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        with isolated_app(tmp_dir, with_uploads=True) as (client, _main_module):
            config_response = client.put("/api/admin/config/ip", json={"host_ip": "192.168.31.118"})
            assert config_response.status_code == 200
            assert config_response.json()["sign_page_url"] == "http://192.168.31.118:8000/sign"

            qr_response = client.get("/api/admin/sign-qr.svg")
            assert qr_response.status_code == 200
            assert qr_response.headers["content-type"].startswith("image/svg+xml")

            client.post("/api/signatures", json=sample_payload())
            client.post("/api/signatures", json=sample_payload(80))

            clear_response = client.delete("/api/admin/signatures")
            assert clear_response.status_code == 200
            assert clear_response.json()["cleared"] == 2

            state_response = client.get("/api/screen-state")
            assert state_response.status_code == 200
            assert state_response.json()["pending_signatures"] == []
            assert state_response.json()["background_signatures"] == []


def test_admin_screen_title_round_trip() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        with isolated_app(tmp_dir) as (client, _main_module):
            response = client.put("/api/admin/config/title", json={"screen_title": "欢迎来到签名现场"})
            assert response.status_code == 200
            assert response.json()["screen_title"] == "欢迎来到签名现场"

            state_response = client.get("/api/screen-state")
            assert state_response.status_code == 200
            assert state_response.json()["screen_title"] == "欢迎来到签名现场"


def test_pledge_lines_round_trip_and_sign_config() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        with isolated_app(tmp_dir) as (client, _main_module):
            pledge_lines = [
                "依法管水、科学配水、节水优先，守护右江灌区每一滴水",
                "珍惜水资源、使用节水器具、参与灌区节水，让水润万家",
            ]
            response = client.put("/api/admin/config/pledges", json={"pledge_lines": pledge_lines})
            assert response.status_code == 200
            assert response.json()["pledge_lines"] == pledge_lines

            sign_config_response = client.get("/api/sign-config")
            assert sign_config_response.status_code == 200
            assert sign_config_response.json()["pledge_lines"] == pledge_lines


def test_export_signatures_zip_contains_pngs() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        with isolated_app(tmp_dir) as (client, _main_module):
            client.post("/api/signatures", json=sample_payload())
            client.post("/api/signatures", json=sample_payload(120))

            config_response = client.get("/api/admin/config")
            assert config_response.status_code == 200
            assert config_response.json()["signature_count"] == 2

            export_response = client.get("/api/admin/signatures/export")
            assert export_response.status_code == 200
            assert export_response.headers["content-type"].startswith("application/zip")

            archive = zipfile.ZipFile(io.BytesIO(export_response.content))
            names = archive.namelist()
            assert len(names) == 2
            assert all(name.endswith(".png") for name in names)


def test_admin_config_is_not_cacheable() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        with isolated_app(tmp_dir) as (client, _main_module):
            client.post("/api/signatures", json=sample_payload())

            response = client.get("/api/admin/config")
            assert response.status_code == 200
            assert response.json()["signature_count"] == 1
            assert response.headers["cache-control"] == "no-store, no-cache, must-revalidate, max-age=0"


def test_admin_end_sequence_broadcasts_websocket_event() -> None:
    with tempfile.TemporaryDirectory() as tmp_dir:
        with isolated_app(tmp_dir) as (client, _main_module):
            with client.websocket_connect("/ws/screen") as websocket:
                response = client.post("/api/admin/end-sequence")
                assert response.status_code == 200
                assert response.json()["started"] is True

                payload = websocket.receive_json()
                assert payload["type"] == "ending_sequence_started"


def test_run_opens_admin_and_screen_pages_before_starting_server() -> None:
    with patch("signature_wall.main.should_open_browser", return_value=True), \
        patch("signature_wall.main.open_startup_pages") as open_pages, \
        patch("signature_wall.main.uvicorn.run") as uvicorn_run:
        from signature_wall.main import run

        run()

        open_pages.assert_called_once_with("http://127.0.0.1:8000")
        uvicorn_run.assert_called_once()


def test_run_disables_default_uvicorn_logging_when_no_tty_stream_exists() -> None:
    with patch("signature_wall.main.should_open_browser", return_value=False), \
        patch("signature_wall.main.uvicorn.run") as uvicorn_run, \
        patch("signature_wall.main.sys.stderr", None), \
        patch("signature_wall.main.sys.stdout", None):
        from signature_wall.main import run

        run()

        _, kwargs = uvicorn_run.call_args
        assert kwargs["log_config"] is None
        assert kwargs["log_level"] == "info"
