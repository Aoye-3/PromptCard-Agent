from __future__ import annotations

import base64
import os
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol
from urllib.parse import quote

import httpx

from app.gateway.image_generation.contracts import (
    BBoxRegion,
    ImageGenerationRequest,
    ImageInput,
    ImageRegion,
    PointRegion,
    PromptCompilationError,
    PromptDocument,
    PromptReferenceSegment,
    PromptTextSegment,
    ProviderError,
)
from app.gateway.image_generation.prompt_compiler import compile_seedream_prompt
from app.gateway.image_generation.providers.base import ImageGenerationProvider
from app.gateway.image_generation.providers.volcengine_seedream import VolcengineSeedreamProvider
from app.gateway.image_generation.result_fetcher import FetchedImage, ImageFetchError, ImageResultFetcher, validate_image_content
from app.gateway.model_management.catalog import model_by_id
from app.gateway.model_management.connection_store import ModelConnectionStore, get_connection_store

MAX_RUNNING_PER_CONNECTION = 2


class GenerationError(RuntimeError):
    def __init__(self, code: str, message: str, retryable: bool, run_id: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.run_id = run_id


class StorageGatewayError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class StorageAsset:
    content: bytes
    content_type: str


@dataclass(frozen=True, slots=True)
class ConnectionContext:
    connection_id: str
    provider_id: str
    api_base: str
    enabled: bool
    credential: str | None = field(repr=False)


@dataclass(frozen=True, slots=True)
class ConnectionMetadata:
    connection_id: str
    provider_id: str
    api_base: str
    enabled: bool


@dataclass(frozen=True, slots=True)
class GenerationAssetInput:
    reference_id: str
    asset_id: str
    order: int


@dataclass(frozen=True, slots=True)
class GenerationCommand:
    run_id: str
    project_id: str
    node_id: str
    connection_id: str
    model_id: str
    mode: str
    prompt_document: PromptDocument
    inputs: tuple[GenerationAssetInput, ...]
    regions: tuple[ImageRegion, ...]
    resolution: str
    output_format: str
    watermark: bool


@dataclass(frozen=True, slots=True)
class GenerationOutcome:
    run_id: str
    state: str
    asset_id: str
    capture_id: str
    content_type: str
    width: int
    height: int


class ImageGenerationStorage(Protocol):
    def create_run(self, payload: dict[str, Any]) -> dict[str, Any]: ...

    def update_run(self, run_id: str, patch: dict[str, Any]) -> dict[str, Any]: ...

    def get_run(self, run_id: str) -> dict[str, Any]: ...

    def load_asset(self, asset_id: str) -> StorageAsset: ...

    def upload_asset(self, filename: str, content_type: str, content: bytes) -> dict[str, Any]: ...

    def create_capture(self, payload: dict[str, Any]) -> dict[str, Any]: ...


class ConnectionResolver(Protocol):
    def resolve_metadata(self, connection_id: str) -> ConnectionMetadata: ...

    def get_credential(self, connection_id: str) -> str | None: ...


ProviderFactory = Callable[[ConnectionContext], ImageGenerationProvider]
ModelLookup = Callable[[str], dict[str, Any] | None]


class ImageGenerationService:
    def __init__(
        self,
        *,
        storage: ImageGenerationStorage,
        connections: ConnectionResolver,
        provider_factory: ProviderFactory,
        result_fetcher: ImageResultFetcher,
        model_lookup: ModelLookup = model_by_id,
        max_running_per_connection: int = MAX_RUNNING_PER_CONNECTION,
    ) -> None:
        self._storage = storage
        self._connections = connections
        self._provider_factory = provider_factory
        self._result_fetcher = result_fetcher
        self._model_lookup = model_lookup
        self._max_running_per_connection = max_running_per_connection
        self._running: dict[str, int] = {}
        self._running_lock = threading.Lock()

    def close(self) -> None:
        close_storage = getattr(self._storage, "close", None)
        if callable(close_storage):
            close_storage()
        close_fetcher = getattr(self._result_fetcher, "close", None)
        if callable(close_fetcher):
            close_fetcher()

    def generate(self, command: GenerationCommand) -> GenerationOutcome:
        try:
            self._storage.create_run(_queued_run(command))
        except Exception:
            raise GenerationError("storage_write_failed", "Image generation run could not be created", True, command.run_id) from None

        self._start_run(command.run_id)

        acquired = self._try_acquire(command.connection_id)
        failure: GenerationError | None = None
        outcome: GenerationOutcome | None = None
        provider_request_id: str | None = None
        try:
            if not acquired:
                raise GenerationError("generation_busy", "This model connection already has two running generations", True, command.run_id)

            metadata = self._connections.resolve_metadata(command.connection_id)
            self._validate_capabilities(command, metadata)
            provider_request = self._provider_request(command)
            compile_seedream_prompt(provider_request.prompt_document, provider_request.inputs, provider_request.regions)
            credential = self._read_credential(command.connection_id, command.run_id)
            connection = ConnectionContext(
                connection_id=metadata.connection_id,
                provider_id=metadata.provider_id,
                api_base=metadata.api_base,
                enabled=metadata.enabled,
                credential=credential,
            )
            provider = self._provider_factory(connection)
            provider_result = provider.generate(provider_request)
            provider_request_id = provider_result.request_id
            fetched = self._result_fetcher.fetch(provider_result.image.url)
            asset = self._storage.upload_asset(f"generated-{command.run_id}{fetched.extension}", fetched.content_type, fetched.content)
            asset_id = _required_response_id(asset, "asset")
            capture = self._storage.create_capture(_capture_payload(command, fetched, asset_id))
            capture_id = _required_response_id(capture, "capture")
            success_patch: dict[str, Any] = {
                "state": "succeeded",
                "outputAssetIds": [asset_id],
            }
            if provider_request_id:
                success_patch["providerRequestId"] = provider_request_id
            self._storage.update_run(command.run_id, success_patch)
            outcome = GenerationOutcome(
                run_id=command.run_id,
                state="succeeded",
                asset_id=asset_id,
                capture_id=capture_id,
                content_type=fetched.content_type,
                width=fetched.width,
                height=fetched.height,
            )
        except Exception as error:
            if isinstance(error, ProviderError) and error.request_id:
                provider_request_id = error.request_id
            failure = _normalize_generation_error(error, command.run_id)
        finally:
            if acquired:
                self._release(command.connection_id)

        if failure is not None:
            patch: dict[str, Any] = {
                "state": "failed",
                "error": {
                    "code": failure.code,
                    "message": failure.message,
                    "retryable": failure.retryable,
                },
            }
            if provider_request_id:
                patch["providerRequestId"] = provider_request_id
            try:
                self._storage.update_run(command.run_id, patch)
            except Exception:
                raise GenerationError("terminal_persistence_failed", "Image generation terminal state could not be saved", True, command.run_id) from None
            raise failure from None

        if outcome is None:
            raise GenerationError("generation_failed", "Image generation failed", False, command.run_id)
        return outcome

    def _start_run(self, run_id: str) -> None:
        start_failed = False
        try:
            self._storage.update_run(run_id, {"state": "running"})
        except Exception:
            start_failed = True
        if not start_failed:
            return

        failure = GenerationError("storage_write_failed", "Image generation run could not be started", True, run_id)
        if self._reconcile_start_failure(run_id, failure):
            raise failure from None
        raise GenerationError(
            "terminal_persistence_failed",
            "Image generation terminal state could not be saved",
            True,
            run_id,
        ) from None

    def _reconcile_start_failure(self, run_id: str, failure: GenerationError) -> bool:
        state = self._read_run_state(run_id)
        if state == "queued":
            retry_failed = False
            try:
                self._storage.update_run(run_id, {"state": "running"})
            except Exception:
                retry_failed = True
            state = self._read_run_state(run_id) if retry_failed else "running"

        if state == "running":
            patch = {
                "state": "failed",
                "error": {
                    "code": failure.code,
                    "message": failure.message,
                    "retryable": failure.retryable,
                },
            }
            terminal_write_failed = False
            try:
                self._storage.update_run(run_id, patch)
            except Exception:
                terminal_write_failed = True
            if not terminal_write_failed:
                return True
            state = self._read_run_state(run_id)
        return state == "failed"

    def _read_run_state(self, run_id: str) -> str | None:
        try:
            run = self._storage.get_run(run_id)
        except Exception:
            return None
        state = run.get("state")
        return state if isinstance(state, str) else None

    def _read_credential(self, connection_id: str, run_id: str) -> str:
        credential: str | None = None
        read_failed = False
        try:
            credential = self._connections.get_credential(connection_id)
        except Exception:
            read_failed = True
        if read_failed:
            raise GenerationError(
                "credential_store_unavailable",
                "Model credential storage is unavailable",
                True,
                run_id,
            ) from None
        if not credential:
            raise GenerationError(
                "credential_missing",
                "The selected model connection has no credential",
                False,
                run_id,
            )
        return credential

    def _validate_capabilities(self, command: GenerationCommand, connection: ConnectionMetadata) -> None:
        if not connection.enabled:
            raise GenerationError("connection_disabled", "The selected model connection is disabled", False, command.run_id)
        model = self._model_lookup(command.model_id)
        if model is None or model.get("modality") != "image":
            raise GenerationError("image_model_not_found", "The selected image model is unavailable", False, command.run_id)
        if model.get("providerId") != connection.provider_id:
            raise GenerationError("provider_model_mismatch", "The selected model does not belong to this connection", False, command.run_id)
        capabilities = model.get("capabilities") if isinstance(model.get("capabilities"), dict) else {}
        if command.mode not in capabilities.get("modes", []):
            raise GenerationError("unsupported_generation_mode", "The selected model does not support this generation mode", False, command.run_id)
        max_references = capabilities.get("maxReferenceImages", 0)
        if not isinstance(max_references, int) or len(command.inputs) > max_references:
            raise GenerationError("too_many_images", "The selected model accepts fewer reference images", False, command.run_id)
        if command.resolution not in capabilities.get("resolutions", []):
            raise GenerationError("unsupported_resolution", "The selected model does not support this resolution", False, command.run_id)
        if capabilities.get("outputCount") != 1 or capabilities.get("streaming") is not False:
            raise GenerationError("unsupported_model_capability", "The selected model capability contract is unsupported", False, command.run_id)
        if command.output_format not in {"png", "jpeg"}:
            raise GenerationError("unsupported_output_format", "Only PNG and JPEG output are supported", False, command.run_id)
        if command.mode in {"edit", "region-edit"} and not command.inputs:
            raise GenerationError("reference_image_required", "This generation mode requires a reference image", False, command.run_id)
        if command.mode == "region-edit" and not command.regions:
            raise GenerationError("region_required", "Region edit requires a selected region", False, command.run_id)

    def _provider_request(self, command: GenerationCommand) -> ImageGenerationRequest:
        inputs: list[ImageInput] = []
        for source in command.inputs:
            try:
                asset = self._storage.load_asset(source.asset_id)
                validate_image_content(asset.content, asset.content_type)
            except Exception:
                raise GenerationError("invalid_input_asset", "A reference image asset is missing or invalid", False, command.run_id) from None
            encoded = base64.b64encode(asset.content).decode("ascii")
            inputs.append(
                ImageInput(
                    reference_id=source.reference_id,
                    image=f"data:{asset.content_type};base64,{encoded}",
                    order=source.order,
                )
            )
        return ImageGenerationRequest(
            model_id=command.model_id,
            prompt_document=command.prompt_document,
            inputs=tuple(inputs),
            regions=command.regions,
            resolution=command.resolution,
            output_format=command.output_format,
            watermark=command.watermark,
        )

    def _try_acquire(self, connection_id: str) -> bool:
        with self._running_lock:
            current = self._running.get(connection_id, 0)
            if current >= self._max_running_per_connection:
                return False
            self._running[connection_id] = current + 1
            return True

    def _release(self, connection_id: str) -> None:
        with self._running_lock:
            remaining = self._running.get(connection_id, 1) - 1
            if remaining > 0:
                self._running[connection_id] = remaining
            else:
                self._running.pop(connection_id, None)


class StoredConnectionResolver:
    def __init__(self, store: ModelConnectionStore) -> None:
        self._store = store

    def resolve_metadata(self, connection_id: str) -> ConnectionMetadata:
        connection = self._store.get_connection_config(connection_id)
        return ConnectionMetadata(
            connection_id=connection_id,
            provider_id=str(connection.get("providerId", "")),
            api_base=str(connection.get("apiBase", "")),
            enabled=connection.get("enabled") is True,
        )

    def get_credential(self, connection_id: str) -> str | None:
        return self._store.credential_store.get(connection_id)


class PromptCardStorageClient:
    def __init__(self, base_url: str | None = None, client: httpx.Client | None = None) -> None:
        resolved_base_url = (base_url or os.getenv("PROMPTCARD_STORAGE_URL") or "http://127.0.0.1:8002").rstrip("/")
        self._client = client or httpx.Client(base_url=resolved_base_url, timeout=httpx.Timeout(10.0), follow_redirects=False)
        self._owns_client = client is None

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def create_run(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._json("POST", "/api/image-generation-runs", json=payload)

    def update_run(self, run_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        return self._json("PATCH", f"/api/image-generation-runs/{quote(run_id, safe='')}/state", json=patch)

    def get_run(self, run_id: str) -> dict[str, Any]:
        return self._json("GET", f"/api/image-generation-runs/{quote(run_id, safe='')}")

    def load_asset(self, asset_id: str) -> StorageAsset:
        try:
            response = self._client.get(f"/api/assets/{quote(asset_id, safe='')}")
            response.raise_for_status()
            return StorageAsset(content=response.content, content_type=response.headers.get("content-type", "").split(";", 1)[0])
        except (httpx.HTTPError, ValueError):
            raise StorageGatewayError() from None

    def upload_asset(self, filename: str, content_type: str, content: bytes) -> dict[str, Any]:
        return self._json(
            "POST",
            "/api/assets",
            content=content,
            headers={"content-type": content_type, "x-file-name": quote(filename, safe="")},
            timeout=30.0,
        )

    def create_capture(self, payload: dict[str, Any]) -> dict[str, Any]:
        return self._json("POST", "/api/recent-captures", json=payload)

    def _json(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        try:
            response = self._client.request(method, path, **kwargs)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError
            return payload
        except (httpx.HTTPError, ValueError):
            raise StorageGatewayError() from None


def build_default_image_generation_service() -> ImageGenerationService:
    return ImageGenerationService(
        storage=PromptCardStorageClient(),
        connections=StoredConnectionResolver(get_connection_store()),
        provider_factory=_provider_for,
        result_fetcher=ImageResultFetcher(),
    )


def _provider_for(connection: ConnectionContext) -> ImageGenerationProvider:
    if connection.provider_id != "volcengine-ark" or not connection.credential:
        raise GenerationError("unsupported_provider", "The selected image provider is unsupported", False, "")
    return VolcengineSeedreamProvider(api_key=connection.credential, base_url=connection.api_base)


def _queued_run(command: GenerationCommand) -> dict[str, Any]:
    return {
        "id": command.run_id,
        "projectId": command.project_id,
        "nodeId": command.node_id,
        "connectionId": command.connection_id,
        "providerId": _provider_id_for_model(command.model_id),
        "modelId": command.model_id,
        "state": "queued",
        "requestSnapshot": {
            "mode": command.mode,
            "promptDocument": {
                "version": command.prompt_document.version,
                "segments": [_prompt_segment_snapshot(segment) for segment in command.prompt_document.segments],
            },
            "inputAssets": [
                {"referenceId": item.reference_id, "assetId": item.asset_id, "order": item.order}
                for item in command.inputs
            ],
            "regions": [_region_snapshot(region) for region in command.regions],
            "resolution": command.resolution,
            "outputFormat": command.output_format,
            "watermark": command.watermark,
        },
        "outputAssetIds": [],
    }


def _provider_id_for_model(model_id: str) -> str:
    model = model_by_id(model_id)
    return str(model.get("providerId", "unknown")) if model else "unknown"


def _prompt_segment_snapshot(segment: PromptTextSegment | PromptReferenceSegment) -> dict[str, Any]:
    if isinstance(segment, PromptTextSegment):
        return {"type": "text", "text": segment.text}
    return {"type": "reference", "referenceId": segment.reference_id, "label": segment.label}


def _region_snapshot(region: ImageRegion) -> dict[str, Any]:
    if isinstance(region, PointRegion):
        return {"type": "point", "referenceId": region.reference_id, "x": region.x, "y": region.y}
    if isinstance(region, BBoxRegion):
        return {
            "type": "bbox",
            "referenceId": region.reference_id,
            "x1": region.x1,
            "y1": region.y1,
            "x2": region.x2,
            "y2": region.y2,
        }
    raise ValueError("Unsupported image region")


def _capture_payload(command: GenerationCommand, image: FetchedImage, asset_id: str) -> dict[str, Any]:
    now = int(time.time() * 1000)
    return {
        "assetId": asset_id,
        "kind": "pastedMedia",
        "status": "recent",
        "purpose": "generatedResult",
        "title": "Generated image",
        "prompt": "".join(segment.text if isinstance(segment, PromptTextSegment) else f"@{segment.label}" for segment in command.prompt_document.segments),
        "userNote": "",
        "sourcePlatform": "Seedream",
        "sourceUrl": "",
        "contentType": image.content_type,
        "originalFilename": f"generated-{command.run_id}{image.extension}",
        "size": len(image.content),
        "width": image.width,
        "height": image.height,
        "capturedAt": now,
        "linkedProjectId": command.project_id,
        "linkedCanvasNodeId": command.node_id,
        "origin": {"type": "image-generation", "runId": command.run_id, "modelId": command.model_id},
    }


def _required_response_id(payload: dict[str, Any], kind: str) -> str:
    value = payload.get("id")
    if not isinstance(value, str) or not value:
        raise StorageGatewayError(f"Missing {kind} id")
    return value


def _normalize_generation_error(error: Exception, run_id: str) -> GenerationError:
    if isinstance(error, GenerationError):
        return GenerationError(error.code, error.message, error.retryable, run_id)
    if isinstance(error, ProviderError):
        messages = {
            "rate_limited": "Image provider rate limit reached",
            "timeout": "Image provider request timed out",
            "authentication_failed": "Image provider authentication failed",
        }
        return GenerationError(error.code, messages.get(error.code, "Image provider request failed"), error.retryable, run_id)
    if isinstance(error, ImageFetchError):
        messages = {
            "unsafe_image_url": "Remote image URL is not allowed",
            "image_host_unresolved": "Remote image host could not be resolved",
            "image_redirect_rejected": "Remote image redirect was rejected",
            "image_download_timeout": "Remote image download timed out",
            "image_download_failed": "Remote image download failed",
            "invalid_image_mime": "Remote response is not a supported raster image",
            "image_too_large": "Remote image exceeds the download limit",
            "image_pixel_budget_exceeded": "Remote image exceeds the pixel limit",
            "invalid_image_data": "Remote image could not be decoded",
        }
        return GenerationError(error.code, messages.get(error.code, "Remote image processing failed"), error.retryable, run_id)
    if isinstance(error, PromptCompilationError):
        messages = {
            "too_many_images": "The selected model accepts fewer reference images",
            "duplicate_input_order": "Reference image order must be unique",
            "invalid_input_order": "Reference image order is invalid",
            "duplicate_reference_id": "Reference image identifiers must be unique",
            "invalid_image_input": "A reference image input is invalid",
            "invalid_prompt_segment": "The image prompt is invalid",
            "missing_reference": "Prompt references an unavailable image",
            "region_coordinate_out_of_range": "Region coordinates are invalid",
            "invalid_bbox": "The selected region is invalid",
            "invalid_region": "The selected region is invalid",
        }
        return GenerationError(error.code, messages.get(error.code, "The image prompt is invalid"), False, run_id)
    if isinstance(error, StorageGatewayError) or isinstance(error, OSError):
        return GenerationError("storage_write_failed", "Generated image could not be stored", True, run_id)
    code = getattr(error, "code", None)
    if code == "credential_store_unavailable":
        return GenerationError("credential_store_unavailable", "Model credential storage is unavailable", True, run_id)
    if code in {"connection_not_found", "invalid_connection_id"}:
        return GenerationError(str(code), "The selected model connection is unavailable", False, run_id)
    return GenerationError("generation_failed", "Image generation failed", False, run_id)
