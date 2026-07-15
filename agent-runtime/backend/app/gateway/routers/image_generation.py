from __future__ import annotations

import os
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from app.gateway.deps import get_image_generation_service
from app.gateway.image_generation.contracts import BBoxRegion, PointRegion, PromptDocument, PromptReferenceSegment, PromptTextSegment
from app.gateway.image_generation.service import GenerationAssetInput, GenerationCommand, GenerationError, GenerationOutcome, ImageGenerationService

router = APIRouter(prefix="/api/promptcard/runtime", tags=["promptcard-runtime"])
IMAGE_GENERATION_FEATURE_ENV = "PROMPTCARD_IMAGE_GENERATION_NODE_V1"


class RequestModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")


class TextSegmentBody(RequestModel):
    type: Literal["text"]
    text: str


class ReferenceSegmentBody(RequestModel):
    type: Literal["reference"]
    reference_id: str = Field(alias="referenceId")
    label: str


type PromptSegmentBody = Annotated[TextSegmentBody | ReferenceSegmentBody, Field(discriminator="type")]


class PromptDocumentBody(RequestModel):
    version: int = 1
    segments: list[PromptSegmentBody]


class AssetInputBody(RequestModel):
    reference_id: str = Field(alias="referenceId")
    asset_id: str = Field(alias="assetId")
    order: int


class PointRegionBody(RequestModel):
    type: Literal["point"]
    reference_id: str = Field(alias="referenceId")
    x: int
    y: int


class BBoxRegionBody(RequestModel):
    type: Literal["bbox"]
    reference_id: str = Field(alias="referenceId")
    x1: int
    y1: int
    x2: int
    y2: int


type RegionBody = Annotated[PointRegionBody | BBoxRegionBody, Field(discriminator="type")]


class ImageGenerationBody(RequestModel):
    project_id: str = Field(alias="projectId")
    node_id: str = Field(alias="nodeId")
    connection_id: str = Field(alias="connectionId")
    model_id: str = Field(alias="modelId")
    mode: str
    prompt_document: PromptDocumentBody = Field(alias="promptDocument")
    inputs: list[AssetInputBody] = Field(default_factory=list)
    regions: list[RegionBody] = Field(default_factory=list)
    resolution: str
    aspect_ratio: str = Field(default="smart", alias="aspectRatio")
    width: Annotated[int, Field(strict=True, gt=0)] | None = None
    height: Annotated[int, Field(strict=True, gt=0)] | None = None
    output_format: str = Field(alias="outputFormat")
    watermark: bool = False


class ImageGenerationResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)

    run_id: str = Field(alias="runId")
    state: str
    asset_id: str = Field(alias="assetId")
    capture_id: str = Field(alias="captureId")
    content_type: str = Field(alias="contentType")
    width: int
    height: int


@router.post("/image-generations", response_model=ImageGenerationResponse)
async def generate_image(
    body: ImageGenerationBody,
    service: ImageGenerationService = Depends(get_image_generation_service),
) -> ImageGenerationResponse:
    if not _image_generation_enabled():
        raise HTTPException(
            status_code=403,
            detail={
                "code": "image_generation_disabled",
                "message": "Image generation is disabled by the server rollout gate",
                "retryable": False,
            },
        )
    command = _command(body)
    response_error: HTTPException | None = None
    try:
        result = await run_in_threadpool(service.generate, command)
    except GenerationError as error:
        response_error = HTTPException(
            status_code=_status_code(error),
            detail={
                "code": error.code,
                "message": _safe_error_message(error.code),
                "retryable": error.retryable,
                "runId": error.run_id,
            },
        )
    if response_error is not None:
        raise response_error from None
    return _response(result)


def _command(body: ImageGenerationBody) -> GenerationCommand:
    segments = tuple(
        PromptTextSegment(text=segment.text)
        if isinstance(segment, TextSegmentBody)
        else PromptReferenceSegment(reference_id=segment.reference_id, label=segment.label)
        for segment in body.prompt_document.segments
    )
    regions = tuple(
        PointRegion(reference_id=region.reference_id, x=region.x, y=region.y)
        if isinstance(region, PointRegionBody)
        else BBoxRegion(reference_id=region.reference_id, x1=region.x1, y1=region.y1, x2=region.x2, y2=region.y2)
        for region in body.regions
    )
    return GenerationCommand(
        run_id=f"image-run-{uuid4().hex}",
        project_id=body.project_id,
        node_id=body.node_id,
        connection_id=body.connection_id,
        model_id=body.model_id,
        mode=body.mode,
        prompt_document=PromptDocument(segments=segments, version=body.prompt_document.version),
        inputs=tuple(
            GenerationAssetInput(reference_id=item.reference_id, asset_id=item.asset_id, order=item.order)
            for item in body.inputs
        ),
        regions=regions,
        resolution=body.resolution,
        aspect_ratio=body.aspect_ratio,
        width=body.width,
        height=body.height,
        output_format=body.output_format,
        watermark=body.watermark,
    )


def _response(result: GenerationOutcome) -> ImageGenerationResponse:
    return ImageGenerationResponse(
        run_id=result.run_id,
        state=result.state,
        asset_id=result.asset_id,
        capture_id=result.capture_id,
        content_type=result.content_type,
        width=result.width,
        height=result.height,
    )


def _status_code(error: GenerationError) -> int:
    if error.code in {"generation_busy", "generation_capacity_reached", "rate_limited"}:
        return 429
    if error.retryable:
        return 503
    return 422


def _safe_error_message(code: str) -> str:
    return {
        "unsafe_image_url": "Remote image URL is not allowed",
        "image_host_unresolved": "Remote image host could not be resolved",
        "image_redirect_rejected": "Remote image redirect was rejected",
        "image_download_timeout": "Remote image download timed out",
        "image_download_failed": "Remote image download failed",
        "invalid_image_mime": "Remote response is not a supported raster image",
        "image_too_large": "Remote image exceeds the download limit",
        "image_pixel_budget_exceeded": "Remote image exceeds the pixel limit",
        "invalid_image_data": "Remote image could not be decoded",
        "storage_write_failed": "Generated image could not be stored",
        "terminal_persistence_failed": "Image generation terminal state could not be saved",
        "credential_store_unavailable": "Model credential storage is unavailable",
        "credential_missing": "The selected model connection has no credential",
        "generation_busy": "This model connection already has two running generations",
        "generation_capacity_reached": "Image generation service capacity is reached",
        "input_images_too_large": "Reference images exceed the aggregate byte limit",
        "rate_limited": "Image provider rate limit reached",
        "timeout": "Image provider request timed out",
        "authentication_failed": "Image provider authentication failed",
    }.get(code, "Image generation failed")


def _image_generation_enabled() -> bool:
    return os.getenv(IMAGE_GENERATION_FEATURE_ENV, "").strip().lower() in {"1", "true", "yes", "on"}
