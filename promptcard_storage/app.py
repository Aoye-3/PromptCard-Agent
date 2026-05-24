from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .store import JsonCollectionStore, MissingItem, RevisionConflict


ROOT_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = Path(os.environ.get("PROMPTCARD_STORAGE_DATA_DIR", ROOT_DIR / "data"))
SEED_FILE = ROOT_DIR / "public" / "prompt-library-presets.json"


def load_seed_presets() -> list[dict[str, Any]]:
    if not SEED_FILE.exists():
        return []
    payload = json.loads(SEED_FILE.read_text(encoding="utf-8"))
    return list(payload.get("presets", []))


store = JsonCollectionStore(DATA_DIR, presets_seed=load_seed_presets())
app = FastAPI(title="PromptCard Storage", version="1.0.0")


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
    projects: list[dict[str, Any]] = Field(default_factory=list)
    workspace: dict[str, Any] | None = None
    presets: list[dict[str, Any]] = Field(default_factory=list)


@app.get("/health")
def health() -> dict[str, Any]:
    return store.health()


@app.get("/api/projects")
def list_projects() -> dict[str, Any]:
    return {"projects": store.list_projects()}


@app.get("/api/projects/trash")
def list_project_trash() -> dict[str, Any]:
    return {"items": store.list_project_trash()}


@app.get("/api/projects/{item_id}")
def get_project(item_id: str) -> dict[str, Any]:
    return _handle(lambda: store.get_project(item_id))


@app.post("/api/projects")
def create_project(item: dict[str, Any]) -> dict[str, Any]:
    return store.create_project(item)


@app.put("/api/projects/{item_id}")
def update_project(item_id: str, payload: UpdatePayload) -> dict[str, Any]:
    return _handle(lambda: store.update_project(item_id, payload.updates, payload.revision))


@app.post("/api/projects/trash")
def trash_projects(payload: TrashPayload) -> dict[str, Any]:
    return {"projects": store.trash_projects(payload.ids, payload.deletedBy, payload.deleteReason)}


@app.post("/api/projects/trash/restore")
def restore_projects(payload: IdsPayload) -> dict[str, Any]:
    return {"projects": store.restore_projects(payload.ids)}


@app.delete("/api/projects/trash")
def delete_project_trash(payload: IdsPayload) -> dict[str, Any]:
    store.delete_project_trash(payload.ids)
    return {"ok": True}


@app.get("/api/presets")
def list_presets() -> dict[str, Any]:
    return {"presets": store.list_presets()}


@app.get("/api/presets/trash")
def list_preset_trash() -> dict[str, Any]:
    return {"items": store.list_preset_trash()}


@app.get("/api/presets/{item_id}")
def get_preset(item_id: str) -> dict[str, Any]:
    return _handle(lambda: store.get_preset(item_id))


@app.post("/api/presets")
def create_preset(item: dict[str, Any]) -> dict[str, Any]:
    return store.create_preset(item)


@app.put("/api/presets/{item_id}")
def update_preset(item_id: str, payload: UpdatePayload) -> dict[str, Any]:
    return _handle(lambda: store.update_preset(item_id, payload.updates, payload.revision))


@app.post("/api/presets/reorder")
def reorder_presets(payload: ReorderPayload) -> dict[str, Any]:
    return _handle(lambda: {"presets": store.reorder_presets(payload.orderedIds, payload.revisions)})


@app.post("/api/presets/{item_id}/increment-usage")
def increment_preset_usage(item_id: str, payload: RevisionPayload) -> dict[str, Any]:
    return _handle(lambda: store.increment_preset_usage(item_id, payload.revision))


@app.post("/api/presets/trash")
def trash_presets(payload: TrashPayload) -> dict[str, Any]:
    return {"presets": store.trash_presets(payload.ids, payload.deletedBy, payload.deleteReason)}


@app.post("/api/presets/trash/restore")
def restore_presets(payload: IdsPayload) -> dict[str, Any]:
    return {"presets": store.restore_presets(payload.ids)}


@app.delete("/api/presets/trash")
def delete_preset_trash(payload: IdsPayload) -> dict[str, Any]:
    store.delete_preset_trash(payload.ids)
    return {"ok": True}


@app.post("/api/migrations/browser-cache")
def migrate_browser_cache(payload: MigrationPayload) -> dict[str, Any]:
    return store.migrate_browser_payload(payload.model_dump())


def _handle(callback):
    try:
        return callback()
    except MissingItem as exc:
        raise HTTPException(status_code=404, detail="not found") from exc
    except RevisionConflict as exc:
        raise HTTPException(status_code=409, detail={"message": "revision conflict", "current": exc.current}) from exc
