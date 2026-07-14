from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Callable
from urllib.parse import unquote

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .store import AssetValidationError, DuplicateItem, MissingItem, RevisionConflict, SqliteStore


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("PROMPTCARD_STORAGE_DATA_DIR", ROOT_DIR / "data"))
SEED_FILE = ROOT_DIR / "public" / "prompt-library-presets.json"
MAX_ASSET_UPLOAD_BYTES = 200 * 1024 * 1024


def load_seed_presets() -> list[dict[str, Any]]:
    if not SEED_FILE.exists():
        return []
    payload = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    return list(payload.get("presets", []))


class RevisionPayload(BaseModel):
    revision: int


class UpdatePayload(RevisionPayload):
    updates: dict[str, Any] = Field(default_factory=dict)


class ReorderPayload(BaseModel):
    orderedIds: list[str]
    revisions: dict[str, int] = Field(default_factory=dict)


class TrashPayload(BaseModel):
    ids: list[str]
    deletedBy: str = "user"
    deleteReason: str | None = None


class IdsPayload(BaseModel):
    ids: list[str]


class MigrationPayload(BaseModel):
    migrationId: str = "browser-cache-v1"
    projects: list[dict[str, Any]] = Field(default_factory=list)
    workspace: dict[str, Any] | None = None
    presets: list[dict[str, Any]] = Field(default_factory=list)


class PresetBatchPayload(BaseModel):
    presets: list[dict[str, Any]] = Field(default_factory=list)


class RecentCaptureRegistrationPayload(BaseModel):
    mode: str
    captures: list[dict[str, Any]] = Field(default_factory=list)
    prompt: dict[str, Any] | None = None


def create_app(storage: SqliteStore) -> FastAPI:
    application = FastAPI(title="PromptCard Storage", version="1.0.0")

    @application.get("/health")
    def health() -> dict[str, Any]:
        return storage.health()

    @application.post("/api/assets")
    async def create_asset(request: Request) -> dict[str, Any]:
        try:
            chunks = bytearray()
            async for chunk in request.stream():
                chunks.extend(chunk)
                if len(chunks) > MAX_ASSET_UPLOAD_BYTES:
                    raise AssetValidationError("Asset must be between 1 byte and 200 MB")
            return storage.save_asset(
                unquote(request.headers.get("x-file-name", "image")),
                request.headers.get("content-type", ""),
                bytes(chunks),
            )
        except AssetValidationError as exc:
            raise _http_error(400, "invalid_asset", str(exc)) from exc

    @application.get("/api/assets/diagnostics")
    def diagnose_assets() -> dict[str, Any]:
        return storage.diagnose_assets()

    @application.get("/api/assets/{asset_id}")
    def get_asset(asset_id: str):
        try:
            path, content_type = storage.get_asset(asset_id)
            return FileResponse(path, media_type=content_type)
        except MissingItem as exc:
            raise _http_error(404, "not_found", "Asset not found") from exc

    @application.post("/api/image-generation-runs")
    def create_image_generation_run(item: dict[str, Any]) -> dict[str, Any]:
        return _handle(lambda: storage.create_image_generation_run(item))

    @application.get("/api/image-generation-runs")
    def list_image_generation_runs(
        projectId: str | None = None,
        nodeId: str | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        return _handle(lambda: storage.list_image_generation_runs(
            project_id=projectId, node_id=nodeId, cursor=cursor, limit=limit
        ))

    @application.patch("/api/image-generation-runs/{run_id}/state")
    def update_image_generation_run_state(run_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        return _handle(lambda: storage.update_image_generation_run_state(run_id, patch))

    @application.get("/api/image-generation-runs/{run_id}")
    def get_image_generation_run(run_id: str) -> dict[str, Any]:
        return _handle(lambda: storage.get_image_generation_run(run_id))

    @application.get("/api/recent-captures")
    def list_recent_captures() -> dict[str, Any]:
        return {"captures": storage.list_recent_captures()}

    @application.get("/api/recent-captures/{item_id}")
    def get_recent_capture(item_id: str) -> dict[str, Any]:
        return _handle(lambda: storage.get_recent_capture(item_id))

    @application.post("/api/recent-captures")
    def create_recent_capture(item: dict[str, Any]) -> dict[str, Any]:
        return _handle(lambda: storage.create_recent_capture(item))

    @application.post("/api/recent-captures/register-to-prompt-library")
    def register_recent_captures(payload: RecentCaptureRegistrationPayload) -> dict[str, Any]:
        return _handle(lambda: storage.register_recent_captures_to_prompt_library(payload.model_dump()))

    @application.put("/api/recent-captures/{item_id}")
    def update_recent_capture(item_id: str, payload: UpdatePayload) -> dict[str, Any]:
        return _handle(lambda: storage.update_recent_capture(item_id, payload.updates, payload.revision))

    @application.delete("/api/recent-captures/{item_id}")
    def delete_recent_capture(item_id: str, payload: RevisionPayload) -> dict[str, Any]:
        def delete() -> dict[str, bool]:
            storage.delete_recent_capture(item_id, payload.revision)
            return {"ok": True}

        return _handle(delete)

    @application.get("/api/projects")
    def list_projects() -> dict[str, Any]:
        return {"projects": storage.list_projects()}

    @application.get("/api/projects/trash")
    def list_project_trash() -> dict[str, Any]:
        return {"items": storage.list_project_trash()}

    @application.get("/api/projects/{item_id}")
    def get_project(item_id: str) -> dict[str, Any]:
        return _handle(lambda: storage.get_project(item_id))

    @application.post("/api/projects")
    def create_project(item: dict[str, Any]) -> dict[str, Any]:
        return _handle(lambda: storage.create_project(item))

    @application.put("/api/projects/{item_id}")
    def update_project(item_id: str, payload: UpdatePayload) -> dict[str, Any]:
        return _handle(lambda: storage.update_project(item_id, payload.updates, payload.revision))

    @application.post("/api/projects/trash")
    def trash_projects(payload: TrashPayload) -> dict[str, Any]:
        return {"projects": storage.trash_projects(payload.ids, payload.deletedBy, payload.deleteReason)}

    @application.post("/api/projects/trash/restore")
    def restore_projects(payload: IdsPayload) -> dict[str, Any]:
        return {"projects": storage.restore_projects(payload.ids)}

    @application.delete("/api/projects/trash")
    def delete_project_trash(payload: IdsPayload) -> dict[str, Any]:
        storage.delete_project_trash(payload.ids)
        return {"ok": True}

    @application.get("/api/presets")
    def list_presets() -> dict[str, Any]:
        return {"presets": storage.list_presets()}

    @application.get("/api/presets/trash")
    def list_preset_trash() -> dict[str, Any]:
        return {"items": storage.list_preset_trash()}

    @application.get("/api/presets/{item_id}")
    def get_preset(item_id: str) -> dict[str, Any]:
        return _handle(lambda: storage.get_preset(item_id))

    @application.post("/api/presets")
    def create_preset(item: dict[str, Any]) -> dict[str, Any]:
        return _handle(lambda: storage.create_preset(item))

    @application.put("/api/presets/batch")
    def replace_presets(payload: PresetBatchPayload) -> dict[str, Any]:
        return _handle(lambda: {"presets": storage.replace_presets(payload.presets)})

    @application.put("/api/presets/{item_id}")
    def update_preset(item_id: str, payload: UpdatePayload) -> dict[str, Any]:
        return _handle(lambda: storage.update_preset(item_id, payload.updates, payload.revision))

    @application.post("/api/presets/reorder")
    def reorder_presets(payload: ReorderPayload) -> dict[str, Any]:
        return _handle(lambda: {"presets": storage.reorder_presets(payload.orderedIds, payload.revisions)})

    @application.post("/api/presets/{item_id}/increment-usage")
    def increment_preset_usage(item_id: str, payload: RevisionPayload) -> dict[str, Any]:
        return _handle(lambda: storage.increment_preset_usage(item_id, payload.revision))

    @application.post("/api/presets/trash")
    def trash_presets(payload: TrashPayload) -> dict[str, Any]:
        return {"presets": storage.trash_presets(payload.ids, payload.deletedBy, payload.deleteReason)}

    @application.post("/api/presets/trash/restore")
    def restore_presets(payload: IdsPayload) -> dict[str, Any]:
        return {"presets": storage.restore_presets(payload.ids)}

    @application.delete("/api/presets/trash")
    def delete_preset_trash(payload: IdsPayload) -> dict[str, Any]:
        storage.delete_preset_trash(payload.ids)
        return {"ok": True}

    @application.post("/api/migrations/browser-cache")
    def migrate_browser_cache(payload: MigrationPayload) -> dict[str, Any]:
        return storage.migrate_browser_payload(payload.model_dump())

    return application


def _handle(callback: Callable[[], Any]) -> Any:
    try:
        return callback()
    except MissingItem as exc:
        raise _http_error(404, "not_found", "Storage item not found") from exc
    except DuplicateItem as exc:
        raise _http_error(409, "duplicate_item", "Storage item already exists", {"id": str(exc)}) from exc
    except RevisionConflict as exc:
        raise _http_error(409, "revision_conflict", "Storage revision conflict", current=exc.current) from exc
    except ValueError as exc:
        raise _http_error(400, "invalid_payload", str(exc)) from exc


def _http_error(status: int, code: str, message: str, detail: Any = None, current: Any = None) -> HTTPException:
    payload: dict[str, Any] = {"code": code, "message": message}
    if detail is not None:
        payload["detail"] = detail
    if current is not None:
        payload["current"] = current
    return HTTPException(status_code=status, detail=payload)


store = SqliteStore(DATA_DIR, presets_seed=load_seed_presets())
app = create_app(store)
