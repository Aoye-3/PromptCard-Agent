from __future__ import annotations

import base64
import threading
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from io import BytesIO
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.gateway.app import create_app
from app.gateway.image_generation.contracts import (
    ImageGenerationResult,
    PointRegion,
    PromptDocument,
    PromptReferenceSegment,
    PromptTextSegment,
    ProviderError,
    ProviderImage,
)
from app.gateway.image_generation.result_fetcher import FetchedImage, ImageFetchError
from app.gateway.image_generation.service import (
    ConnectionContext,
    GenerationAssetInput,
    GenerationCommand,
    GenerationError,
    GenerationOutcome,
    ImageGenerationService,
    StorageAsset,
)

REMOTE_URL = "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/result.png?token=remote-secret"


def png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (4, 3), "white").save(output, format="PNG")
    return output.getvalue()


class FakeStorage:
    def __init__(self) -> None:
        self.operations: list[tuple[str, Any]] = []
        self.asset = StorageAsset(content=png_bytes(), content_type="image/png")
        self.fail_upload = False
        self._lock = threading.Lock()

    def _record(self, operation: str, payload: Any) -> None:
        with self._lock:
            self.operations.append((operation, payload))

    def create_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._record("create_run", payload)
        return {**payload, "state": "queued"}

    def update_run(self, run_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        self._record("update_run", (run_id, patch))
        return {"id": run_id, **patch}

    def load_asset(self, asset_id: str) -> StorageAsset:
        self._record("load_asset", asset_id)
        return self.asset

    def upload_asset(self, filename: str, content_type: str, content: bytes) -> dict[str, Any]:
        self._record("upload_asset", (filename, content_type, content))
        if self.fail_upload:
            raise OSError("storage secret=raw-storage-secret")
        return {"id": "asset-generated.png", "filename": filename, "contentType": content_type, "size": len(content)}

    def create_capture(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._record("create_capture", payload)
        return {**payload, "id": "capture-generated", "revision": 1}


class FakeConnections:
    def __init__(self, credential: str | None = "ark-secret") -> None:
        self.credential = credential

    def resolve(self, connection_id: str) -> ConnectionContext:
        return ConnectionContext(
            connection_id=connection_id,
            provider_id="volcengine-ark",
            api_base="https://ark.cn-beijing.volces.com/api/v3",
            enabled=True,
            credential=self.credential,
        )


class FakeProvider:
    def __init__(self, error: ProviderError | None = None) -> None:
        self.error = error
        self.requests: list[Any] = []

    def generate(self, request):
        self.requests.append(request)
        if self.error is not None:
            raise self.error
        return ImageGenerationResult(image=ProviderImage(url=REMOTE_URL, size="2048x2048"), request_id="provider-request-1")


class FakeFetcher:
    def __init__(self, error: ImageFetchError | None = None) -> None:
        self.error = error
        self.urls: list[str] = []

    def fetch(self, url: str) -> FetchedImage:
        self.urls.append(url)
        if self.error is not None:
            raise self.error
        return FetchedImage(content=png_bytes(), content_type="image/png", width=4, height=3, extension=".png")


def command(run_id: str = "run-1") -> GenerationCommand:
    return GenerationCommand(
        run_id=run_id,
        project_id="project-1",
        node_id="node-1",
        connection_id="connection-1",
        model_id="doubao-seedream-5-0-pro-260628",
        mode="edit",
        prompt_document=PromptDocument(
            segments=(
                PromptTextSegment(text="让"),
                PromptReferenceSegment(reference_id="subject", label="主体"),
                PromptTextSegment(text="站在雪地里"),
            )
        ),
        inputs=(GenerationAssetInput(reference_id="subject", asset_id="asset-input.png", order=0),),
        regions=(PointRegion(reference_id="subject", x=200, y=300),),
        resolution="2K",
        output_format="png",
        watermark=False,
    )


def make_service(
    *,
    storage: FakeStorage | None = None,
    connections: FakeConnections | None = None,
    provider: FakeProvider | None = None,
    fetcher: FakeFetcher | None = None,
) -> tuple[ImageGenerationService, FakeStorage, FakeProvider, FakeFetcher]:
    storage = storage or FakeStorage()
    provider = provider or FakeProvider()
    fetcher = fetcher or FakeFetcher()
    service = ImageGenerationService(
        storage=storage,
        connections=connections or FakeConnections(),
        provider_factory=lambda _connection: provider,
        result_fetcher=fetcher,
    )
    return service, storage, provider, fetcher


def test_success_persists_state_localizes_result_and_returns_no_remote_url() -> None:
    service, storage, provider, fetcher = make_service()

    result = service.generate(command())

    assert [operation for operation, _payload in storage.operations] == [
        "create_run",
        "update_run",
        "load_asset",
        "upload_asset",
        "create_capture",
        "update_run",
    ]
    queued = storage.operations[0][1]
    assert queued["state"] == "queued"
    assert queued["requestSnapshot"]["inputAssets"] == [{"referenceId": "subject", "assetId": "asset-input.png", "order": 0}]
    assert REMOTE_URL not in repr(queued)

    assert storage.operations[1][1][1]["state"] == "running"
    succeeded = storage.operations[-1][1][1]
    assert succeeded == {
        "state": "succeeded",
        "providerRequestId": "provider-request-1",
        "outputAssetIds": ["asset-generated.png"],
    }
    capture = storage.operations[-2][1]
    assert capture["purpose"] == "generatedResult"
    assert capture["kind"] == "pastedMedia"
    assert capture["assetId"] == "asset-generated.png"
    assert capture["sourceUrl"] == ""
    assert capture["linkedProjectId"] == "project-1"
    assert capture["linkedCanvasNodeId"] == "node-1"
    assert (capture["width"], capture["height"]) == (4, 3)

    assert len(provider.requests) == 1
    provider_input = provider.requests[0].inputs[0]
    assert provider_input.image.startswith("data:image/png;base64,")
    assert base64.b64decode(provider_input.image.split(",", 1)[1]) == png_bytes()
    assert fetcher.urls == [REMOTE_URL]

    assert result.state == "succeeded"
    assert result.asset_id == "asset-generated.png"
    assert result.capture_id == "capture-generated"
    assert REMOTE_URL not in repr(result)
    assert "remote_url" not in result.__dataclass_fields__


def test_resolved_connection_repr_never_contains_credential() -> None:
    connection = FakeConnections(credential="raw-connection-secret").resolve("connection-1")
    assert "raw-connection-secret" not in repr(connection)


@pytest.mark.parametrize(
    ("failure", "expected_code", "expected_retryable"),
    [
        ("credential", "credential_missing", False),
        ("capability", "unsupported_resolution", False),
        ("provider_429", "rate_limited", True),
        ("provider_500", "provider_request_failed", True),
        ("unsafe_url", "unsafe_image_url", False),
        ("timeout", "image_download_timeout", True),
        ("decode", "invalid_image_data", False),
        ("asset", "invalid_input_asset", False),
        ("upload", "storage_write_failed", True),
    ],
)
def test_every_post_create_failure_persists_failed_terminal_state(failure: str, expected_code: str, expected_retryable: bool) -> None:
    storage = FakeStorage()
    connections = FakeConnections(credential=None if failure == "credential" else "ark-secret")
    provider = FakeProvider()
    fetcher = FakeFetcher()
    request = command()

    if failure == "capability":
        request = replace(request, resolution="4K")
    elif failure == "provider_429":
        provider.error = ProviderError("rate_limited", "Authorization: Bearer raw-provider-secret", True, "provider-request-failed")
    elif failure == "provider_500":
        provider.error = ProviderError("provider_request_failed", "api_key=raw-provider-secret", True, "provider-request-failed")
    elif failure == "unsafe_url":
        fetcher.error = ImageFetchError("unsafe_image_url", "Authorization: Bearer raw-provider-secret", False)
    elif failure == "timeout":
        fetcher.error = ImageFetchError("image_download_timeout", "Remote image download timed out", True)
    elif failure == "decode":
        fetcher.error = ImageFetchError("invalid_image_data", "Remote image could not be decoded", False)
    elif failure == "asset":
        storage.asset = StorageAsset(content=b"not-an-image", content_type="image/png")
    elif failure == "upload":
        storage.fail_upload = True

    service, _, _, _ = make_service(storage=storage, connections=connections, provider=provider, fetcher=fetcher)

    with pytest.raises(GenerationError) as exc_info:
        service.generate(request)

    error = exc_info.value
    assert error.code == expected_code
    assert error.retryable is expected_retryable
    assert error.run_id == "run-1"
    failed_patches = [payload[1] for operation, payload in storage.operations if operation == "update_run" and payload[1]["state"] == "failed"]
    assert len(failed_patches) == 1
    assert failed_patches[0]["error"] == {
        "code": expected_code,
        "message": error.message,
        "retryable": expected_retryable,
    }
    combined = f"{error.message!r} {failed_patches!r}"
    assert "raw-provider-secret" not in combined
    assert "raw-storage-secret" not in combined
    assert REMOTE_URL not in combined
    states = [payload[1]["state"] for operation, payload in storage.operations if operation == "update_run"]
    assert states == ["running", "failed"]


def test_limits_each_connection_to_two_in_flight_generations() -> None:
    storage = FakeStorage()
    started = threading.Event()
    release = threading.Event()
    lock = threading.Lock()
    calls = 0

    class BlockingProvider(FakeProvider):
        def generate(self, request):
            nonlocal calls
            with lock:
                calls += 1
                if calls == 2:
                    started.set()
            assert release.wait(timeout=5)
            return super().generate(request)

    provider = BlockingProvider()
    service, _, _, _ = make_service(storage=storage, provider=provider)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(service.generate, command("run-first"))
        second = pool.submit(service.generate, command("run-second"))
        assert started.wait(timeout=5)

        with pytest.raises(GenerationError) as exc_info:
            service.generate(command("run-busy"))

        assert exc_info.value.code == "generation_busy"
        assert exc_info.value.retryable is True
        release.set()
        assert first.result(timeout=5).state == "succeeded"
        assert second.result(timeout=5).state == "succeeded"

    busy_patches = [payload[1] for operation, payload in storage.operations if operation == "update_run" and payload[0] == "run-busy"]
    assert [patch["state"] for patch in busy_patches] == ["running", "failed"]
    assert calls == 2


def test_gateway_registers_image_generation_route() -> None:
    app = create_app()
    paths = {route.path for route in app.routes}
    assert "/api/promptcard/runtime/image-generations" in paths


def test_router_maps_camel_case_request_and_returns_only_local_result() -> None:
    from app.gateway.deps import get_image_generation_service
    from app.gateway.routers.image_generation import router

    received: list[GenerationCommand] = []

    class EndpointService:
        def generate(self, generation_command: GenerationCommand) -> GenerationOutcome:
            received.append(generation_command)
            return GenerationOutcome(
                run_id=generation_command.run_id,
                state="succeeded",
                asset_id="asset-local.png",
                capture_id="capture-local",
                content_type="image/png",
                width=1024,
                height=1024,
            )

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_image_generation_service] = lambda: EndpointService()

    response = TestClient(app).post(
        "/api/promptcard/runtime/image-generations",
        json={
            "projectId": "project-1",
            "nodeId": "node-1",
            "connectionId": "connection-1",
            "modelId": "doubao-seedream-5-0-pro-260628",
            "mode": "region-edit",
            "promptDocument": {
                "version": 1,
                "segments": [
                    {"type": "text", "text": "修改"},
                    {"type": "reference", "referenceId": "subject", "label": "主体"},
                ],
            },
            "inputs": [{"referenceId": "subject", "assetId": "asset-input.png", "order": 0}],
            "regions": [{"type": "point", "referenceId": "subject", "x": 20, "y": 30}],
            "resolution": "2K",
            "outputFormat": "png",
            "watermark": False,
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "runId": received[0].run_id,
        "state": "succeeded",
        "assetId": "asset-local.png",
        "captureId": "capture-local",
        "contentType": "image/png",
        "width": 1024,
        "height": 1024,
    }
    assert "url" not in repr(payload).lower()
    assert received[0].regions == (PointRegion(reference_id="subject", x=20, y=30),)
