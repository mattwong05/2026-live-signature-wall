from __future__ import annotations

from pydantic import BaseModel, Field


class Point(BaseModel):
    x: float
    y: float
    t: int = Field(ge=0)


class SignaturePayload(BaseModel):
    canvas_width: int = Field(gt=0)
    canvas_height: int = Field(gt=0)
    strokes: list[list[Point]]


class SignatureRecord(SignaturePayload):
    id: str
    created_at: int


class SignatureCreated(BaseModel):
    signature_id: str
    queue_length: int


class ScreenState(BaseModel):
    background_signatures: list[SignatureRecord]
    pending_signatures: list[SignatureRecord]
    background_image_url: str | None = None
    background_image_opacity: int = 50
    screen_title: str = ""


class CompletionResponse(BaseModel):
    signature: SignatureRecord


class BackgroundImageResponse(BaseModel):
    background_image_url: str | None = None


class HostIpPayload(BaseModel):
    host_ip: str = Field(min_length=1)


class AdminConfigResponse(BaseModel):
    background_image_url: str | None = None
    background_image_opacity: int = 50
    host_ip: str | None = None
    sign_page_url: str | None = None
    screen_title: str = ""
    pledge_lines: list[str] = []
    signature_count: int = 0


class ClearSignaturesResponse(BaseModel):
    cleared: int


class EndSequenceResponse(BaseModel):
    started: bool = True


class ScreenTitlePayload(BaseModel):
    screen_title: str = Field(min_length=0, max_length=80)


class BackgroundOpacityPayload(BaseModel):
    background_image_opacity: int = Field(ge=0, le=100)


class PledgeLinesPayload(BaseModel):
    pledge_lines: list[str] = Field(min_length=1)
