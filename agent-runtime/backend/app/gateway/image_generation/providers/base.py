from __future__ import annotations

from typing import Protocol

from app.gateway.image_generation.contracts import ImageGenerationRequest, ImageGenerationResult


class ImageGenerationProvider(Protocol):
    def generate(self, request: ImageGenerationRequest) -> ImageGenerationResult: ...
