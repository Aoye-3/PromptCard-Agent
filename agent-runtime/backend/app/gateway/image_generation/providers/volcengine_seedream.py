from __future__ import annotations

import re
from collections.abc import Callable, Mapping
from typing import Any

from volcenginesdkarkruntime import Ark

from app.gateway.image_generation.contracts import (
    ImageGenerationRequest,
    ImageGenerationResult,
    PromptCompilationError,
    ProviderError,
    ProviderImage,
)
from app.gateway.image_generation.prompt_compiler import compile_seedream_prompt

ArkClientFactory = Callable[..., Any]

_SENSITIVE_ASSIGNMENT = re.compile(
    r"(?i)(\b(?:api[_-]?key|access[_-]?key|token|secret|authorization)\b\s*[:=]\s*)(?:bearer\s+)?(?:['\"])?[^\s,;}'\"]+"
)
_BEARER_TOKEN = re.compile(r"(?i)(\bbearer\s+)[^\s,;}'\"]+")

# Volcengine's Seedream 5.0 Pro size reference table, documented for 1K/2K generation.
_PRESET_SIZES: dict[tuple[str, str], str] = {
    ("1K", "1:1"): "1024x1024",
    ("1K", "4:3"): "1152x864",
    ("1K", "3:4"): "864x1152",
    ("1K", "16:9"): "1424x800",
    ("1K", "9:16"): "800x1424",
    ("1K", "3:2"): "1248x832",
    ("1K", "2:3"): "832x1248",
    ("1K", "21:9"): "1568x672",
    ("2K", "1:1"): "2048x2048",
    ("2K", "4:3"): "2368x1776",
    ("2K", "3:4"): "1776x2368",
    ("2K", "16:9"): "2816x1584",
    ("2K", "9:16"): "1584x2816",
    ("2K", "3:2"): "2496x1664",
    ("2K", "2:3"): "1664x2496",
    ("2K", "21:9"): "3136x1344",
}
_MIN_CUSTOM_PIXELS = 921600
_MAX_CUSTOM_PIXELS = 4624220
_MIN_CUSTOM_RATIO = 1 / 16
_MAX_CUSTOM_RATIO = 16


class VolcengineSeedreamProvider:
    def __init__(
        self,
        *,
        api_key: str,
        base_url: str,
        client_factory: ArkClientFactory = Ark,
    ) -> None:
        self._api_key = api_key
        self._base_url = base_url
        self._client_factory = client_factory

    def generate(self, request: ImageGenerationRequest) -> ImageGenerationResult:
        if request.resolution not in {"1K", "2K"}:
            raise ProviderError("unsupported_resolution", "Seedream supports only 1K and 2K", False)
        size = _sdk_size(request)
        if request.output_format not in {"png", "jpeg"}:
            raise ProviderError("unsupported_output_format", "Seedream supports only PNG and JPEG output", False)

        try:
            compiled = compile_seedream_prompt(request.prompt_document, request.inputs, request.regions)
        except PromptCompilationError as error:
            raise ProviderError(error.code, str(error), False) from error

        provider_error: ProviderError | None = None
        try:
            client = self._client_factory(api_key=self._api_key, base_url=self._base_url)
            response = client.images.generate(
                model=request.model_id,
                prompt=compiled.prompt,
                image=list(compiled.images) if compiled.images else None,
                size=size,
                output_format=request.output_format,
                response_format="url",
                watermark=request.watermark,
            )
        except ProviderError:
            raise
        except Exception as error:
            provider_error = _normalize_provider_error(error, self._api_key)

        if provider_error is not None:
            raise provider_error from None

        data = getattr(response, "data", None)
        if not isinstance(data, list) or len(data) != 1:
            raise ProviderError("invalid_output_count", "Seedream must return exactly one image", False, _request_id(response))
        output = data[0]
        url = getattr(output, "url", None)
        if not isinstance(url, str) or not url:
            raise ProviderError("invalid_provider_response", "Seedream response did not include an image URL", False, _request_id(response))

        size = getattr(output, "size", None)
        return ImageGenerationResult(
            image=ProviderImage(url=url, size=size if isinstance(size, str) and size else None),
            request_id=_request_id(response),
        )


def _sdk_size(request: ImageGenerationRequest) -> str:
    width = request.width
    height = request.height
    if request.aspect_ratio == "smart":
        if width is not None or height is not None:
            raise ProviderError("invalid_custom_size", "Width and height require a custom aspect ratio", False)
        return request.resolution
    if request.aspect_ratio == "custom":
        if type(width) is not int or type(height) is not int or width <= 0 or height <= 0:
            raise ProviderError("invalid_custom_size", "Custom width and height must be positive integers", False)
        pixels = width * height
        ratio = width / height
        if not (_MIN_CUSTOM_PIXELS <= pixels <= _MAX_CUSTOM_PIXELS and _MIN_CUSTOM_RATIO <= ratio <= _MAX_CUSTOM_RATIO):
            raise ProviderError("invalid_custom_size", "Custom dimensions exceed Seedream limits", False)
        return f"{width}x{height}"
    if width is not None or height is not None:
        raise ProviderError("invalid_custom_size", "Width and height require a custom aspect ratio", False)
    try:
        return _PRESET_SIZES[(request.resolution, request.aspect_ratio)]
    except KeyError:
        raise ProviderError("unsupported_aspect_ratio", "Seedream does not support this aspect ratio", False) from None


def _normalize_provider_error(error: Exception, api_key: str) -> ProviderError:
    status_code = _status_code(error)
    request_id = _request_id(error)
    if isinstance(error, TimeoutError) or "timeout" in type(error).__name__.lower():
        code = "timeout"
        retryable = True
    elif status_code == 429:
        code = "rate_limited"
        retryable = True
    elif status_code in {401, 403}:
        code = "authentication_failed"
        retryable = False
    else:
        code = "provider_request_failed"
        retryable = status_code is not None and (status_code == 408 or status_code >= 500)

    raw_message = str(error).strip() or "Provider request failed"
    return ProviderError(code, _redact_sensitive_text(raw_message, api_key), retryable, request_id)


def _status_code(value: object) -> int | None:
    status = getattr(value, "status_code", None)
    return status if isinstance(status, int) and not isinstance(status, bool) else None


def _request_id(value: object) -> str | None:
    request_id = getattr(value, "request_id", None) or getattr(value, "_request_id", None)
    if isinstance(request_id, str) and request_id:
        return request_id
    headers = getattr(value, "headers", None)
    if isinstance(headers, Mapping):
        for key, header_value in headers.items():
            if str(key).lower() in {"x-request-id", "x-tt-logid"} and isinstance(header_value, str) and header_value:
                return header_value
    return None


def _redact_sensitive_text(message: str, api_key: str) -> str:
    redacted = message.replace(api_key, "[REDACTED]") if api_key else message
    redacted = _SENSITIVE_ASSIGNMENT.sub(r"\1[REDACTED]", redacted)
    return _BEARER_TOKEN.sub(r"\1[REDACTED]", redacted)
