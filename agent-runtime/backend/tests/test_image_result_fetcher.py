from __future__ import annotations

from io import BytesIO

import httpx
import pytest
from PIL import Image

from app.gateway.image_generation.result_fetcher import MAX_IMAGE_BYTES, ImageFetchError, ImageResultFetcher

OFFICIAL_CDN = "ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com"
PUBLIC_IP = "93.184.216.34"


def test_generated_output_limit_matches_storage_asset_limit() -> None:
    assert MAX_IMAGE_BYTES == 200 * 1024 * 1024


def png_bytes(width: int = 4, height: int = 3) -> bytes:
    output = BytesIO()
    Image.new("RGB", (width, height), "white").save(output, format="PNG")
    return output.getvalue()


def fetcher_for(
    handler,
    *,
    resolver=lambda _host: (PUBLIC_IP,),
    max_bytes: int = 25 * 1024 * 1024,
    max_pixels: int = 40_000_000,
) -> ImageResultFetcher:
    return ImageResultFetcher(
        transport=httpx.MockTransport(handler),
        allowed_hosts={OFFICIAL_CDN},
        resolver=resolver,
        max_bytes=max_bytes,
        max_pixels=max_pixels,
    )


def test_transport_pins_validated_ip_while_preserving_host_and_tls_sni() -> None:
    class RebindingNetwork(httpx.BaseTransport):
        def __init__(self) -> None:
            self.connected_hosts: list[str] = []
            self.private_target_reached = False

        def handle_request(self, request: httpx.Request) -> httpx.Response:
            target = request.url.host
            self.connected_hosts.append(target)
            if target == OFFICIAL_CDN:
                self.private_target_reached = True
            assert request.headers["host"] == OFFICIAL_CDN
            assert request.extensions["sni_hostname"] == OFFICIAL_CDN
            return httpx.Response(200, headers={"content-type": "image/png"}, content=png_bytes(), request=request)

    network = RebindingNetwork()
    resolutions = 0

    def resolve_once(_hostname: str) -> tuple[str, ...]:
        nonlocal resolutions
        resolutions += 1
        return (PUBLIC_IP,) if resolutions == 1 else ("10.0.0.9",)

    fetcher = ImageResultFetcher(
        transport=network,
        allowed_hosts={OFFICIAL_CDN},
        resolver=resolve_once,
    )

    fetcher.fetch(f"https://{OFFICIAL_CDN}/result.png")

    assert resolutions == 1
    assert network.connected_hosts == [PUBLIC_IP]
    assert network.private_target_reached is False


def test_fetches_and_decodes_an_official_https_image() -> None:
    content = png_bytes()
    fetcher = fetcher_for(lambda request: httpx.Response(200, headers={"content-type": "image/png"}, content=content, request=request))

    image = fetcher.fetch(f"https://{OFFICIAL_CDN}/result.png?signature=opaque")

    assert image.content == content
    assert image.content_type == "image/png"
    assert image.width == 4
    assert image.height == 3
    assert image.extension == ".png"


@pytest.mark.parametrize(
    "url",
    [
        f"http://{OFFICIAL_CDN}/result.png",
        "https://localhost/result.png",
        "https://127.0.0.1/result.png",
        f"https://user:password@{OFFICIAL_CDN}/result.png",
        f"https://{OFFICIAL_CDN}:444/result.png",
    ],
)
def test_rejects_unsafe_url_shapes_before_http(url: str) -> None:
    calls: list[httpx.Request] = []
    fetcher = fetcher_for(lambda request: calls.append(request))

    with pytest.raises(ImageFetchError) as exc_info:
        fetcher.fetch(url)

    assert exc_info.value.code == "unsafe_image_url"
    assert exc_info.value.retryable is False
    assert calls == []


def test_rejects_any_private_dns_result_before_http() -> None:
    calls: list[httpx.Request] = []
    fetcher = fetcher_for(
        lambda request: calls.append(request),
        resolver=lambda _host: (PUBLIC_IP, "10.0.0.7"),
    )

    with pytest.raises(ImageFetchError) as exc_info:
        fetcher.fetch(f"https://{OFFICIAL_CDN}/result.png")

    assert exc_info.value.code == "unsafe_image_url"
    assert calls == []


def test_revalidates_dns_on_every_same_host_redirect() -> None:
    resolutions = iter(((PUBLIC_IP,), ("192.168.1.9",)))
    requests: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        return httpx.Response(302, headers={"location": f"https://{OFFICIAL_CDN}/second.png"}, request=request)

    fetcher = fetcher_for(handler, resolver=lambda _host: next(resolutions))

    with pytest.raises(ImageFetchError) as exc_info:
        fetcher.fetch(f"https://{OFFICIAL_CDN}/first.png")

    assert exc_info.value.code == "unsafe_image_url"
    assert requests == [f"https://{PUBLIC_IP}/first.png"]


def test_rejects_redirect_to_host_outside_allowlist() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(302, headers={"location": "https://evil.example/result.png"}, request=request)

    fetcher = fetcher_for(handler)

    with pytest.raises(ImageFetchError) as exc_info:
        fetcher.fetch(f"https://{OFFICIAL_CDN}/first.png")

    assert exc_info.value.code == "unsafe_image_url"


@pytest.mark.parametrize("content_type", ["text/html", "image/svg+xml", "application/octet-stream"])
def test_rejects_non_raster_image_mime(content_type: str) -> None:
    fetcher = fetcher_for(lambda request: httpx.Response(200, headers={"content-type": content_type}, content=b"not-an-image", request=request))

    with pytest.raises(ImageFetchError) as exc_info:
        fetcher.fetch(f"https://{OFFICIAL_CDN}/result")

    assert exc_info.value.code == "invalid_image_mime"


def test_rejects_download_over_byte_budget() -> None:
    fetcher = fetcher_for(
        lambda request: httpx.Response(200, headers={"content-type": "image/png"}, content=b"x" * 17, request=request),
        max_bytes=16,
    )

    with pytest.raises(ImageFetchError) as exc_info:
        fetcher.fetch(f"https://{OFFICIAL_CDN}/large.png")

    assert exc_info.value.code == "image_too_large"


def test_rejects_pixel_bomb_before_full_decode() -> None:
    content = png_bytes(11, 10)
    fetcher = fetcher_for(lambda request: httpx.Response(200, headers={"content-type": "image/png"}, content=content, request=request), max_pixels=100)

    with pytest.raises(ImageFetchError) as exc_info:
        fetcher.fetch(f"https://{OFFICIAL_CDN}/bomb.png")

    assert exc_info.value.code == "image_pixel_budget_exceeded"


def test_rejects_invalid_image_decode() -> None:
    fetcher = fetcher_for(lambda request: httpx.Response(200, headers={"content-type": "image/png"}, content=b"not-a-png", request=request))

    with pytest.raises(ImageFetchError) as exc_info:
        fetcher.fetch(f"https://{OFFICIAL_CDN}/broken.png")

    assert exc_info.value.code == "invalid_image_data"


def test_normalizes_download_timeout_without_url_or_secret() -> None:
    secret_url = f"https://{OFFICIAL_CDN}/result.png?token=raw-secret"

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("token=raw-secret", request=request)

    fetcher = fetcher_for(handler)

    with pytest.raises(ImageFetchError) as exc_info:
        fetcher.fetch(secret_url)

    assert exc_info.value.code == "image_download_timeout"
    assert exc_info.value.retryable is True
    assert "raw-secret" not in str(exc_info.value)
    assert secret_url not in str(exc_info.value)
