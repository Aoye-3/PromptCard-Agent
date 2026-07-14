from __future__ import annotations

import ipaddress
import socket
import warnings
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from io import BytesIO
from urllib.parse import urljoin, urlsplit

import httpx
from PIL import Image, UnidentifiedImageError

MAX_IMAGE_BYTES = 25 * 1024 * 1024
MAX_IMAGE_PIXELS = 40_000_000
MAX_REDIRECTS = 3
OFFICIAL_IMAGE_HOSTS = frozenset({"ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com"})
ALLOWED_IMAGE_MIME_TYPES = {
    "image/png": ("PNG", ".png"),
    "image/jpeg": ("JPEG", ".jpg"),
    "image/webp": ("WEBP", ".webp"),
}

AddressResolver = Callable[[str], Sequence[str]]


class ImageFetchError(RuntimeError):
    def __init__(self, code: str, message: str, retryable: bool) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


@dataclass(frozen=True, slots=True)
class FetchedImage:
    content: bytes
    content_type: str
    width: int
    height: int
    extension: str


class _PinnedIPTransport(httpx.BaseTransport):
    def __init__(self, transport: httpx.BaseTransport) -> None:
        self._transport = transport

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        validated_ip = request.extensions.pop("validated_ip", None)
        validated_host = request.extensions.pop("validated_host", None)
        if not isinstance(validated_ip, str) or not isinstance(validated_host, str):
            raise httpx.TransportError("A validated image host and address are required")

        headers = request.headers.copy()
        headers["host"] = validated_host
        extensions = dict(request.extensions)
        extensions["sni_hostname"] = validated_host
        pinned_request = httpx.Request(
            request.method,
            request.url.copy_with(host=validated_ip),
            headers=headers,
            stream=request.stream,
            extensions=extensions,
        )
        return self._transport.handle_request(pinned_request)

    def close(self) -> None:
        self._transport.close()


class ImageResultFetcher:
    def __init__(
        self,
        *,
        transport: httpx.BaseTransport | None = None,
        allowed_hosts: set[str] | frozenset[str] = OFFICIAL_IMAGE_HOSTS,
        resolver: AddressResolver | None = None,
        max_bytes: int = MAX_IMAGE_BYTES,
        max_pixels: int = MAX_IMAGE_PIXELS,
        max_redirects: int = MAX_REDIRECTS,
    ) -> None:
        self._timeout = httpx.Timeout(connect=3.0, read=10.0, write=3.0, pool=3.0)
        self._client = httpx.Client(
            timeout=self._timeout,
            follow_redirects=False,
            transport=_PinnedIPTransport(transport or httpx.HTTPTransport()),
        )
        self._allowed_hosts = frozenset(host.lower() for host in allowed_hosts)
        self._resolver = resolver or _resolve_addresses
        self._max_bytes = max_bytes
        self._max_pixels = max_pixels
        self._max_redirects = max_redirects

    def close(self) -> None:
        self._client.close()

    def fetch(self, url: str) -> FetchedImage:
        current_url = url
        try:
            for redirect_count in range(self._max_redirects + 1):
                validated_host, validated_ip = self._validate_url(current_url)
                with self._client.stream(
                    "GET",
                    current_url,
                    timeout=self._timeout,
                    follow_redirects=False,
                    extensions={"validated_host": validated_host, "validated_ip": validated_ip},
                ) as response:
                    if response.status_code in {301, 302, 303, 307, 308}:
                        location = response.headers.get("location")
                        if not location or redirect_count == self._max_redirects:
                            raise ImageFetchError("image_redirect_rejected", "Remote image redirect was rejected", False)
                        current_url = urljoin(current_url, location)
                        continue
                    if not 200 <= response.status_code < 300:
                        retryable = response.status_code in {408, 429} or response.status_code >= 500
                        raise ImageFetchError("image_download_failed", "Remote image download failed", retryable)
                    return self._read_image(response)
        except ImageFetchError:
            raise
        except httpx.TimeoutException:
            raise ImageFetchError("image_download_timeout", "Remote image download timed out", True) from None
        except httpx.HTTPError:
            raise ImageFetchError("image_download_failed", "Remote image download failed", True) from None
        raise ImageFetchError("image_redirect_rejected", "Remote image redirect was rejected", False)

    def _validate_url(self, url: str) -> tuple[str, str]:
        try:
            parsed = urlsplit(url)
            port = parsed.port
        except ValueError:
            raise ImageFetchError("unsafe_image_url", "Remote image URL is not allowed", False) from None
        hostname = parsed.hostname.lower() if parsed.hostname else ""
        if (
            parsed.scheme.lower() != "https"
            or hostname not in self._allowed_hosts
            or parsed.username is not None
            or parsed.password is not None
            or port not in {None, 443}
        ):
            raise ImageFetchError("unsafe_image_url", "Remote image URL is not allowed", False)
        try:
            addresses = tuple(self._resolver(hostname))
        except (OSError, ValueError):
            raise ImageFetchError("image_host_unresolved", "Remote image host could not be resolved", True) from None
        if not addresses or any(not _is_public_address(address) for address in addresses):
            raise ImageFetchError("unsafe_image_url", "Remote image URL is not allowed", False)
        return hostname, addresses[0]

    def _read_image(self, response: httpx.Response) -> FetchedImage:
        content_type = response.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        expected = ALLOWED_IMAGE_MIME_TYPES.get(content_type)
        if expected is None:
            raise ImageFetchError("invalid_image_mime", "Remote response is not a supported raster image", False)
        content_length = response.headers.get("content-length")
        if content_length is not None:
            try:
                if int(content_length) > self._max_bytes:
                    raise ImageFetchError("image_too_large", "Remote image exceeds the download limit", False)
            except ValueError:
                raise ImageFetchError("image_download_failed", "Remote image download failed", False) from None

        content = bytearray()
        for chunk in response.iter_bytes():
            content.extend(chunk)
            if len(content) > self._max_bytes:
                raise ImageFetchError("image_too_large", "Remote image exceeds the download limit", False)
        if not content:
            raise ImageFetchError("invalid_image_data", "Remote image could not be decoded", False)

        raw = bytes(content)
        width, height, extension = validate_image_content(
            raw,
            content_type,
            max_bytes=self._max_bytes,
            max_pixels=self._max_pixels,
        )
        return FetchedImage(content=raw, content_type=content_type, width=width, height=height, extension=extension)


def validate_image_content(
    content: bytes,
    content_type: str,
    *,
    max_bytes: int = MAX_IMAGE_BYTES,
    max_pixels: int = MAX_IMAGE_PIXELS,
) -> tuple[int, int, str]:
    normalized_content_type = content_type.split(";", 1)[0].strip().lower()
    expected = ALLOWED_IMAGE_MIME_TYPES.get(normalized_content_type)
    if expected is None:
        raise ImageFetchError("invalid_image_mime", "Image is not a supported raster type", False)
    if not content or len(content) > max_bytes:
        raise ImageFetchError("image_too_large", "Image exceeds the byte limit", False)

    width = 0
    height = 0
    raw = bytes(content)
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as image:
                width, height = image.size
                if width <= 0 or height <= 0 or width * height > max_pixels:
                    raise ImageFetchError("image_pixel_budget_exceeded", "Image exceeds the pixel limit", False)
                if image.format != expected[0]:
                    raise ImageFetchError("invalid_image_data", "Image type does not match its content", False)
                image.verify()
            with Image.open(BytesIO(raw)) as decoded:
                decoded.load()
    except ImageFetchError:
        raise
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise ImageFetchError("invalid_image_data", "Image could not be decoded", False) from None

    return width, height, expected[1]


def _resolve_addresses(hostname: str) -> tuple[str, ...]:
    return tuple({entry[4][0] for entry in socket.getaddrinfo(hostname, 443, type=socket.SOCK_STREAM)})


def _is_public_address(value: str) -> bool:
    try:
        return ipaddress.ip_address(value).is_global
    except ValueError:
        return False
