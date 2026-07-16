from __future__ import annotations

import base64
import os
from typing import Any

import uvicorn
from fastapi import FastAPI

from app.gateway.deps import get_image_generation_service
from app.gateway.image_generation.contracts import ImageGenerationRequest, ImageGenerationResult, ProviderImage
from app.gateway.image_generation.result_fetcher import FetchedImage
from app.gateway.image_generation.service import (
    ConnectionMetadata,
    ImageGenerationService,
    PromptCardStorageClient,
)
from app.gateway.routers import image_generation

MODEL_ID = "doubao-seedream-5-0-pro-260628"
CONNECTION_ID = "e2e-ark-image"
ONE_PIXEL_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII="
)


class FakeConnections:
    def resolve_metadata(self, connection_id: str) -> ConnectionMetadata:
        if connection_id != CONNECTION_ID:
            raise LookupError("connection_not_found")
        return ConnectionMetadata(
            connection_id=connection_id,
            provider_id="volcengine-ark",
            api_base="https://ark.cn-beijing.volces.com/api/v3",
            enabled=True,
            last_test_ok=True,
        )

    def get_credential(self, connection_id: str) -> str | None:
        return "e2e-credential" if connection_id == CONNECTION_ID else None


class RecordingProvider:
    def __init__(self, requests: list[dict[str, Any]]) -> None:
        self._requests = requests

    def generate(self, request: ImageGenerationRequest) -> ImageGenerationResult:
        self._requests.append(
            {
                "segments": [
                    {"type": "text", "text": segment.text}
                    if hasattr(segment, "text")
                    else {"type": "reference", "referenceId": segment.reference_id, "label": segment.label}
                    for segment in request.prompt_document.segments
                ],
                "inputCount": len(request.inputs),
                "regionCount": len(request.regions),
                "resolution": request.resolution,
                "aspectRatio": request.aspect_ratio,
            }
        )
        return ImageGenerationResult(
            image=ProviderImage(url="https://e2e.invalid/generated.png"),
            request_id=f"e2e-provider-{len(self._requests)}",
        )


class FakeResultFetcher:
    def fetch(self, _url: str) -> FetchedImage:
        return FetchedImage(
            content=ONE_PIXEL_PNG,
            content_type="image/png",
            width=1,
            height=1,
            extension=".png",
        )

    def close(self) -> None:
        return None


provider_requests: list[dict[str, Any]] = []
service = ImageGenerationService(
    storage=PromptCardStorageClient(),
    connections=FakeConnections(),
    provider_factory=lambda _connection: RecordingProvider(provider_requests),
    result_fetcher=FakeResultFetcher(),
)

os.environ[image_generation.IMAGE_GENERATION_FEATURE_ENV] = "1"
app = FastAPI()
app.include_router(image_generation.router)
app.dependency_overrides[get_image_generation_service] = lambda: service


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "healthy", "service": "image-generation-e2e-runtime"}


@app.get("/api/promptcard/runtime/model-catalog")
def model_catalog() -> dict[str, Any]:
    return {
        "providers": [
            {
                "id": "volcengine-ark",
                "displayName": "火山方舟",
                "defaultApiBase": "https://ark.cn-beijing.volces.com/api/v3",
            }
        ],
        "models": [
            {
                "id": MODEL_ID,
                "providerId": "volcengine-ark",
                "displayName": "Seedream 5.0 Pro",
                "modality": "image",
                "capabilities": {
                    "modes": ["generate", "edit", "region-edit"],
                    "resolutions": ["1K", "2K"],
                    "aspectRatios": ["smart", "1:1", "16:9", "9:16"],
                    "customSize": None,
                    "outputFormats": ["png", "jpeg"],
                    "watermark": True,
                    "maxReferenceImages": 10,
                    "regionInputs": ["point", "bbox"],
                    "outputCount": 1,
                    "streaming": False,
                },
            }
        ],
    }


@app.get("/api/promptcard/runtime/model-connections")
def model_connections() -> dict[str, Any]:
    return {
        "connections": [
            {
                "id": CONNECTION_ID,
                "providerId": "volcengine-ark",
                "displayName": "E2E Ark",
                "apiBase": "https://ark.cn-beijing.volces.com/api/v3",
                "enabled": True,
                "credentialConfigured": True,
                "credentialMask": "••••••••",
                "createdAt": 1,
                "updatedAt": 1,
                "lastTest": {"ok": True, "checkedAt": 1, "message": "Connection ok."},
            }
        ]
    }


@app.get("/api/promptcard/runtime/model-assignments")
def model_assignments() -> dict[str, Any]:
    return {"assignments": [{"slot": "image.primary", "connectionId": CONNECTION_ID, "modelId": MODEL_ID}]}


@app.get("/api/promptcard/runtime/image-generation-status")
def image_generation_status() -> dict[str, Any]:
    return {
        "serverEnabled": True,
        "checkedAt": 1,
        "credentialStore": {"available": True},
        "providers": [
            {
                "providerId": "volcengine-ark",
                "status": "ready",
                "sdk": {
                    "packageName": "volcengine-python-sdk",
                    "installedVersion": "5.0.36",
                    "requiredVersion": "5.0.36",
                    "compatible": True,
                    "error": None,
                },
            }
        ],
    }


@app.get("/__test__/provider-requests")
def recorded_provider_requests() -> dict[str, Any]:
    return {"requests": provider_requests}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("PORT", "38101")))
