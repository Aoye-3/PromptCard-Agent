from __future__ import annotations

from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient
from PIL import Image

from app.gateway.deps import get_image_generation_service
from app.gateway.image_generation.contracts import ImageGenerationResult, ProviderError, ProviderImage
from app.gateway.image_generation.result_fetcher import FetchedImage
from app.gateway.image_generation.service import ImageGenerationService, PromptCardStorageClient
from app.gateway.routers.image_generation import router

REMOTE_URL = "https://ark-content-generation-v2-cn-beijing.tos-cn-beijing.volces.com/result.png?token=remote-secret"
REPO_ROOT = Path(__file__).resolve().parents[3]


def _png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (4, 3), "white").save(output, format="PNG")
    return output.getvalue()


def _input_png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (16, 16), "white").save(output, format="PNG")
    return output.getvalue()


class _Connections:
    def resolve_metadata(self, connection_id: str) -> Any:
        return SimpleNamespace(
            connection_id=connection_id,
            provider_id="volcengine-ark",
            api_base="https://ark.cn-beijing.volces.com/api/v3",
            enabled=True,
            last_test_ok=True,
        )

    def get_credential(self, _connection_id: str) -> str:
        return "credential-from-keyring"


class _Provider:
    def __init__(self, error: ProviderError | None = None) -> None:
        self.error = error
        self.connection: Any | None = None

    def generate(self, _request: Any) -> ImageGenerationResult:
        if self.error is not None:
            raise self.error
        return ImageGenerationResult(
            image=ProviderImage(url=REMOTE_URL, size="2048x2048"),
            request_id="provider-request-1",
        )


class _Fetcher:
    def fetch(self, url: str) -> FetchedImage:
        assert url == REMOTE_URL
        return FetchedImage(
            content=_png_bytes(),
            content_type="image/png",
            width=4,
            height=3,
            extension=".png",
        )


def _project_payload() -> dict[str, Any]:
    return {
        "id": "project-1",
        "title": "Integration project",
        "type": "free-canvas",
        "pages": [],
        "currentPage": 0,
        "freeCanvas": {
            "nodes": [{"id": "node-1", "kind": "image-generator"}],
            "edges": [],
            "selectedNodeId": "node-1",
        },
        "createdAt": 1,
        "updatedAt": 1,
        "lastOpenedAt": 1,
        "revision": 1,
        "meta": {},
    }


def _generation_payload(input_asset_id: str) -> dict[str, Any]:
    return {
        "projectId": "project-1",
        "nodeId": "node-1",
        "connectionId": "connection-1",
        "modelId": "doubao-seedream-5-0-pro-260628",
        "mode": "edit",
        "promptDocument": {
            "version": 1,
            "segments": [
                {"type": "text", "text": "Refine "},
                {"type": "reference", "referenceId": "subject", "label": "subject"},
            ],
        },
        "inputs": [{"referenceId": "subject", "assetId": input_asset_id, "order": 0}],
        "regions": [{"type": "point", "referenceId": "subject", "x": 200, "y": 300}],
        "resolution": "2K",
        "aspectRatio": "smart",
        "outputFormat": "png",
        "watermark": False,
    }


def _runtime_client(storage_client: TestClient, provider: _Provider) -> tuple[TestClient, ImageGenerationService]:
    def provider_factory(connection: Any) -> _Provider:
        provider.connection = connection
        return provider

    service = ImageGenerationService(
        storage=PromptCardStorageClient(client=storage_client),
        connections=_Connections(),
        provider_factory=provider_factory,
        result_fetcher=_Fetcher(),
    )
    application = FastAPI()
    application.include_router(router)
    application.dependency_overrides[get_image_generation_service] = lambda: service
    return TestClient(application), service


def _storage_factory(tmp_path, monkeypatch):
    monkeypatch.syspath_prepend(str(REPO_ROOT))
    from promptcard_storage.app import create_app
    from promptcard_storage.store import SqliteStore

    data_dir = tmp_path / "storage"
    return data_dir, lambda: TestClient(create_app(SqliteStore(data_dir)))


def test_runtime_generation_survives_storage_restart_and_project_deletion(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROMPTCARD_IMAGE_GENERATION_NODE_V1", "true")
    data_dir, make_storage_client = _storage_factory(tmp_path, monkeypatch)

    with make_storage_client() as storage_client:
        assert storage_client.post("/api/projects", json=_project_payload()).status_code == 200
        input_response = storage_client.post(
            "/api/assets",
            content=_input_png_bytes(),
            headers={"content-type": "image/png", "x-file-name": "input.png"},
        )
        assert input_response.status_code == 200
        provider = _Provider()
        runtime_client, service = _runtime_client(storage_client, provider)
        with runtime_client:
            response = runtime_client.post(
                "/api/promptcard/runtime/image-generations",
                json=_generation_payload(input_response.json()["id"]),
            )
        service.close()

        assert response.status_code == 200
        result = response.json()
        assert result["state"] == "succeeded"
        assert provider.connection.credential == "credential-from-keyring"
        assert storage_client.get(f"/api/assets/{result['assetId']}").content == _png_bytes()
        assert REMOTE_URL not in repr(result)
        assert "credential-from-keyring" not in repr(result)

    assert data_dir.joinpath("promptcard.sqlite3").exists()
    with make_storage_client() as restarted_storage:
        run_id = result["runId"]
        persisted_run = restarted_storage.get(
            f"/api/image-generation-runs/{run_id}",
            params={"projectId": "project-1"},
        ).json()
        assert persisted_run["state"] == "succeeded"
        assert persisted_run["outputAssetIds"] == [result["assetId"]]
        assert restarted_storage.get(f"/api/assets/{result['assetId']}").content == _png_bytes()
        captures = restarted_storage.get("/api/recent-captures").json()["captures"]
        assert any(capture["id"] == result["captureId"] and capture["purpose"] == "generatedResult" for capture in captures)
        assert REMOTE_URL not in repr(persisted_run)
        assert "credential-from-keyring" not in repr(persisted_run)

        assert restarted_storage.post("/api/projects/trash", json={"ids": ["project-1"]}).status_code == 200
        assert restarted_storage.request("DELETE", "/api/projects/trash", json={"ids": ["project-1"]}).status_code == 200
        assert restarted_storage.get("/api/projects/project-1").status_code == 404
        retained = restarted_storage.get(
            "/api/image-generation-runs",
            params={"projectId": "project-1", "nodeId": "node-1"},
        ).json()["runs"]
        assert [run["id"] for run in retained] == [run_id]
        assert restarted_storage.get(f"/api/assets/{result['assetId']}").content == _png_bytes()
        assert restarted_storage.get(f"/api/recent-captures/{result['captureId']}").status_code == 200


def test_failed_generation_terminal_state_survives_storage_restart(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("PROMPTCARD_IMAGE_GENERATION_NODE_V1", "true")
    _data_dir, make_storage_client = _storage_factory(tmp_path, monkeypatch)

    with make_storage_client() as storage_client:
        input_response = storage_client.post(
            "/api/assets",
            content=_input_png_bytes(),
            headers={"content-type": "image/png", "x-file-name": "input.png"},
        )
        provider = _Provider(ProviderError("rate_limited", "Authorization: Bearer provider-secret", True))
        runtime_client, service = _runtime_client(storage_client, provider)
        with runtime_client:
            response = runtime_client.post(
                "/api/promptcard/runtime/image-generations",
                json=_generation_payload(input_response.json()["id"]),
            )
        service.close()

        assert response.status_code == 429
        error = response.json()["detail"]
        assert error["code"] == "rate_limited"
        assert "provider-secret" not in repr(error)

    with make_storage_client() as restarted_storage:
        persisted_run = restarted_storage.get(
            f"/api/image-generation-runs/{error['runId']}",
            params={"projectId": "project-1"},
        ).json()
        assert persisted_run["state"] == "failed"
        assert persisted_run["error"]["code"] == "rate_limited"
        assert "provider-secret" not in repr(persisted_run)
