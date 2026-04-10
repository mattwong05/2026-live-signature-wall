from __future__ import annotations

from contextlib import asynccontextmanager
from io import BytesIO
import os
import sys
import threading
import time
import uuid
import zipfile
import webbrowser
import logging
from pathlib import Path

from PIL import Image, ImageDraw
import qrcode
import qrcode.image.svg
import uvicorn
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket
from fastapi.responses import FileResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.websockets import WebSocketDisconnect

from .models import (
    AdminConfigResponse,
    BackgroundOpacityPayload,
    BackgroundImageResponse,
    ClearSignaturesResponse,
    CompletionResponse,
    EndSequenceResponse,
    HostIpPayload,
    PledgeLinesPayload,
    ScreenState,
    ScreenTitlePayload,
    SignatureCreated,
    SignaturePayload,
    SignatureRecord,
)
from .realtime import ScreenNotifier
from .storage import QueueOrderError, SignatureStore


HOST = "0.0.0.0"
PORT = 8000
DEFAULT_LAUNCH_URLS = ("/admin", "/screen")
ALLOWED_BACKGROUND_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def build_sign_page_url(host_ip: str | None) -> str | None:
    if not host_ip:
        return None
    return f"http://{host_ip}:{PORT}/sign"


def _runtime_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent.parent


def _resource_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS")) / "signature_wall"
    return Path(__file__).resolve().parent


def should_open_browser() -> bool:
    disabled = os.environ.get("SIGNATURE_WALL_NO_BROWSER", "").strip().lower()
    if disabled in {"1", "true", "yes", "on"}:
        return False
    return True


def open_startup_pages(base_url: str, delay_seconds: float = 1.2) -> None:
    def worker() -> None:
        time.sleep(delay_seconds)
        for path in DEFAULT_LAUNCH_URLS:
            try:
                webbrowser.open(f"{base_url}{path}")
            except Exception:
                continue

    threading.Thread(target=worker, daemon=True).start()


def should_use_default_uvicorn_logging() -> bool:
    stream = getattr(sys, "stderr", None) or getattr(sys, "stdout", None)
    return stream is not None and hasattr(stream, "isatty")


def configure_windowed_logging() -> None:
    if logging.getLogger().handlers:
        return
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")


RUNTIME_ROOT = _runtime_root()
RESOURCE_ROOT = _resource_root()
STATIC_DIR = RESOURCE_ROOT / "static"
TEMPLATES_DIR = RESOURCE_ROOT / "templates"
DB_PATH = RUNTIME_ROOT / "data" / "signature_wall.db"
UPLOADS_DIR = RUNTIME_ROOT / "data" / "uploads"
BACKGROUND_DIR = UPLOADS_DIR / "backgrounds"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

store = SignatureStore(DB_PATH)
notifier = ScreenNotifier()

NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


class NoCacheStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):  # type: ignore[override]
        response = await super().get_response(path, scope)
        response.headers.update(NO_CACHE_HEADERS)
        return response

@asynccontextmanager
async def lifespan(_: FastAPI):
    store.init_db()
    BACKGROUND_DIR.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title="Signature Wall", version="0.12.6", lifespan=lifespan)
app.mount("/static", NoCacheStaticFiles(directory=str(STATIC_DIR)), name="static")
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


@app.get("/", include_in_schema=False)
async def root() -> RedirectResponse:
    return RedirectResponse(url="/sign", status_code=307)


@app.get("/sign", include_in_schema=False)
async def sign_page() -> FileResponse:
    return FileResponse(TEMPLATES_DIR / "sign.html", headers=NO_CACHE_HEADERS)


@app.get("/admin", include_in_schema=False)
async def admin_page() -> FileResponse:
    return FileResponse(TEMPLATES_DIR / "admin.html", headers=NO_CACHE_HEADERS)


@app.get("/screen", include_in_schema=False)
async def screen_page() -> FileResponse:
    return FileResponse(TEMPLATES_DIR / "screen.html", headers=NO_CACHE_HEADERS)


@app.get("/api/screen-state", response_model=ScreenState)
async def get_screen_state() -> ScreenState:
    state = store.get_screen_state()
    state.screen_title = store.get_screen_title()
    return state


@app.get("/api/admin/background-image", response_model=BackgroundImageResponse)
async def get_background_image() -> BackgroundImageResponse:
    return BackgroundImageResponse(background_image_url=store.get_background_image_url())


@app.post("/api/admin/background-image", response_model=BackgroundImageResponse)
async def upload_background_image(file: UploadFile = File(...)) -> BackgroundImageResponse:
    if file.content_type not in ALLOWED_BACKGROUND_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported image type.")

    suffix = ALLOWED_BACKGROUND_TYPES[file.content_type]
    file_name = f"background_{uuid.uuid4().hex[:12]}{suffix}"
    destination = BACKGROUND_DIR / file_name
    content = await file.read()
    destination.write_bytes(content)
    result = store.set_background_image_url(f"/uploads/backgrounds/{file_name}")
    await notifier.broadcast(
        {
            "type": "background_image_updated",
            "background_image_url": result.background_image_url,
        }
    )
    return result


@app.delete("/api/admin/background-image", response_model=BackgroundImageResponse)
async def clear_background_image() -> BackgroundImageResponse:
    result = store.clear_background_image_url()
    await notifier.broadcast(
        {
            "type": "background_image_updated",
            "background_image_url": result.background_image_url,
        }
    )
    return result


@app.get("/api/admin/config", response_model=AdminConfigResponse)
async def get_admin_config() -> AdminConfigResponse:
    host_ip = store.get_host_ip()
    response = AdminConfigResponse(
        background_image_url=store.get_background_image_url(),
        background_image_opacity=store.get_background_image_opacity(),
        host_ip=host_ip,
        sign_page_url=build_sign_page_url(host_ip),
        screen_title=store.get_screen_title(),
        pledge_lines=store.get_pledge_lines(),
        signature_count=store.total_signature_count(),
    )
    return Response(
        content=response.model_dump_json(),
        media_type="application/json",
        headers=NO_CACHE_HEADERS,
    )


@app.put("/api/admin/config/ip", response_model=AdminConfigResponse)
async def update_host_ip(payload: HostIpPayload) -> AdminConfigResponse:
    host_ip = store.set_host_ip(payload.host_ip)
    return AdminConfigResponse(
        background_image_url=store.get_background_image_url(),
        background_image_opacity=store.get_background_image_opacity(),
        host_ip=host_ip,
        sign_page_url=build_sign_page_url(host_ip),
        screen_title=store.get_screen_title(),
        pledge_lines=store.get_pledge_lines(),
        signature_count=store.total_signature_count(),
    )


@app.put("/api/admin/config/background-opacity", response_model=AdminConfigResponse)
async def update_background_opacity(payload: BackgroundOpacityPayload) -> AdminConfigResponse:
    background_image_opacity = store.set_background_image_opacity(payload.background_image_opacity)
    await notifier.broadcast(
        {
            "type": "background_opacity_updated",
            "background_image_opacity": background_image_opacity,
        }
    )
    host_ip = store.get_host_ip()
    return AdminConfigResponse(
        background_image_url=store.get_background_image_url(),
        background_image_opacity=background_image_opacity,
        host_ip=host_ip,
        sign_page_url=build_sign_page_url(host_ip),
        screen_title=store.get_screen_title(),
        pledge_lines=store.get_pledge_lines(),
        signature_count=store.total_signature_count(),
    )


@app.put("/api/admin/config/title", response_model=AdminConfigResponse)
async def update_screen_title(payload: ScreenTitlePayload) -> AdminConfigResponse:
    screen_title = store.set_screen_title(payload.screen_title)
    await notifier.broadcast(
        {
            "type": "screen_title_updated",
            "screen_title": screen_title,
        }
    )
    host_ip = store.get_host_ip()
    return AdminConfigResponse(
        background_image_url=store.get_background_image_url(),
        background_image_opacity=store.get_background_image_opacity(),
        host_ip=host_ip,
        sign_page_url=build_sign_page_url(host_ip),
        screen_title=screen_title,
        pledge_lines=store.get_pledge_lines(),
        signature_count=store.total_signature_count(),
    )


@app.put("/api/admin/config/pledges", response_model=AdminConfigResponse)
async def update_pledge_lines(payload: PledgeLinesPayload) -> AdminConfigResponse:
    pledge_lines = store.set_pledge_lines(payload.pledge_lines)
    await notifier.broadcast(
        {
            "type": "pledge_lines_updated",
            "pledge_lines": pledge_lines,
        }
    )
    host_ip = store.get_host_ip()
    return AdminConfigResponse(
        background_image_url=store.get_background_image_url(),
        background_image_opacity=store.get_background_image_opacity(),
        host_ip=host_ip,
        sign_page_url=build_sign_page_url(host_ip),
        screen_title=store.get_screen_title(),
        pledge_lines=pledge_lines,
        signature_count=store.total_signature_count(),
    )


@app.get("/api/sign-config")
async def get_sign_config() -> dict[str, object]:
    return {
        "pledge_lines": store.get_pledge_lines(),
    }


@app.get("/api/admin/sign-qr.svg", include_in_schema=False)
async def get_sign_qr_svg() -> Response:
    host_ip = store.get_host_ip()
    sign_page_url = build_sign_page_url(host_ip)
    if sign_page_url is None:
        raise HTTPException(status_code=404, detail="Host IP is not configured.")

    image = qrcode.make(sign_page_url, image_factory=qrcode.image.svg.SvgImage)
    buffer = BytesIO()
    image.save(buffer)
    return Response(content=buffer.getvalue(), media_type="image/svg+xml")


@app.delete("/api/admin/signatures", response_model=ClearSignaturesResponse)
async def clear_signatures() -> ClearSignaturesResponse:
    cleared = store.clear_signatures()
    await notifier.broadcast({"type": "signatures_cleared"})
    return ClearSignaturesResponse(cleared=cleared)


@app.post("/api/admin/end-sequence", response_model=EndSequenceResponse)
async def start_end_sequence() -> EndSequenceResponse:
    await notifier.broadcast({"type": "ending_sequence_started"})
    return EndSequenceResponse()


def render_signature_png_bytes(signature: SignatureRecord) -> bytes:
    image = Image.new("RGBA", (signature.canvas_width, signature.canvas_height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    stroke_color = (31, 47, 68, 255)
    stroke_width = 4

    for stroke in signature.strokes:
        if not stroke:
            continue
        if len(stroke) == 1:
            point = stroke[0]
            radius = 3
            draw.ellipse(
                (
                    point.x - radius,
                    point.y - radius,
                    point.x + radius,
                    point.y + radius,
                ),
                fill=stroke_color,
            )
            continue

        points = [(point.x, point.y) for point in stroke]
        draw.line(points, fill=stroke_color, width=stroke_width, joint="curve")

    buffer = BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


@app.get("/api/admin/signatures/export", include_in_schema=False)
async def export_signatures() -> Response:
    signatures = store.list_all_signatures()
    if not signatures:
        raise HTTPException(status_code=404, detail="No signatures to export.")

    archive_buffer = BytesIO()
    with zipfile.ZipFile(archive_buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index, signature in enumerate(signatures, start=1):
            file_name = f"{index:03d}_{signature.id}.png"
            archive.writestr(file_name, render_signature_png_bytes(signature))

    headers = {
        "Content-Disposition": 'attachment; filename="signature-export.zip"',
    }
    return Response(
        content=archive_buffer.getvalue(),
        media_type="application/zip",
        headers=headers,
    )


@app.get("/api/signatures/{signature_id}", response_model=SignatureRecord)
async def get_signature(signature_id: str) -> SignatureRecord:
    signature = store.get_signature(signature_id)
    if signature is None:
        raise HTTPException(status_code=404, detail="Signature not found.")
    return signature


@app.post("/api/signatures", response_model=SignatureCreated, status_code=201)
async def create_signature(payload: SignaturePayload) -> SignatureCreated:
    strokes = [stroke for stroke in payload.strokes if stroke]
    if not strokes:
        raise HTTPException(status_code=400, detail="Signature strokes cannot be empty.")

    normalized_payload = SignaturePayload(
        canvas_width=payload.canvas_width,
        canvas_height=payload.canvas_height,
        strokes=strokes,
    )
    signature = store.create_signature(normalized_payload)
    queue_length = store.pending_count()
    await notifier.broadcast(
        {
            "type": "signature_submitted",
            "signature_id": signature.id,
            "queue_length": queue_length,
        }
    )
    return SignatureCreated(signature_id=signature.id, queue_length=queue_length)


@app.post("/api/signatures/{signature_id}/complete", response_model=CompletionResponse)
async def complete_signature(signature_id: str) -> CompletionResponse:
    try:
        signature = store.complete_signature(signature_id)
    except QueueOrderError as exc:
        raise HTTPException(status_code=409, detail="Signature is not first in queue.") from exc
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Signature not found.") from exc

    return CompletionResponse(signature=signature)


@app.websocket("/ws/screen")
async def screen_websocket(websocket: WebSocket) -> None:
    await notifier.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await notifier.disconnect(websocket)


def run() -> None:
    base_url = f"http://127.0.0.1:{PORT}"
    print(f"Signature wall running on {base_url}")
    if should_open_browser():
        open_startup_pages(base_url)
    uvicorn_options = {
        "host": HOST,
        "port": PORT,
        "log_level": "info",
    }
    if not should_use_default_uvicorn_logging():
        configure_windowed_logging()
        uvicorn_options["log_config"] = None
    uvicorn.run(app, **uvicorn_options)
