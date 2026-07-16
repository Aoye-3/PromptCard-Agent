from __future__ import annotations

from copy import deepcopy
from typing import Any

PROVIDERS: tuple[dict[str, Any], ...] = (
    {
        "id": "deepseek",
        "displayName": "DeepSeek",
        "defaultApiBase": "https://api.deepseek.com",
    },
    {
        "id": "volcengine-ark",
        "displayName": "Volcengine Ark",
        "defaultApiBase": "https://ark.cn-beijing.volces.com/api/v3",
    },
)

MODELS: tuple[dict[str, Any], ...] = (
    {
        "id": "deepseek-chat",
        "providerId": "deepseek",
        "displayName": "DeepSeek Chat",
        "modality": "chat",
    },
    {
        "id": "doubao-seed-2-0-lite-260215",
        "providerId": "volcengine-ark",
        "displayName": "Doubao Seed 2.0 Lite",
        "modality": "chat",
        "capabilities": {
            "input": ["text", "image"],
            "toolCalling": True,
        },
    },
    {
        "id": "doubao-seedream-5-0-pro-260628",
        "providerId": "volcengine-ark",
        "displayName": "Seedream 5.0 Pro",
        "modality": "image",
        "capabilities": {
            "modes": ["generate", "edit", "region-edit"],
            "maxReferenceImages": 10,
            "mentionStrategy": "ordered-image-labels",
            "regionInputs": ["point", "bbox"],
            "resolutions": ["1K", "2K"],
            "aspectRatios": ["smart", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3", "21:9", "custom"],
            "customSize": {
                "minPixels": 921600,
                "maxPixels": 4624220,
                "minAspectRatio": 1 / 16,
                "maxAspectRatio": 16,
            },
            "promptOptimization": {
                "modes": ["standard", "fast"],
                "default": "standard",
            },
            "inputConstraints": {
                "formats": ["jpeg", "png", "webp", "bmp", "tiff", "gif", "heic", "heif"],
                "maxImages": 10,
                "maxBytesPerImage": 30 * 1024 * 1024,
                "maxPixelsPerImage": 36_000_000,
                "minSideExclusive": 14,
                "minAspectRatio": 1 / 16,
                "maxAspectRatio": 16,
            },
            "annotationInputs": ["raster-markup"],
            "outputFormats": ["png", "jpeg"],
            "responseTransports": ["url", "b64_json"],
            "watermark": True,
            "outputCount": 1,
            "streaming": False,
        },
    },
)


def catalog_response() -> dict[str, Any]:
    return {"providers": deepcopy(PROVIDERS), "models": deepcopy(MODELS)}


def provider_exists(provider_id: str) -> bool:
    return any(provider["id"] == provider_id for provider in PROVIDERS)


def model_by_id(model_id: str) -> dict[str, Any] | None:
    return next((model for model in MODELS if model["id"] == model_id), None)
