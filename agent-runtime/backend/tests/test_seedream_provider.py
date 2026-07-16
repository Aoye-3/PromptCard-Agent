from __future__ import annotations

import traceback
from types import SimpleNamespace
from typing import Any
from unittest.mock import ANY

import pytest

from app.gateway.image_generation.contracts import (
    ImageGenerationRequest,
    ImageInput,
    PromptDocument,
    PromptReferenceSegment,
    PromptTextSegment,
    ProviderError,
)
from app.gateway.image_generation.providers.base import ImageGenerationProvider
from app.gateway.image_generation.providers.volcengine_seedream import VolcengineSeedreamProvider


class FakeImages:
    def __init__(self, response: Any = None, error: Exception | None = None) -> None:
        self.response = response
        self.error = error
        self.calls: list[dict[str, Any]] = []

    def generate(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return self.response


class FakeArkClient:
    def __init__(self, images: FakeImages) -> None:
        self.images = images


def generation_request(**overrides: Any) -> ImageGenerationRequest:
    values = {
        "model_id": "doubao-seedream-5-0-pro-260628",
        "prompt_document": PromptDocument(
            segments=(
                PromptTextSegment(text="让"),
                PromptReferenceSegment(reference_id="ref-1", label="主体"),
                PromptTextSegment(text="站在雪地里"),
            )
        ),
        "inputs": (ImageInput(reference_id="ref-1", image="data:image/png;base64,abc", order=0),),
        "regions": (),
        "resolution": "2K",
        "aspect_ratio": "smart",
        "width": None,
        "height": None,
        "output_format": "png",
        "watermark": False,
        "prompt_optimization": "standard",
    }
    values.update(overrides)
    return ImageGenerationRequest(**values)


def test_maps_provider_neutral_request_to_exact_ark_sdk_arguments() -> None:
    images = FakeImages(
        response=SimpleNamespace(
            data=[SimpleNamespace(url="https://example.invalid/result.png", size="2048x2048")],
            request_id="req-success",
        )
    )
    client = FakeArkClient(images)
    factory_calls: list[dict[str, str]] = []

    def client_factory(**kwargs: str) -> FakeArkClient:
        factory_calls.append(kwargs)
        return client

    provider: ImageGenerationProvider = VolcengineSeedreamProvider(
        api_key="secret-key",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        client_factory=client_factory,
    )

    result = provider.generate(generation_request())

    assert factory_calls == [
        {
            "api_key": "secret-key",
            "base_url": "https://ark.cn-beijing.volces.com/api/v3",
        }
    ]
    assert images.calls == [
        {
            "model": "doubao-seedream-5-0-pro-260628",
            "prompt": "让图1站在雪地里",
            "image": ["data:image/png;base64,abc"],
            "size": "2K",
            "output_format": "png",
            "response_format": "url",
            "watermark": False,
            "optimize_prompt_options": ANY,
        }
    ]
    assert images.calls[0]["optimize_prompt_options"].model_dump() == {
        "thinking": None,
        "mode": "standard",
    }
    assert result.image.url == "https://example.invalid/result.png"
    assert result.image.size == "2048x2048"
    assert result.request_id == "req-success"

    sdk_arguments = images.calls[0]
    assert "stream" not in sdk_arguments
    assert "sequential_image_generation" not in sdk_arguments
    assert "sequential_image_generation_options" not in sdk_arguments
    assert "mask" not in sdk_arguments
    assert sdk_arguments["size"] != "4K"


@pytest.mark.parametrize("mode", ["standard", "fast"])
def test_maps_official_prompt_optimization_modes_to_sdk(mode: str) -> None:
    images = FakeImages(
        response=SimpleNamespace(
            data=[SimpleNamespace(url="https://example.invalid/result.png")],
        )
    )
    provider = VolcengineSeedreamProvider(
        api_key="secret-key",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        client_factory=lambda **_kwargs: FakeArkClient(images),
    )

    provider.generate(generation_request(prompt_optimization=mode))

    assert images.calls[0]["optimize_prompt_options"].mode == mode


@pytest.mark.parametrize(
    "prompt",
    [
        "ملصق منتج عربي بخط واضح",
        "日本語の商品ポスター、読みやすい文字",
        "Deutsches Produktplakat mit klarer Typografie",
    ],
)
def test_preserves_multilingual_prompts_sent_to_sdk(prompt: str) -> None:
    images = FakeImages(
        response=SimpleNamespace(
            data=[SimpleNamespace(url="https://example.invalid/result.png")],
        )
    )
    provider = VolcengineSeedreamProvider(
        api_key="secret-key",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        client_factory=lambda **_kwargs: FakeArkClient(images),
    )

    provider.generate(
        generation_request(
            prompt_document=PromptDocument(segments=(PromptTextSegment(text=prompt),)),
            inputs=(),
        )
    )

    assert images.calls[0]["prompt"] == prompt


def test_rejects_invalid_prompt_optimization_before_calling_sdk() -> None:
    images = FakeImages(response=None)
    provider = VolcengineSeedreamProvider(
        api_key="secret-key",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        client_factory=lambda **_kwargs: FakeArkClient(images),
    )

    with pytest.raises(ProviderError) as exc_info:
        provider.generate(generation_request(prompt_optimization="turbo"))

    assert exc_info.value.code == "unsupported_prompt_optimization"
    assert images.calls == []


def test_accepts_base64_response_and_exposes_sanitized_usage() -> None:
    images = FakeImages(
        response=SimpleNamespace(
            data=[SimpleNamespace(b64_json="aW1hZ2U=", size="1024x1024")],
            request_id="req-base64",
            usage=SimpleNamespace(
                generated_images=1,
                output_tokens=12,
                total_tokens=15,
                tool_usage=SimpleNamespace(web_search=0),
            ),
        )
    )
    provider = VolcengineSeedreamProvider(
        api_key="secret-key",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        response_format="b64_json",
        client_factory=lambda **_kwargs: FakeArkClient(images),
    )

    result = provider.generate(generation_request())

    assert images.calls[0]["response_format"] == "b64_json"
    assert result.image.url is None
    assert result.image.b64_json == "aW1hZ2U="
    assert result.image.size == "1024x1024"
    assert result.usage == {
        "generatedImages": 1,
        "outputTokens": 12,
        "totalTokens": 15,
    }


@pytest.mark.parametrize("location", ["top", "item"])
def test_normalizes_error_objects_returned_inside_successful_sdk_response(location: str) -> None:
    provider_error = SimpleNamespace(
        code="SensitiveVendorCode",
        message="api_key=raw-secret vendor rejected request",
    )
    response = (
        SimpleNamespace(data=[], error=provider_error, request_id="req-top-error")
        if location == "top"
        else SimpleNamespace(
            data=[SimpleNamespace(error=provider_error)],
            request_id="req-item-error",
        )
    )
    images = FakeImages(response=response)
    provider = VolcengineSeedreamProvider(
        api_key="secret-key",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        client_factory=lambda **_kwargs: FakeArkClient(images),
    )

    with pytest.raises(ProviderError) as exc_info:
        provider.generate(generation_request())

    assert exc_info.value.code == "provider_request_failed"
    assert exc_info.value.request_id == f"req-{location}-error"
    assert "raw-secret" not in exc_info.value.message


@pytest.mark.parametrize(
    ("resolution", "aspect_ratio", "expected_size"),
    [
        ("1K", "1:1", "1024x1024"),
        ("1K", "4:3", "1152x864"),
        ("1K", "3:4", "864x1152"),
        ("1K", "16:9", "1424x800"),
        ("1K", "9:16", "800x1424"),
        ("1K", "3:2", "1248x832"),
        ("1K", "2:3", "832x1248"),
        ("1K", "21:9", "1568x672"),
        ("2K", "1:1", "2048x2048"),
        ("2K", "4:3", "2368x1776"),
        ("2K", "3:4", "1776x2368"),
        ("2K", "16:9", "2816x1584"),
        ("2K", "9:16", "1584x2816"),
        ("2K", "3:2", "2496x1664"),
        ("2K", "2:3", "1664x2496"),
        ("2K", "21:9", "3136x1344"),
    ],
)
def test_maps_seedream_5_pro_official_ratio_presets_to_exact_size(
    resolution: str,
    aspect_ratio: str,
    expected_size: str,
) -> None:
    images = FakeImages(response=SimpleNamespace(data=[SimpleNamespace(url="https://example.invalid/result.png")]))
    provider = VolcengineSeedreamProvider(
        api_key="secret-key",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        client_factory=lambda **_kwargs: FakeArkClient(images),
    )

    provider.generate(generation_request(resolution=resolution, aspect_ratio=aspect_ratio))

    assert images.calls[0]["size"] == expected_size


def test_maps_custom_size_to_exact_sdk_width_and_height() -> None:
    images = FakeImages(response=SimpleNamespace(data=[SimpleNamespace(url="https://example.invalid/result.png")]))
    provider = VolcengineSeedreamProvider(
        api_key="secret-key",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        client_factory=lambda **_kwargs: FakeArkClient(images),
    )

    provider.generate(generation_request(aspect_ratio="custom", width=2048, height=1024))

    assert images.calls[0]["size"] == "2048x1024"


@pytest.mark.parametrize(
    ("overrides", "expected_code"),
    [
        ({"aspect_ratio": "5:4"}, "unsupported_aspect_ratio"),
        ({"aspect_ratio": "custom", "width": 2048, "height": None}, "invalid_custom_size"),
        ({"aspect_ratio": "1:1", "width": 1024, "height": 1024}, "invalid_custom_size"),
    ],
)
def test_rejects_invalid_size_intent_before_calling_sdk(overrides: dict[str, Any], expected_code: str) -> None:
    images = FakeImages(response=None)
    provider = VolcengineSeedreamProvider(
        api_key="secret-key",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        client_factory=lambda **_kwargs: FakeArkClient(images),
    )

    with pytest.raises(ProviderError) as exc_info:
        provider.generate(generation_request(**overrides))

    assert exc_info.value.code == expected_code
    assert images.calls == []


@pytest.mark.parametrize("resolution", ["4K", "1024x1024"])
def test_rejects_unsupported_resolution_before_calling_sdk(resolution: str) -> None:
    images = FakeImages(response=None)
    provider = VolcengineSeedreamProvider(
        api_key="secret-key",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        client_factory=lambda **_kwargs: FakeArkClient(images),
    )

    with pytest.raises(ProviderError) as exc_info:
        provider.generate(generation_request(resolution=resolution))

    assert exc_info.value.code == "unsupported_resolution"
    assert exc_info.value.retryable is False
    assert images.calls == []


def test_normalizes_retryable_vendor_error_and_redacts_suspected_credentials() -> None:
    class VendorRateLimitError(Exception):
        status_code = 429
        request_id = "req-rate-limit"
        headers = {
            "authorization": "Bearer header-secret",
            "x-request-id": request_id,
        }
        body = {
            "message": "api_key=body-secret Authorization: Bearer second-secret",
        }

    images = FakeImages(error=VendorRateLimitError("token=exception-secret"))
    provider = VolcengineSeedreamProvider(
        api_key="client-secret",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        client_factory=lambda **_kwargs: FakeArkClient(images),
    )

    with pytest.raises(ProviderError) as exc_info:
        provider.generate(generation_request())

    error = exc_info.value
    assert error.code == "rate_limited"
    assert error.retryable is True
    assert error.request_id == "req-rate-limit"
    assert "exception-secret" not in error.message
    assert "header-secret" not in error.message
    assert "body-secret" not in error.message
    assert "second-secret" not in error.message
    assert "client-secret" not in error.message


def test_vendor_secret_is_absent_from_exception_chain_and_formatted_traceback() -> None:
    raw_secret = "raw-vendor-secret"

    class VendorError(Exception):
        status_code = 500

    images = FakeImages(error=VendorError(f"Authorization: Bearer {raw_secret}"))
    provider = VolcengineSeedreamProvider(
        api_key="client-secret",
        base_url="https://ark.cn-beijing.volces.com/api/v3",
        client_factory=lambda **_kwargs: FakeArkClient(images),
    )

    with pytest.raises(ProviderError) as exc_info:
        provider.generate(generation_request())

    error = exc_info.value
    formatted = "".join(traceback.format_exception(error))
    assert raw_secret not in error.message
    assert error.__cause__ is None
    assert error.__context__ is None
    assert raw_secret not in formatted


def test_rejects_zero_or_multiple_outputs() -> None:
    for data in ([], [SimpleNamespace(url="one", size="1K"), SimpleNamespace(url="two", size="1K")]):
        images = FakeImages(response=SimpleNamespace(data=data, request_id="req-output"))
        provider = VolcengineSeedreamProvider(
            api_key="secret-key",
            base_url="https://ark.cn-beijing.volces.com/api/v3",
            client_factory=lambda **_kwargs: FakeArkClient(images),
        )

        with pytest.raises(ProviderError) as exc_info:
            provider.generate(generation_request(inputs=(), prompt_document=PromptDocument(segments=(PromptTextSegment(text="雪地"),))))

        assert exc_info.value.code == "invalid_output_count"
        assert exc_info.value.retryable is False
