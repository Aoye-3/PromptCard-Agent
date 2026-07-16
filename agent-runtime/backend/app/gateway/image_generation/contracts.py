from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

ImageResolution = Literal["1K", "2K"]
ImageOutputFormat = Literal["png", "jpeg"]
PromptOptimizationMode = Literal["standard", "fast"]
ImageInputRole = Literal["source-image", "reference-image"]


class PromptCompilationError(ValueError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(f"{code}: {message}")
        self.code = code


class ProviderError(RuntimeError):
    def __init__(self, code: str, message: str, retryable: bool, request_id: str | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.request_id = request_id


@dataclass(frozen=True, slots=True)
class PromptTextSegment:
    text: str


@dataclass(frozen=True, slots=True)
class PromptReferenceSegment:
    reference_id: str
    label: str


type PromptSegment = PromptTextSegment | PromptReferenceSegment


@dataclass(frozen=True, slots=True)
class PromptDocument:
    segments: tuple[PromptSegment, ...]
    version: int = 1


@dataclass(frozen=True, slots=True)
class ImageInput:
    reference_id: str
    image: str
    order: int
    role: str = "reference-image"
    source_asset_id: str | None = None


@dataclass(frozen=True, slots=True)
class PointRegion:
    reference_id: str
    x: int
    y: int


@dataclass(frozen=True, slots=True)
class BBoxRegion:
    reference_id: str
    x1: int
    y1: int
    x2: int
    y2: int


type ImageRegion = PointRegion | BBoxRegion


@dataclass(frozen=True, slots=True)
class CompiledPrompt:
    prompt: str
    images: tuple[str, ...]


@dataclass(frozen=True, slots=True)
class ImageGenerationRequest:
    model_id: str
    prompt_document: PromptDocument
    inputs: tuple[ImageInput, ...]
    regions: tuple[ImageRegion, ...]
    resolution: str
    aspect_ratio: str
    width: int | None
    height: int | None
    output_format: str
    watermark: bool
    prompt_optimization: str = "standard"


@dataclass(frozen=True, slots=True)
class ProviderImage:
    url: str | None = None
    b64_json: str | None = None
    size: str | None = None


@dataclass(frozen=True, slots=True)
class ImageGenerationResult:
    image: ProviderImage
    request_id: str | None = None
    usage: dict[str, int] | None = None
