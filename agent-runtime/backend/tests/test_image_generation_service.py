from __future__ import annotations

import asyncio
import base64
import logging
import threading
import traceback
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from io import BytesIO
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from fastapi import FastAPI, HTTPException
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
    PromptCardStorageClient,
    StorageAsset,
    StorageGatewayError,
)

REMOTE_URL = "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/result.png?token=remote-secret"


def png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (4, 3), "white").save(output, format="PNG")
    return output.getvalue()


def input_png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (16, 16), "white").save(output, format="PNG")
    return output.getvalue()


class FakeStorage:
    def __init__(self) -> None:
        self.operations: list[tuple[str, Any]] = []
        self.asset = StorageAsset(content=input_png_bytes(), content_type="image/png")
        self.fail_upload = False
        self._lock = threading.Lock()
        self.runs: dict[str, dict[str, Any]] = {}

    def _record(self, operation: str, payload: Any) -> None:
        with self._lock:
            self.operations.append((operation, payload))

    def create_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        self._record("create_run", payload)
        created = {**payload, "state": "queued"}
        self.runs[payload["id"]] = created
        return created

    def update_run(self, run_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        self._record("update_run", (run_id, patch))
        updated = {**self.runs[run_id], **patch}
        self.runs[run_id] = updated
        return updated

    def get_run(self, run_id: str, _project_id: str) -> dict[str, Any]:
        self._record("get_run", run_id)
        return dict(self.runs[run_id])

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
    def __init__(
        self,
        credential: str | None = "ark-secret",
        credential_error: Exception | None = None,
        *,
        enabled: bool = True,
        last_test_ok: bool | None = True,
    ) -> None:
        self.credential = credential
        self.credential_error = credential_error
        self.enabled = enabled
        self.last_test_ok = last_test_ok
        self.metadata_reads = 0
        self.credential_reads = 0

    def resolve_metadata(self, connection_id: str) -> Any:
        self.metadata_reads += 1
        return SimpleNamespace(
            connection_id=connection_id,
            provider_id="volcengine-ark",
            api_base="https://ark.cn-beijing.volces.com/api/v3",
            enabled=self.enabled,
            last_test_ok=self.last_test_ok,
        )

    def get_credential(self, _connection_id: str) -> str | None:
        self.credential_reads += 1
        if self.credential_error is not None:
            raise self.credential_error
        return self.credential


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
        conversation_id=None,
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
        aspect_ratio="smart",
        width=None,
        height=None,
        output_format="png",
        watermark=False,
        prompt_optimization="standard",
    )


def conversation_command(run_id: str = "run-conversation") -> GenerationCommand:
    return replace(command(run_id), node_id=None, conversation_id="conversation-1")


def make_service(
    *,
    storage: FakeStorage | None = None,
    connections: FakeConnections | None = None,
    provider: FakeProvider | None = None,
    fetcher: FakeFetcher | None = None,
    max_input_bytes_total: int | None = None,
    max_running_total: int | None = None,
    readiness_probe=None,
) -> tuple[ImageGenerationService, FakeStorage, FakeProvider, FakeFetcher]:
    storage = storage or FakeStorage()
    provider = provider or FakeProvider()
    fetcher = fetcher or FakeFetcher()
    limits = {
        **({"max_input_bytes_total": max_input_bytes_total} if max_input_bytes_total is not None else {}),
        **({"max_running_total": max_running_total} if max_running_total is not None else {}),
    }
    service = ImageGenerationService(
        storage=storage,
        connections=connections or FakeConnections(),
        provider_factory=lambda _connection: provider,
        result_fetcher=fetcher,
        readiness_probe=readiness_probe,
        **limits,
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
    assert queued["requestSnapshot"]["inputAssets"] == [
        {
            "referenceId": "subject",
            "assetId": "asset-input.png",
            "role": "reference-image",
            "order": 0,
        }
    ]
    assert queued["requestSnapshot"]["resolution"] == "2K"
    assert queued["requestSnapshot"]["aspectRatio"] == "smart"
    assert queued["requestSnapshot"]["promptOptimization"] == "standard"
    assert "width" not in queued["requestSnapshot"]
    assert "height" not in queued["requestSnapshot"]
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
    assert base64.b64decode(provider_input.image.split(",", 1)[1]) == input_png_bytes()
    assert provider_input.role == "reference-image"
    assert provider_input.source_asset_id is None
    assert fetcher.urls == [REMOTE_URL]

    assert result.state == "succeeded"
    assert result.asset_id == "asset-generated.png"
    assert result.capture_id == "capture-generated"
    assert REMOTE_URL not in repr(result)
    assert "remote_url" not in result.__dataclass_fields__


@pytest.mark.parametrize(
    ("readiness", "expected_code"),
    [
        ({"serverEnabled": False, "credentialStore": {"available": True}, "providers": []}, "image_generation_disabled"),
        (
            {
                "serverEnabled": True,
                "credentialStore": {"available": False},
                "providers": [{"providerId": "volcengine-ark", "status": "ready"}],
            },
            "credential_store_unavailable",
        ),
        (
            {
                "serverEnabled": True,
                "credentialStore": {"available": True},
                "providers": [{"providerId": "volcengine-ark", "status": "incompatible"}],
            },
            "ark_sdk_incompatible",
        ),
    ],
)
def test_runtime_readiness_gate_fails_before_connection_or_credential_access(
    readiness: dict[str, Any],
    expected_code: str,
) -> None:
    connections = FakeConnections()
    service, storage, provider, _fetcher = make_service(
        connections=connections,
        readiness_probe=lambda: readiness,
    )

    with pytest.raises(GenerationError) as exc_info:
        service.generate(command(f"run-ready-{expected_code}"))

    assert exc_info.value.code == expected_code
    assert connections.metadata_reads == 0
    assert connections.credential_reads == 0
    assert provider.requests == []
    assert storage.runs[f"run-ready-{expected_code}"]["state"] == "failed"


@pytest.mark.parametrize(
    ("last_test_ok", "expected_code"),
    [(None, "connection_not_tested"), (False, "connection_test_failed")],
)
def test_connection_must_have_latest_successful_test_before_credential_access(
    last_test_ok: bool | None,
    expected_code: str,
) -> None:
    connections = FakeConnections(last_test_ok=last_test_ok)
    service, storage, provider, _fetcher = make_service(connections=connections)

    with pytest.raises(GenerationError) as exc_info:
        service.generate(command(f"run-{expected_code}"))

    assert exc_info.value.code == expected_code
    assert connections.credential_reads == 0
    assert provider.requests == []
    assert storage.runs[f"run-{expected_code}"]["state"] == "failed"


def test_input_role_and_source_asset_are_preserved_in_history_and_provider_request() -> None:
    service, storage, provider, _fetcher = make_service()
    request = replace(
        command("run-input-role"),
        inputs=(
            GenerationAssetInput(
                reference_id="subject",
                asset_id="asset-derived.png",
                order=0,
                role="source-image",
                source_asset_id="asset-original.heic",
            ),
        ),
    )

    service.generate(request)

    assert storage.operations[0][1]["requestSnapshot"]["inputAssets"] == [
        {
            "referenceId": "subject",
            "assetId": "asset-derived.png",
            "sourceAssetId": "asset-original.heic",
            "role": "source-image",
            "order": 0,
        }
    ]
    assert provider.requests[0].inputs[0].role == "source-image"
    assert provider.requests[0].inputs[0].source_asset_id == "asset-original.heic"


def test_base64_provider_result_is_validated_and_saved_without_remote_fetch() -> None:
    class Base64Provider(FakeProvider):
        def generate(self, request):
            self.requests.append(request)
            return ImageGenerationResult(
                image=ProviderImage(
                    b64_json=base64.b64encode(png_bytes()).decode("ascii"),
                    size="4x3",
                ),
                request_id="provider-base64",
                usage={"generatedImages": 1, "outputTokens": 4, "totalTokens": 4},
            )

    provider = Base64Provider()
    service, storage, _provider, fetcher = make_service(provider=provider)

    result = service.generate(command("run-base64"))

    assert fetcher.urls == []
    upload = next(payload for operation, payload in storage.operations if operation == "upload_asset")
    assert upload[1] == "image/png"
    assert upload[2] == png_bytes()
    succeeded = storage.operations[-1][1][1]
    assert succeeded["usage"] == {
        "generatedImages": 1,
        "outputTokens": 4,
        "totalTokens": 4,
    }
    assert "providerUsage" not in succeeded
    assert result.width == 4
    assert result.height == 3


def test_seedream_input_constraints_are_enforced_before_credential_access() -> None:
    storage = FakeStorage()
    output = BytesIO()
    Image.new("RGB", (14, 100), "white").save(output, format="PNG")
    storage.asset = StorageAsset(content=output.getvalue(), content_type="image/png")
    connections = FakeConnections()
    service, _, provider, _fetcher = make_service(storage=storage, connections=connections)

    with pytest.raises(GenerationError) as exc_info:
        service.generate(command("run-small-side"))

    assert exc_info.value.code == "invalid_input_asset"
    assert connections.credential_reads == 0
    assert provider.requests == []


def test_conversation_generation_persists_conversation_without_fabricating_canvas_node() -> None:
    service, storage, provider, _fetcher = make_service()

    result = service.generate(conversation_command())

    queued = storage.operations[0][1]
    assert queued["projectId"] == "project-1"
    assert queued["conversationId"] == "conversation-1"
    assert "nodeId" not in queued
    capture = next(payload for operation, payload in storage.operations if operation == "create_capture")
    assert capture["linkedProjectId"] == "project-1"
    assert "linkedCanvasNodeId" not in capture
    assert len(provider.requests) == 1
    assert result.state == "succeeded"


def test_conversation_generation_uses_only_current_request_snapshot_and_never_reads_prior_runs() -> None:
    storage = FakeStorage()
    storage.runs["historical-run"] = {
        "id": "historical-run",
        "projectId": "project-1",
        "conversationId": "conversation-1",
        "requestSnapshot": {"promptDocument": {"segments": [{"type": "text", "text": "historical secret prompt"}]}},
        "state": "succeeded",
    }
    service, _, provider, _fetcher = make_service(storage=storage)
    current = replace(
        conversation_command("run-current"),
        prompt_document=PromptDocument(segments=(PromptTextSegment(text="current request only"),)),
        inputs=(),
        regions=(),
        mode="generate",
    )

    service.generate(current)

    queued = storage.operations[0][1]
    assert queued["requestSnapshot"]["promptDocument"]["segments"] == [{"type": "text", "text": "current request only"}]
    assert not any(operation == "get_run" and payload == "historical-run" for operation, payload in storage.operations)
    assert provider.requests[0].prompt_document == current.prompt_document
    assert "historical secret prompt" not in repr(provider.requests[0])


def test_conversation_project_mismatch_is_sanitized_and_never_calls_provider() -> None:
    class MismatchedConversationStorage(FakeStorage):
        def create_run(self, payload: dict[str, Any]) -> dict[str, Any]:
            raise StorageGatewayError(status_code=404)

    provider = FakeProvider()
    service, _, _, _ = make_service(storage=MismatchedConversationStorage(), provider=provider)

    with pytest.raises(GenerationError) as exc_info:
        service.generate(conversation_command("run-project-mismatch"))

    error = exc_info.value
    assert error.code == "image_generation_conversation_not_found"
    assert error.retryable is False
    assert error.__cause__ is None
    assert error.__context__ is None
    assert provider.requests == []


def test_storage_client_preserves_not_found_status_without_retaining_response_body() -> None:
    raw_storage_body = "conversation belongs to project-secret api_key=raw-secret"

    def storage_handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(404, json={"detail": raw_storage_body})

    client = httpx.Client(base_url="http://storage.test", transport=httpx.MockTransport(storage_handler))
    storage = PromptCardStorageClient(client=client)

    with pytest.raises(StorageGatewayError) as exc_info:
        storage.create_run({"id": "run-project-mismatch"})

    error = exc_info.value
    assert error.status_code == 404
    assert raw_storage_body not in "".join(traceback.format_exception(error))
    client.close()


def test_custom_size_is_preserved_in_history_and_provider_request() -> None:
    service, storage, provider, _fetcher = make_service()

    service.generate(replace(command(), aspect_ratio="custom", width=2048, height=1024))

    snapshot = storage.operations[0][1]["requestSnapshot"]
    assert snapshot["aspectRatio"] == "custom"
    assert snapshot["width"] == 2048
    assert snapshot["height"] == 1024
    assert provider.requests[0].aspect_ratio == "custom"
    assert provider.requests[0].width == 2048
    assert provider.requests[0].height == 1024


@pytest.mark.parametrize(
    ("width", "height"),
    [
        (1280, 720),
        (5660, 817),
        (3840, 240),
        (240, 3840),
    ],
)
def test_custom_size_accepts_inclusive_official_pixel_and_ratio_boundaries(width: int, height: int) -> None:
    service, _storage, provider, _fetcher = make_service()

    service.generate(replace(command(f"run-boundary-{width}-{height}"), aspect_ratio="custom", width=width, height=height))

    assert provider.requests[0].width == width
    assert provider.requests[0].height == height


@pytest.mark.parametrize(
    "changes",
    [
        {"aspect_ratio": "5:4"},
        {"aspect_ratio": "custom", "width": None, "height": None},
        {"aspect_ratio": "custom", "width": 2048, "height": None},
        {"aspect_ratio": "custom", "width": True, "height": 1024},
        {"aspect_ratio": "custom", "width": 1024.0, "height": 1024},
        {"aspect_ratio": "custom", "width": 0, "height": 1024},
        {"aspect_ratio": "custom", "width": 1024, "height": 899},
        {"aspect_ratio": "custom", "width": 4624221, "height": 1},
        {"aspect_ratio": "custom", "width": 16001, "height": 1000},
        {"aspect_ratio": "custom", "width": 1000, "height": 16001},
        {"aspect_ratio": "1:1", "width": 1024, "height": 1024},
    ],
)
def test_invalid_size_intent_fails_before_asset_or_credential_access(changes: dict[str, Any]) -> None:
    storage = FakeStorage()
    connections = FakeConnections(credential_error=OSError("keyring raw-secret"))
    provider = FakeProvider()
    service, _, _, _ = make_service(storage=storage, connections=connections, provider=provider)

    with pytest.raises(GenerationError) as exc_info:
        service.generate(replace(command("run-invalid-size"), **changes))

    assert exc_info.value.code in {"unsupported_aspect_ratio", "invalid_custom_size"}
    assert connections.credential_reads == 0
    assert provider.requests == []
    assert not any(operation == "load_asset" for operation, _payload in storage.operations)
    assert storage.runs["run-invalid-size"]["state"] == "failed"
    snapshot = storage.runs["run-invalid-size"]["requestSnapshot"]
    if changes.get("aspect_ratio") == "custom":
        if changes.get("width") is not None:
            assert snapshot["width"] == changes["width"]
        if changes.get("height") is not None:
            assert snapshot["height"] == changes["height"]
    else:
        assert "width" not in snapshot
        assert "height" not in snapshot


def test_resolved_connection_repr_never_contains_credential() -> None:
    connections = FakeConnections(credential="raw-connection-secret")
    metadata = connections.resolve_metadata("connection-1")
    connection = ConnectionContext(
        connection_id=metadata.connection_id,
        provider_id=metadata.provider_id,
        api_base=metadata.api_base,
        enabled=metadata.enabled,
        credential=connections.get_credential("connection-1"),
    )
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


def test_result_localization_failure_logs_only_safe_provider_context(caplog: pytest.LogCaptureFixture) -> None:
    fetcher = FakeFetcher(ImageFetchError("unsafe_image_url", "Remote image URL is not allowed", False))
    service, _, _, _ = make_service(fetcher=fetcher)

    with caplog.at_level(logging.WARNING, logger="app.gateway.image_generation.service"):
        with pytest.raises(GenerationError):
            service.generate(command("run-safe-diagnostics"))

    diagnostics = "\n".join(caplog.messages)
    assert "provider-request-1" in diagnostics
    assert "ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com" in diagnostics
    assert "run-safe-diagnostics" in diagnostics
    assert "remote-secret" not in diagnostics
    assert REMOTE_URL not in diagnostics


def test_create_run_failure_does_not_retain_raw_storage_exception() -> None:
    raw_secret = "raw-create-run-secret"

    class CreateRunFailureStorage(FakeStorage):
        def create_run(self, payload: dict[str, Any]) -> dict[str, Any]:
            raise OSError(f"Authorization: Bearer {raw_secret}")

    service, _, _, _ = make_service(storage=CreateRunFailureStorage())

    with pytest.raises(GenerationError) as exc_info:
        service.generate(command("run-create-failed"))

    error = exc_info.value
    response = {"code": error.code, "message": error.message, "retryable": error.retryable}
    formatted = "".join(traceback.format_exception(error))
    assert error.code == "storage_write_failed"
    assert error.__cause__ is None
    assert error.__context__ is None
    assert raw_secret not in formatted
    assert raw_secret not in repr(response)


def test_malformed_storage_asset_response_persists_safe_failed_state() -> None:
    class MissingAssetIdStorage(FakeStorage):
        def upload_asset(self, filename: str, content_type: str, content: bytes) -> dict[str, Any]:
            self._record("upload_asset", (filename, content_type, content))
            return {"filename": filename, "contentType": content_type, "size": len(content)}

    storage = MissingAssetIdStorage()
    service, _, _, _ = make_service(storage=storage)

    with pytest.raises(GenerationError) as exc_info:
        service.generate(command("run-missing-asset-id"))

    assert exc_info.value.code == "storage_write_failed"
    assert storage.runs["run-missing-asset-id"]["state"] == "failed"


def test_failed_terminal_patch_failure_does_not_retain_raw_storage_exception() -> None:
    raw_secret = "raw-terminal-patch-secret"

    class TerminalPatchFailureStorage(FakeStorage):
        def update_run(self, run_id: str, patch: dict[str, Any]) -> dict[str, Any]:
            if patch["state"] == "failed":
                self._record("update_run", (run_id, patch))
                raise OSError(f"Authorization: Bearer {raw_secret}")
            return super().update_run(run_id, patch)

    storage = TerminalPatchFailureStorage()
    provider = FakeProvider(error=ProviderError("rate_limited", "provider raw secret", True))
    service, _, _, _ = make_service(storage=storage, provider=provider)

    with pytest.raises(GenerationError) as exc_info:
        service.generate(command("run-terminal-patch-failed"))

    error = exc_info.value
    response = {"code": error.code, "message": error.message, "retryable": error.retryable}
    failed_patches = [
        payload[1]
        for operation, payload in storage.operations
        if operation == "update_run" and payload[1]["state"] == "failed"
    ]
    formatted = "".join(traceback.format_exception(error))
    assert error.code == "terminal_persistence_failed"
    assert error.__cause__ is None
    assert error.__context__ is None
    assert raw_secret not in formatted
    assert raw_secret not in repr(response)
    assert raw_secret not in repr(failed_patches)


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


def test_rejects_reference_images_over_the_aggregate_byte_budget_before_credential_access() -> None:
    storage = FakeStorage()
    connections = FakeConnections()
    service, _, provider, _ = make_service(
        storage=storage,
        connections=connections,
        max_input_bytes_total=len(storage.asset.content) + 1,
    )
    generation_command = replace(
        command("run-input-budget"),
        inputs=(
            GenerationAssetInput(reference_id="subject", asset_id="asset-one.png", order=0),
            GenerationAssetInput(reference_id="background", asset_id="asset-two.png", order=1),
        ),
    )

    with pytest.raises(GenerationError) as exc_info:
        service.generate(generation_command)

    assert exc_info.value.code == "input_images_too_large"
    assert exc_info.value.retryable is False
    assert connections.credential_reads == 0
    assert provider.requests == []
    assert storage.runs[generation_command.run_id]["state"] == "failed"


def test_global_limit_cannot_be_bypassed_with_multiple_connections() -> None:
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

    service, _, _, _ = make_service(
        storage=storage,
        provider=BlockingProvider(),
        max_running_total=2,
    )
    first_command = replace(command("run-global-first"), connection_id="connection-one")
    second_command = replace(command("run-global-second"), connection_id="connection-two")
    blocked_command = replace(command("run-global-blocked"), connection_id="connection-three")

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            first = pool.submit(service.generate, first_command)
            second = pool.submit(service.generate, second_command)
            assert started.wait(timeout=5)

            with pytest.raises(GenerationError) as exc_info:
                service.generate(blocked_command)

            assert exc_info.value.code == "generation_capacity_reached"
            assert exc_info.value.retryable is True
            release.set()
            assert first.result(timeout=5).state == "succeeded"
            assert second.result(timeout=5).state == "succeeded"
    finally:
        release.set()

    assert calls == 2
    assert storage.runs[blocked_command.run_id]["state"] == "failed"


@pytest.mark.parametrize("commit_before_error", [False, True])
def test_running_patch_ambiguous_failure_is_reconciled_to_failed_terminal(commit_before_error: bool) -> None:
    class StartPatchFailureStorage(FakeStorage):
        def __init__(self) -> None:
            super().__init__()
            self.failed_once = False

        def update_run(self, run_id: str, patch: dict[str, Any]) -> dict[str, Any]:
            if patch["state"] == "running" and not self.failed_once:
                self.failed_once = True
                self._record("update_run", (run_id, patch))
                if commit_before_error:
                    self.runs[run_id] = {**self.runs[run_id], **patch}
                raise OSError("ambiguous storage response secret=raw-storage-secret")
            current = self.runs[run_id]["state"]
            target = patch["state"]
            if (current, target) not in {("queued", "running"), ("running", "failed"), ("running", "succeeded")}:
                raise ValueError(f"invalid transition {current} -> {target}")
            return super().update_run(run_id, patch)

    storage = StartPatchFailureStorage()
    service, _, provider, _ = make_service(storage=storage)

    with pytest.raises(GenerationError) as exc_info:
        service.generate(command("run-start-ambiguous"))

    assert exc_info.value.code == "storage_write_failed"
    assert storage.runs["run-start-ambiguous"]["state"] == "failed"
    assert provider.requests == []
    assert "raw-storage-secret" not in repr(exc_info.value)


@pytest.mark.parametrize(
    ("invalid_kind", "expected_code"),
    [
        ("capability", "unsupported_resolution"),
        ("prompt", "missing_reference"),
        ("region", "region_coordinate_out_of_range"),
        ("asset", "invalid_input_asset"),
    ],
)
def test_invalid_request_never_reads_credential_even_when_keyring_is_broken(invalid_kind: str, expected_code: str) -> None:
    storage = FakeStorage()
    connections = FakeConnections(credential_error=OSError("keyring raw-secret"))
    request = command("run-invalid-before-keyring")
    if invalid_kind == "capability":
        request = replace(request, resolution="4K")
    elif invalid_kind == "prompt":
        request = replace(
            request,
            prompt_document=PromptDocument(segments=(PromptReferenceSegment(reference_id="missing", label="缺失"),)),
        )
    elif invalid_kind == "region":
        request = replace(request, regions=(PointRegion(reference_id="subject", x=1000, y=0),))
    elif invalid_kind == "asset":
        storage.asset = StorageAsset(content=b"not-an-image", content_type="image/png")

    service, _, provider, _ = make_service(storage=storage, connections=connections)

    with pytest.raises(GenerationError) as exc_info:
        service.generate(request)

    assert exc_info.value.code == expected_code
    assert connections.metadata_reads == 1
    assert connections.credential_reads == 0
    assert provider.requests == []
    assert storage.runs[request.run_id]["state"] == "failed"


def test_valid_request_reads_credential_once_and_normalizes_keyring_failure() -> None:
    storage = FakeStorage()
    connections = FakeConnections(credential_error=OSError("keyring raw-secret"))
    service, _, provider, _ = make_service(storage=storage, connections=connections)

    with pytest.raises(GenerationError) as exc_info:
        service.generate(command("run-keyring-failed"))

    assert exc_info.value.code == "credential_store_unavailable"
    assert connections.metadata_reads == 1
    assert connections.credential_reads == 1
    assert provider.requests == []
    assert storage.runs["run-keyring-failed"]["state"] == "failed"
    assert "raw-secret" not in repr(storage.runs["run-keyring-failed"])


def test_gateway_registers_image_generation_route() -> None:
    app = create_app()
    paths = {route.path for route in app.routes}
    assert "/api/promptcard/runtime/image-generations" in paths


def test_router_rejects_generation_when_server_feature_gate_is_disabled(monkeypatch) -> None:
    from app.gateway.deps import get_image_generation_service
    from app.gateway.routers.image_generation import router

    monkeypatch.delenv("PROMPTCARD_IMAGE_GENERATION_NODE_V1", raising=False)

    class UncalledService:
        def generate(self, _generation_command: GenerationCommand) -> GenerationOutcome:
            raise AssertionError("Disabled image generation reached the service")

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_image_generation_service] = lambda: UncalledService()
    response = TestClient(app).post(
        "/api/promptcard/runtime/image-generations",
        json={
            "projectId": "project-1",
            "nodeId": "node-1",
            "connectionId": "connection-1",
            "modelId": "doubao-seedream-5-0-pro-260628",
            "mode": "generate",
            "promptDocument": {"segments": [{"type": "text", "text": "snow"}]},
            "resolution": "1K",
            "aspectRatio": "smart",
            "outputFormat": "png",
        },
    )

    assert response.status_code == 403
    assert response.json() == {
        "detail": {
            "code": "image_generation_disabled",
            "message": "Image generation is disabled by the server rollout gate",
            "retryable": False,
        }
    }


def test_router_maps_camel_case_request_and_returns_only_local_result(monkeypatch) -> None:
    from app.gateway.deps import get_image_generation_service
    from app.gateway.routers.image_generation import router

    monkeypatch.setenv("PROMPTCARD_IMAGE_GENERATION_NODE_V1", "true")
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
            "runId": "image-run-0123456789abcdef0123456789abcdef",
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
            "regions": [{"type": "point", "referenceId": "subject", "x": 20, "y": 30}],
            "resolution": "2K",
            "aspectRatio": "custom",
            "width": 2048,
            "height": 1024,
            "outputFormat": "png",
            "watermark": False,
            "promptOptimization": "fast",
            "inputs": [
                {
                    "referenceId": "subject",
                    "assetId": "asset-input.png",
                    "sourceAssetId": "asset-original.heic",
                    "role": "source-image",
                    "order": 0,
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert received[0].run_id == "image-run-0123456789abcdef0123456789abcdef"
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
    assert received[0].aspect_ratio == "custom"
    assert (received[0].width, received[0].height) == (2048, 1024)
    assert received[0].prompt_optimization == "fast"
    assert received[0].inputs[0].role == "source-image"
    assert received[0].inputs[0].source_asset_id == "asset-original.heic"


def test_router_rejects_invalid_client_generated_run_id(monkeypatch) -> None:
    from app.gateway.deps import get_image_generation_service
    from app.gateway.routers.image_generation import router

    monkeypatch.setenv("PROMPTCARD_IMAGE_GENERATION_NODE_V1", "true")

    class UncalledService:
        def generate(self, _generation_command: GenerationCommand) -> GenerationOutcome:
            raise AssertionError("Invalid runId reached the service")

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_image_generation_service] = lambda: UncalledService()
    response = TestClient(app).post(
        "/api/promptcard/runtime/image-generations",
        json={
            "runId": "pending/run",
            "projectId": "project-1",
            "conversationId": "conversation-1",
            "connectionId": "connection-1",
            "modelId": "doubao-seedream-5-0-pro-260628",
            "mode": "generate",
            "promptDocument": {"segments": [{"type": "text", "text": "snow"}]},
            "resolution": "1K",
            "aspectRatio": "smart",
            "outputFormat": "png",
        },
    )

    assert response.status_code == 422


def test_router_accepts_project_conversation_without_node_and_preserves_legacy_node_request(monkeypatch) -> None:
    from app.gateway.deps import get_image_generation_service
    from app.gateway.routers.image_generation import router

    monkeypatch.setenv("PROMPTCARD_IMAGE_GENERATION_NODE_V1", "true")
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
    client = TestClient(app)
    base_payload = {
        "projectId": "project-1",
        "connectionId": "connection-1",
        "modelId": "doubao-seedream-5-0-pro-260628",
        "mode": "generate",
        "promptDocument": {"segments": [{"type": "text", "text": "snow"}]},
        "resolution": "1K",
        "aspectRatio": "smart",
        "outputFormat": "png",
    }

    conversation_response = client.post(
        "/api/promptcard/runtime/image-generations",
        json={**base_payload, "conversationId": "conversation-1"},
    )
    legacy_response = client.post(
        "/api/promptcard/runtime/image-generations",
        json={**base_payload, "nodeId": "node-legacy"},
    )
    missing_context_response = client.post("/api/promptcard/runtime/image-generations", json=base_payload)

    assert conversation_response.status_code == 200
    assert received[0].conversation_id == "conversation-1"
    assert received[0].node_id is None
    assert legacy_response.status_code == 200
    assert received[1].conversation_id is None
    assert received[1].node_id == "node-legacy"
    assert missing_context_response.status_code == 422


def test_router_accepts_snake_case_size_alias_and_forbids_unknown_fields() -> None:
    from app.gateway.deps import get_image_generation_service
    from app.gateway.routers.image_generation import ImageGenerationBody, router

    payload = {
        "projectId": "project-1",
        "nodeId": "node-1",
        "connectionId": "connection-1",
        "modelId": "doubao-seedream-5-0-pro-260628",
        "mode": "generate",
        "promptDocument": {"segments": [{"type": "text", "text": "snow"}]},
        "resolution": "1K",
        "aspect_ratio": "custom",
        "width": 1280,
        "height": 720,
        "outputFormat": "png",
    }

    body = ImageGenerationBody.model_validate(payload)
    assert body.aspect_ratio == "custom"
    assert (body.width, body.height) == (1280, 720)

    class UncalledService:
        def generate(self, _command: GenerationCommand) -> GenerationOutcome:
            raise AssertionError("Invalid router input reached the generation service")

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_image_generation_service] = lambda: UncalledService()
    client = TestClient(app)

    assert client.post("/api/promptcard/runtime/image-generations", json={**payload, "size": "1280x720"}).status_code == 422

    for field, value in (("width", "1280"), ("height", 720.0), ("width", True)):
        assert client.post("/api/promptcard/runtime/image-generations", json={**payload, field: value}).status_code == 422


def test_router_error_has_no_raw_secret_in_chain_traceback_or_response(monkeypatch) -> None:
    from app.gateway.deps import get_image_generation_service
    from app.gateway.routers.image_generation import ImageGenerationBody, generate_image, router

    monkeypatch.setenv("PROMPTCARD_IMAGE_GENERATION_NODE_V1", "true")
    raw_secret = "raw-handler-secret"
    payload = {
        "projectId": "project-1",
        "nodeId": "node-1",
        "connectionId": "connection-1",
        "modelId": "doubao-seedream-5-0-pro-260628",
        "mode": "generate",
        "promptDocument": {"version": 1, "segments": [{"type": "text", "text": "雪地"}]},
        "inputs": [],
        "regions": [],
        "resolution": "2K",
        "aspectRatio": "smart",
        "outputFormat": "png",
        "watermark": False,
    }

    class FailingService:
        def generate(self, _generation_command: GenerationCommand) -> GenerationOutcome:
            raise GenerationError("unsafe_image_url", f"Authorization: Bearer {raw_secret}", False, "run-failed")

    body = ImageGenerationBody.model_validate(payload)
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(generate_image(body, FailingService()))

    error = exc_info.value
    formatted = "".join(traceback.format_exception(error))
    assert error.__cause__ is None
    assert error.__context__ is None
    assert raw_secret not in formatted
    assert raw_secret not in repr(error.detail)

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_image_generation_service] = lambda: FailingService()
    response = TestClient(app).post("/api/promptcard/runtime/image-generations", json=payload)
    assert response.status_code == 422
    assert raw_secret not in response.text


def test_router_returns_sanitized_not_found_for_conversation_project_mismatch(monkeypatch) -> None:
    from app.gateway.deps import get_image_generation_service
    from app.gateway.routers.image_generation import router

    monkeypatch.setenv("PROMPTCARD_IMAGE_GENERATION_NODE_V1", "true")
    raw_secret = "conversation belongs to project-secret Authorization: Bearer raw-secret"

    class FailingService:
        def generate(self, generation_command: GenerationCommand) -> GenerationOutcome:
            raise GenerationError(
                "image_generation_conversation_not_found",
                raw_secret,
                False,
                generation_command.run_id,
            )

    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_image_generation_service] = lambda: FailingService()
    response = TestClient(app).post(
        "/api/promptcard/runtime/image-generations",
        json={
            "projectId": "project-1",
            "conversationId": "conversation-1",
            "connectionId": "connection-1",
            "modelId": "doubao-seedream-5-0-pro-260628",
            "mode": "generate",
            "promptDocument": {"segments": [{"type": "text", "text": "snow"}]},
            "resolution": "1K",
            "aspectRatio": "smart",
            "outputFormat": "png",
        },
    )

    assert response.status_code == 404
    assert response.json()["detail"] == {
        "code": "image_generation_conversation_not_found",
        "message": "The image generation conversation is unavailable",
        "retryable": False,
        "runId": response.json()["detail"]["runId"],
    }
    assert raw_secret not in response.text
