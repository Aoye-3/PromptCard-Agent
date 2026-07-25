from __future__ import annotations

import os
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
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
    source_asset_id: str | None = Field(default=None, alias="sourceAssetId")
    role: Literal["source-image", "reference-image"] = "reference-image"
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


class OperationSourceBody(RequestModel):
    node_id: str = Field(alias="nodeId", pattern=r"^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$")
    original_asset_id: str = Field(alias="originalAssetId", pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$")
    canvas_asset_id: str = Field(alias="canvasAssetId", pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$")
    provider_asset_id: str = Field(alias="providerAssetId", pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$")


class OperationSnapshotBody(RequestModel):
    operation: Literal[
        "reference-generate",
        "effect-render",
        "global-edit",
        "region-redraw",
        "erase",
        "outpaint",
        "text-edit",
        "multi-view",
        "upscale",
        "subject-extract",
    ]
    recipe_id: str = Field(alias="recipeId", pattern=r"^[a-z0-9][a-z0-9._/-]{0,127}$")
    recipe_version: str = Field(alias="recipeVersion", pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$")
    source: OperationSourceBody
    preservation_intents: list[str] = Field(default_factory=list, alias="preservationIntents", max_length=20)
    parameters: dict[str, str | int | float | bool | list[str]] = Field(default_factory=dict, max_length=24)
    operation_group_id: str | None = Field(
        default=None,
        alias="operationGroupId",
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$",
    )
    operation_item_id: str | None = Field(
        default=None,
        alias="operationItemId",
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$",
    )
    view_spec: str | None = Field(default=None, alias="viewSpec", max_length=80)

    @model_validator(mode="after")
    def validate_snapshot_values(self) -> OperationSnapshotBody:
        if any(not value.strip() or len(value) > 160 for value in self.preservation_intents):
            raise ValueError("operation preservation intents are invalid")
        for key, value in self.parameters.items():
            if not key or len(key) > 64 or not key.replace("-", "").replace("_", "").isalnum():
                raise ValueError("operation parameter key is invalid")
            if isinstance(value, str) and len(value) > 500:
                raise ValueError("operation parameter value is too long")
            if isinstance(value, list) and (
                len(value) > 32
                or any(not isinstance(item, str) or len(item) > 160 for item in value)
            ):
                raise ValueError("operation parameter list is invalid")
        return self


class ImageGenerationBody(RequestModel):
    run_id: str | None = Field(
        default=None,
        alias="runId",
        pattern=r"^image-run-[0-9a-f]{32}$",
    )
    project_id: str = Field(alias="projectId")
    conversation_id: str | None = Field(default=None, alias="conversationId", min_length=1)
    node_id: str | None = Field(default=None, alias="nodeId", min_length=1)
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
    prompt_optimization: Literal["standard", "fast"] = Field(
        default="standard",
        alias="promptOptimization",
    )
    operation: OperationSnapshotBody | None = None

    @model_validator(mode="after")
    def require_generation_context(self) -> ImageGenerationBody:
        if self.conversation_id is None and self.node_id is None:
            raise ValueError("conversationId or nodeId is required")
        return self


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
        run_id=body.run_id or f"image-run-{uuid4().hex}",
        project_id=body.project_id,
        node_id=body.node_id,
        conversation_id=body.conversation_id,
        connection_id=body.connection_id,
        model_id=body.model_id,
        mode=body.mode,
        prompt_document=PromptDocument(segments=segments, version=body.prompt_document.version),
        inputs=tuple(
            GenerationAssetInput(
                reference_id=item.reference_id,
                asset_id=item.asset_id,
                order=item.order,
                role=item.role,
                source_asset_id=item.source_asset_id,
            )
            for item in body.inputs
        ),
        regions=regions,
        resolution=body.resolution,
        aspect_ratio=body.aspect_ratio,
        width=body.width,
        height=body.height,
        output_format=body.output_format,
        watermark=body.watermark,
        prompt_optimization=body.prompt_optimization,
        operation_snapshot=body.operation.model_dump(
            by_alias=True,
            exclude_none=True,
        ) if body.operation is not None else None,
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
    if error.code == "image_generation_conversation_not_found":
        return 404
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
        "image_generation_conversation_not_found": "The image generation conversation is unavailable",
        "credential_store_unavailable": "Model credential storage is unavailable",
        "credential_missing": "The selected model connection has no credential",
        "connection_not_tested": "The selected model connection has not been tested",
        "connection_test_failed": "The selected model connection test failed",
        "image_generation_disabled": "Image generation is disabled by the server rollout gate",
        "image_generation_status_unavailable": "Image generation readiness could not be checked",
        "ark_sdk_missing": "The Ark SDK is not installed",
        "ark_sdk_incompatible": "The Ark SDK version is incompatible",
        "ark_sdk_check_failed": "The Ark SDK status could not be checked",
        "ark_sdk_unavailable": "The Ark SDK is unavailable",
        "generation_busy": "This model connection already has two running generations",
        "generation_capacity_reached": "Image generation service capacity is reached",
        "input_images_too_large": "Reference images exceed the aggregate byte limit",
        "rate_limited": "Image provider rate limit reached",
        "timeout": "Image provider request timed out",
        "authentication_failed": "Image provider authentication failed",
        "prompt_required": "Image generation requires a non-empty prompt",
        "unsupported_prompt_optimization": "The selected prompt optimization mode is unsupported",
        "invalid_image_role": "A reference image role is invalid",
        "too_many_source_images": "Only one source image is allowed",
    }.get(code, "Image generation failed")


def _image_generation_enabled() -> bool:
    return os.getenv(IMAGE_GENERATION_FEATURE_ENV, "").strip().lower() in {"1", "true", "yes", "on"}
