from __future__ import annotations

from collections.abc import AsyncGenerator, Callable
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, TypeVar, cast

from fastapi import FastAPI, HTTPException, Request

if TYPE_CHECKING:
    from app.gateway.image_generation.service import ImageGenerationService

T = TypeVar("T")


@asynccontextmanager
async def image_generation_runtime(app: FastAPI) -> AsyncGenerator[None, None]:
    from app.gateway.image_generation.service import build_default_image_generation_service

    service = build_default_image_generation_service()
    app.state.image_generation_service = service
    try:
        yield
    finally:
        service.close()
        app.state.image_generation_service = None


def _require(attr: str, label: str) -> Callable[[Request], T]:
    def dep(request: Request) -> T:
        value = getattr(request.app.state, attr, None)
        if value is None:
            raise HTTPException(status_code=503, detail=f"{label} not available")
        return cast(T, value)

    return dep


get_image_generation_service: Callable[[Request], ImageGenerationService] = _require(
    "image_generation_service",
    "Image generation service",
)
