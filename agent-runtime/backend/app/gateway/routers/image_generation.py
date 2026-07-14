from __future__ import annotations

from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from app.gateway.deps import get_image_generation_service
from app.gateway.image_generation.contracts import BBoxRegion, PointRegion, PromptDocument, PromptReferenceSegment, PromptTextSegment
from app.gateway.image_generation.service import GenerationAssetInput, GenerationCommand, GenerationError, GenerationOutcome, ImageGenerationService

router = APIRouter(prefix="/api/promptcard/runtime", tags=["promptcard-runtime"])


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
    command = _command(body)
    try:
        result = await run_in_threadpool(service.generate, command)
    except GenerationError as error:
        raise HTTPException(
            status_code=_status_code(error),
            detail={
                "code": error.code,
                "message": error.message,
                "retryable": error.retryable,
                "runId": error.run_id,
            },
        ) from None
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
    if error.code in {"generation_busy", "rate_limited"}:
        return 429
    if error.retryable:
        return 503
    return 422
