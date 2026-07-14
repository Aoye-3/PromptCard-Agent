from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
import uuid
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from typing import Any, Iterator, Literal

from .assets import AssetStore, AssetValidationError
from .backup import BackupManager
from .image_runs import (
    decode_cursor,
    image_run_page,
    normalize_new_image_run,
    normalize_page_limit,
    transition_image_run,
)
from .migration import MigrationError, StorageInitializer

Actor = Literal["user", "agent"]
SERVICE_VERSION = "2.0.0"
SCHEMA_VERSION = 3
DATABASE_NAME = "promptcard.sqlite3"
JSON_SOURCES = (
    "projects.json",
    "project-trash.json",
    "prompt-library-presets.json",
    "prompt-library-trash.json",
)


class RevisionConflict(Exception):
    def __init__(self, current: dict[str, Any]) -> None:
        super().__init__("revision conflict")
        self.current = current


class MissingItem(Exception):
    pass


class DuplicateItem(Exception):
    pass


class SqliteStore:
    def __init__(
        self,
        data_dir: Path,
        projects_seed: list[dict[str, Any]] | None = None,
        presets_seed: list[dict[str, Any]] | None = None,
    ) -> None:
        self.data_dir = data_dir
        self.database_path = data_dir / DATABASE_NAME
        self.assets_dir = data_dir / "assets"
        self.backups_dir = data_dir.parent / "backups"
        self.projects_seed = projects_seed or []
        self.presets_seed = presets_seed or []
        self._initialize_lock = threading.Lock()
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._initialize()
        self._assets = AssetStore(
            self.data_dir,
            self._connect,
            self._transaction,
            lambda: self.list_projects()
            + [entry["payload"] for entry in self.list_project_trash()]
            + self.list_recent_captures()
            + self.list_presets()
            + [entry["payload"] for entry in self.list_preset_trash()]
            + self._successful_image_run_payloads(),
            now_ms,
        )
        self._backups = BackupManager(
            self.database_path,
            self.assets_dir,
            DATABASE_NAME,
            SERVICE_VERSION,
            SCHEMA_VERSION,
            self._connect,
            iso_now,
        )

    def health(self) -> dict[str, Any]:
        return {
            "ok": True,
            "serviceVersion": SERVICE_VERSION,
            "schemaVersion": SCHEMA_VERSION,
            "storage": str(self.data_dir),
            "database": str(self.database_path),
            "pid": os.getpid(),
            "capabilities": {
                "assets": True,
                "sqlite": True,
                "presetBatch": True,
                "browserImportIdempotency": True,
                "backup": True,
                "recentCaptures": True,
                "imageGenerationRuns": True,
            },
        }

    def list_projects(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT payload_json FROM projects WHERE status = 'active' ORDER BY last_opened_at DESC, updated_at DESC"
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_project(self, item_id: str) -> dict[str, Any]:
        return self._get_payload("projects", item_id, "active")

    def create_project(self, item: dict[str, Any]) -> dict[str, Any]:
        now = now_ms()
        created = normalize_project({
            **item,
            "id": item.get("id") or str(now),
            "createdAt": item.get("createdAt") or now,
            "updatedAt": item.get("updatedAt") or now,
            "lastOpenedAt": item.get("lastOpenedAt") or now,
            "revision": 1,
        })
        with self._transaction() as connection:
            try:
                self._insert_project(connection, created, "active")
            except sqlite3.IntegrityError as exc:
                raise DuplicateItem(created["id"]) from exc
        return created

    def update_project(self, item_id: str, updates: dict[str, Any], revision: int) -> dict[str, Any]:
        with self._transaction() as connection:
            current = self._get_row_payload(connection, "projects", item_id, "active")
            if current["revision"] != revision:
                raise RevisionConflict(current)
            updated = normalize_project({
                **current,
                **updates,
                "id": current["id"],
                "createdAt": current.get("createdAt"),
                "revision": current["revision"] + 1,
                "updatedAt": updates.get("updatedAt") or now_ms(),
            })
            connection.execute(
                "UPDATE projects SET revision=?, created_at=?, updated_at=?, last_opened_at=?, payload_json=? WHERE id=? AND status='active'",
                (updated["revision"], updated["createdAt"], updated["updatedAt"], updated["lastOpenedAt"], _json(updated), item_id),
            )
        return updated

    def trash_projects(self, ids: list[str], deleted_by: Actor = "user", delete_reason: str | None = None) -> list[dict[str, Any]]:
        return self._set_status("projects", ids, "active", "trash", deleted_by, delete_reason)

    def list_project_trash(self) -> list[dict[str, Any]]:
        return self._list_trash("projects")

    def restore_projects(self, ids: list[str]) -> list[dict[str, Any]]:
        return self._restore("projects", ids)

    def delete_project_trash(self, ids: list[str]) -> None:
        self._delete_trash("projects", ids)

    def list_recent_captures(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT payload_json FROM recent_captures ORDER BY captured_at DESC, created_at DESC"
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_recent_capture(self, item_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute("SELECT payload_json FROM recent_captures WHERE id=?", (item_id,)).fetchone()
        if not row:
            raise MissingItem()
        return json.loads(row[0])

    def create_recent_capture(self, item: dict[str, Any]) -> dict[str, Any]:
        created = normalize_recent_capture(item)
        with self._transaction() as connection:
            try:
                self._insert_recent_capture(connection, created)
            except sqlite3.IntegrityError as exc:
                raise DuplicateItem(created["id"]) from exc
        return created

    def update_recent_capture(self, item_id: str, updates: dict[str, Any], revision: int) -> dict[str, Any]:
        with self._transaction() as connection:
            row = connection.execute("SELECT payload_json FROM recent_captures WHERE id=?", (item_id,)).fetchone()
            if not row:
                raise MissingItem()
            current = json.loads(row[0])
            if current["revision"] != revision:
                raise RevisionConflict(current)
            updated = normalize_recent_capture({
                **current,
                **updates,
                "id": current["id"],
                "assetId": current["assetId"],
                "createdAt": current.get("createdAt"),
                "capturedAt": updates.get("capturedAt", current.get("capturedAt")),
                "revision": current["revision"] + 1,
                "updatedAt": updates.get("updatedAt") or now_ms(),
            })
            connection.execute(
                "UPDATE recent_captures SET asset_id=?, kind=?, status=?, captured_at=?, updated_at=?, revision=?, payload_json=? WHERE id=?",
                (
                    updated["assetId"],
                    updated["kind"],
                    updated["status"],
                    updated["capturedAt"],
                    updated["updatedAt"],
                    updated["revision"],
                    _json(updated),
                    item_id,
                ),
            )
        return updated

    def delete_recent_capture(self, item_id: str, revision: int) -> None:
        with self._transaction() as connection:
            row = connection.execute("SELECT payload_json FROM recent_captures WHERE id=?", (item_id,)).fetchone()
            if not row:
                raise MissingItem()
            current = json.loads(row[0])
            if current["revision"] != revision:
                raise RevisionConflict(current)
            connection.execute("DELETE FROM recent_captures WHERE id=?", (item_id,))

    def register_recent_captures_to_prompt_library(self, payload: dict[str, Any]) -> dict[str, Any]:
        mode = payload.get("mode")
        requested = payload.get("captures")
        if mode not in {"separate", "merged"}:
            raise ValueError("Registration mode must be separate or merged")
        if not isinstance(requested, list) or not requested:
            raise ValueError("At least one recent capture is required")

        with self._transaction() as connection:
            captures: list[dict[str, Any]] = []
            assets: list[dict[str, Any]] = []
            for request in requested:
                if not isinstance(request, dict) or not isinstance(request.get("id"), str):
                    raise ValueError("Each capture registration requires an id")
                row = connection.execute(
                    "SELECT payload_json FROM recent_captures WHERE id=?", (request["id"],)
                ).fetchone()
                if not row:
                    raise MissingItem(request["id"])
                capture = json.loads(row[0])
                if capture["revision"] != request.get("revision"):
                    raise RevisionConflict(capture)
                if capture.get("registeredPromptId"):
                    raise ValueError(f"Recent capture is already registered: {capture['id']}")
                asset_row = connection.execute(
                    "SELECT original_filename, content_type, size FROM assets WHERE asset_id=?",
                    (capture["assetId"],),
                ).fetchone()
                if not asset_row:
                    raise MissingItem(capture["assetId"])
                captures.append(capture)
                assets.append({
                    "id": capture["assetId"],
                    "filename": asset_row[0],
                    "contentType": asset_row[1],
                    "size": asset_row[2],
                })

            prompt_inputs = requested if mode == "separate" else [payload.get("prompt")]
            if not all(isinstance(value, dict) for value in prompt_inputs):
                raise ValueError("Prompt fields are required")

            now = now_ms()
            presets: list[dict[str, Any]] = []
            capture_groups = [[index] for index in range(len(captures))] if mode == "separate" else [list(range(len(captures)))]
            connection.execute(
                "UPDATE presets SET sort_order = sort_order + ? WHERE status='active'",
                (len(capture_groups),),
            )
            for preset_index, capture_indexes in enumerate(capture_groups):
                prompt_input = prompt_inputs[preset_index]
                assert isinstance(prompt_input, dict)
                label = str(prompt_input.get("label") or "").strip()
                content = str(prompt_input.get("content") or "").strip()
                if not label or not content:
                    raise ValueError("Prompt label and content are required")
                preset_type = str(prompt_input.get("type") or _default_prompt_type([captures[index] for index in capture_indexes]))
                preset_id = f"preset-capture-{uuid.uuid4().hex}"
                grouped_captures = [captures[index] for index in capture_indexes]
                grouped_assets = [assets[index] for index in capture_indexes]
                created = normalize_preset({
                    "id": preset_id,
                    "type": preset_type,
                    "category": preset_type,
                    "label": label,
                    "content": content,
                    "usageCount": 0,
                    "createdAt": now + preset_index,
                    "updatedAt": now + preset_index,
                    "revision": 1,
                    "meta": {
                        "media": [_capture_media_item(asset) for asset in grouped_assets],
                        "recentCaptureSources": [_capture_source_metadata(capture) for capture in grouped_captures],
                    },
                })
                try:
                    self._insert_preset(connection, created, "active", preset_index)
                except sqlite3.IntegrityError as exc:
                    raise DuplicateItem(created["id"]) from exc
                presets.append(created)

            registered: list[dict[str, Any]] = []
            for capture_index, capture in enumerate(captures):
                preset_index = capture_index if mode == "separate" else 0
                updated = normalize_recent_capture({
                    **capture,
                    "status": "registeredToPromptLibrary",
                    "registeredPromptId": presets[preset_index]["id"],
                    "registeredAt": now,
                    "revision": capture["revision"] + 1,
                    "updatedAt": now,
                })
                connection.execute(
                    "UPDATE recent_captures SET status=?, updated_at=?, revision=?, payload_json=? WHERE id=?",
                    (updated["status"], updated["updatedAt"], updated["revision"], _json(updated), updated["id"]),
                )
                registered.append(updated)

        return {"presets": presets, "captures": registered}

    def list_presets(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT payload_json FROM presets WHERE status='active' ORDER BY sort_order, created_at, id"
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_preset(self, item_id: str) -> dict[str, Any]:
        return self._get_payload("presets", item_id, "active")

    def create_preset(self, item: dict[str, Any]) -> dict[str, Any]:
        now = now_ms()
        created = normalize_preset({
            **item,
            "id": item.get("id") or f"preset-{now}",
            "usageCount": item.get("usageCount", 0),
            "createdAt": item.get("createdAt") or now,
            "updatedAt": item.get("updatedAt") or now,
            "revision": 1,
        })
        with self._transaction() as connection:
            sort_order = connection.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM presets WHERE status='active'").fetchone()[0]
            try:
                self._insert_preset(connection, created, "active", sort_order)
            except sqlite3.IntegrityError as exc:
                raise DuplicateItem(created["id"]) from exc
        return created

    def update_preset(self, item_id: str, updates: dict[str, Any], revision: int) -> dict[str, Any]:
        with self._transaction() as connection:
            current = self._get_row_payload(connection, "presets", item_id, "active")
            if current["revision"] != revision:
                raise RevisionConflict(current)
            updated = normalize_preset({
                **current,
                **updates,
                "id": current["id"],
                "createdAt": current.get("createdAt"),
                "revision": current["revision"] + 1,
                "updatedAt": updates.get("updatedAt") or now_ms(),
            })
            connection.execute(
                "UPDATE presets SET revision=?, type=?, category=?, usage_count=?, created_at=?, updated_at=?, payload_json=? WHERE id=? AND status='active'",
                (updated["revision"], updated["type"], updated["category"], updated["usageCount"], updated["createdAt"], updated["updatedAt"], _json(updated), item_id),
            )
        return updated

    def reorder_presets(self, ordered_ids: list[str], revision_map: dict[str, int]) -> list[dict[str, Any]]:
        with self._transaction() as connection:
            active = self._active_presets(connection)
            by_id = {item["id"]: item for item in active}
            for item_id in ordered_ids:
                if item_id in by_id and by_id[item_id]["revision"] != revision_map.get(item_id):
                    raise RevisionConflict(by_id[item_id])
            ordered_set = set(ordered_ids)
            next_items = [by_id[item_id] for item_id in ordered_ids if item_id in by_id]
            next_items.extend(item for item in active if item["id"] not in ordered_set)
            now = now_ms()
            for index, item in enumerate(next_items):
                if item["id"] in ordered_set:
                    item = {**item, "revision": item["revision"] + 1, "updatedAt": now}
                    connection.execute(
                        "UPDATE presets SET sort_order=?, revision=?, updated_at=?, payload_json=? WHERE id=?",
                        (index, item["revision"], now, _json(item), item["id"]),
                    )
                    next_items[index] = item
                else:
                    connection.execute("UPDATE presets SET sort_order=? WHERE id=?", (index, item["id"]))
        return next_items

    def replace_presets(self, presets: list[dict[str, Any]]) -> list[dict[str, Any]]:
        normalized = [normalize_preset(item) for item in presets]
        _ensure_unique_ids(normalized, "preset batch")
        with self._transaction() as connection:
            current = {item["id"]: item for item in self._active_presets(connection)}
            incoming_ids = {item["id"] for item in normalized}
            now = now_ms()
            for index, item in enumerate(normalized):
                existing = current.get(item["id"])
                if existing:
                    if item.get("revision", 1) != existing["revision"]:
                        raise RevisionConflict(existing)
                    next_item = normalize_preset({**existing, **item, "revision": existing["revision"] + 1, "updatedAt": now})
                    connection.execute(
                        "UPDATE presets SET revision=?, type=?, category=?, usage_count=?, sort_order=?, updated_at=?, payload_json=? WHERE id=?",
                        (next_item["revision"], next_item["type"], next_item["category"], next_item["usageCount"], index, next_item["updatedAt"], _json(next_item), item["id"]),
                    )
                    normalized[index] = next_item
                else:
                    next_item = normalize_preset({**item, "revision": 1})
                    self._insert_preset(connection, next_item, "active", index)
                    normalized[index] = next_item
            removed = [item_id for item_id in current if item_id not in incoming_ids]
            if removed:
                placeholders = ",".join("?" for _ in removed)
                connection.execute(
                    f"UPDATE presets SET status='trash', deleted_at=?, deleted_by='user', delete_reason='batch replace' WHERE id IN ({placeholders})",
                    (now, *removed),
                )
        return normalized

    def increment_preset_usage(self, item_id: str, revision: int) -> dict[str, Any]:
        current = self.get_preset(item_id)
        return self.update_preset(item_id, {"usageCount": current.get("usageCount", 0) + 1}, revision)

    def trash_presets(self, ids: list[str], deleted_by: Actor = "user", delete_reason: str | None = None) -> list[dict[str, Any]]:
        return self._set_status("presets", ids, "active", "trash", deleted_by, delete_reason)

    def list_preset_trash(self) -> list[dict[str, Any]]:
        return self._list_trash("presets")

    def restore_presets(self, ids: list[str]) -> list[dict[str, Any]]:
        return self._restore("presets", ids)

    def delete_preset_trash(self, ids: list[str]) -> None:
        self._delete_trash("presets", ids)

    def migrate_browser_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        migration_id = str(payload.get("migrationId") or "browser-cache-v1")
        with self._transaction() as connection:
            if connection.execute("SELECT 1 FROM browser_imports WHERE migration_id=?", (migration_id,)).fetchone():
                return {"projects": 0, "presets": 0, "alreadyApplied": True}
            imported_projects = 0
            imported_presets = 0
            for raw in payload.get("projects") or []:
                item = normalize_project(raw)
                if not connection.execute("SELECT 1 FROM projects WHERE id=?", (item["id"],)).fetchone():
                    self._insert_project(connection, item, "active")
                    imported_projects += 1
            workspace = payload.get("workspace")
            if workspace and workspace.get("pages"):
                workspace_id = str(workspace.get("savedAt") or now_ms())
                if not connection.execute("SELECT 1 FROM projects WHERE id=?", (workspace_id,)).fetchone():
                    now = now_ms()
                    item = normalize_project({
                        "id": workspace_id, "title": "Migrated browser workspace", "type": "card",
                        "pages": workspace.get("pages") or [], "currentPage": workspace.get("currentPage") or 0,
                        "createdAt": now, "updatedAt": now, "lastOpenedAt": now,
                        "meta": {"source": "browser-workspace"},
                    })
                    self._insert_project(connection, item, "active")
                    imported_projects += 1
            next_order = connection.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM presets").fetchone()[0]
            for raw in payload.get("presets") or []:
                item = normalize_preset(raw)
                if not connection.execute("SELECT 1 FROM presets WHERE id=?", (item["id"],)).fetchone():
                    self._insert_preset(connection, item, "active", next_order)
                    next_order += 1
                    imported_presets += 1
            connection.execute(
                "INSERT INTO browser_imports(migration_id, applied_at) VALUES (?, ?)",
                (migration_id, now_ms()),
            )
        return {"projects": imported_projects, "presets": imported_presets, "alreadyApplied": False}

    def create_image_generation_run(self, item: dict[str, Any]) -> dict[str, Any]:
        created = normalize_new_image_run(item, now_ms())
        with self._transaction() as connection:
            try:
                connection.execute(
                    "INSERT INTO image_generation_runs(id, project_id, node_id, connection_id, provider_id, model_id, state, created_at, started_at, finished_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                    (
                        created["id"], created["projectId"], created["nodeId"], created["connectionId"],
                        created["providerId"], created["modelId"], created["state"], created["createdAt"],
                        None, None, _json(created),
                    ),
                )
            except sqlite3.IntegrityError as exc:
                raise DuplicateItem(created["id"]) from exc
        return created

    def get_image_generation_run(self, run_id: str) -> dict[str, Any]:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM image_generation_runs WHERE id=?", (run_id,)
            ).fetchone()
        if not row:
            raise MissingItem()
        return json.loads(row[0])

    def update_image_generation_run_state(self, run_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        with self._transaction() as connection:
            row = connection.execute(
                "SELECT payload_json FROM image_generation_runs WHERE id=?", (run_id,)
            ).fetchone()
            if not row:
                raise MissingItem()
            updated = transition_image_run(json.loads(row[0]), patch, now_ms())
            if updated["state"] == "succeeded" and updated["outputAssetIds"]:
                placeholders = ",".join("?" for _ in updated["outputAssetIds"])
                registered = {
                    asset_row[0]
                    for asset_row in connection.execute(
                        f"SELECT asset_id FROM assets WHERE asset_id IN ({placeholders})",
                        updated["outputAssetIds"],
                    )
                }
                if any(asset_id not in registered for asset_id in updated["outputAssetIds"]):
                    raise MissingItem()
            connection.execute(
                "UPDATE image_generation_runs SET state=?, started_at=?, finished_at=?, payload_json=? WHERE id=?",
                (updated["state"], updated.get("startedAt"), updated.get("finishedAt"), _json(updated), run_id),
            )
        return updated

    def list_image_generation_runs(
        self,
        *,
        project_id: str | None = None,
        node_id: str | None = None,
        cursor: str | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        normalized_limit = normalize_page_limit(limit)
        cursor_value = decode_cursor(cursor)
        clauses: list[str] = []
        parameters: list[Any] = []
        if project_id is not None:
            clauses.append("project_id=?")
            parameters.append(project_id)
        if node_id is not None:
            clauses.append("node_id=?")
            parameters.append(node_id)
        if cursor_value is not None:
            clauses.append("(created_at < ? OR (created_at = ? AND id < ?))")
            parameters.extend((cursor_value[0], cursor_value[0], cursor_value[1]))
        where = f" WHERE {' AND '.join(clauses)}" if clauses else ""
        parameters.append(normalized_limit + 1)
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT payload_json FROM image_generation_runs{where} ORDER BY created_at DESC, id DESC LIMIT ?",
                parameters,
            ).fetchall()
        return image_run_page([json.loads(row[0]) for row in rows], normalized_limit)

    def _successful_image_run_payloads(self) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                "SELECT payload_json FROM image_generation_runs WHERE state='succeeded'"
            ).fetchall()
        return [
            {"outputAssetIds": json.loads(row[0]).get("outputAssetIds", [])}
            for row in rows
        ]

    def save_asset(self, filename: str, content_type: str, content: bytes, max_bytes: int = 20 * 1024 * 1024) -> dict[str, Any]:
        try:
            return self._assets.save(filename, content_type, content, max_bytes)
        except LookupError as exc:
            raise MissingItem() from exc

    def get_asset(self, asset_id: str) -> tuple[Path, str]:
        try:
            return self._assets.get(asset_id)
        except LookupError as exc:
            raise MissingItem() from exc

    def diagnose_assets(self) -> dict[str, list[str]]:
        return self._assets.diagnose()

    def backup(self, destination: Path) -> dict[str, Any]:
        return self._backups.create(destination)

    def _initialize(self) -> None:
        with self._initialize_lock:
            StorageInitializer(
                data_dir=self.data_dir,
                database_path=self.database_path,
                assets_dir=self.assets_dir,
                backups_dir=self.backups_dir,
                database_name=DATABASE_NAME,
                schema_version=SCHEMA_VERSION,
                json_sources=JSON_SOURCES,
                projects_seed=self.projects_seed,
                presets_seed=self.presets_seed,
                normalize_project=normalize_project,
                normalize_preset=normalize_preset,
                create_schema=self._create_schema,
                import_migration=self._import_migration,
                configure_database=self._configure_existing_database,
                validate_migration=self._validate_migration,
                now_ms=now_ms,
            ).initialize()

    def _import_migration(self, connection: sqlite3.Connection, migration: dict[str, Any]) -> None:
        for item in migration["projects"]:
            self._insert_project(connection, item, "active")
        for entry in migration["project_trash"]:
            self._insert_project(connection, entry["payload"], "trash", entry)
        for index, item in enumerate(migration["presets"]):
            self._insert_preset(connection, item, "active", index)
        for index, entry in enumerate(migration["preset_trash"]):
            self._insert_preset(connection, entry["payload"], "trash", index, entry)
        if self.assets_dir.exists():
            for path in sorted(self.assets_dir.iterdir()):
                content_type = _content_type_for_path(path)
                if path.is_file() and content_type:
                    connection.execute(
                        "INSERT INTO assets(asset_id, original_filename, relative_path, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                        (path.name, path.name, f"assets/{path.name}", content_type, path.stat().st_size, int(path.stat().st_mtime * 1000)),
                    )

    def _validate_migration(self, migration: dict[str, Any]) -> None:
        with self._connect() as connection:
            counts = {
                "projects": connection.execute("SELECT COUNT(*) FROM projects WHERE status='active'").fetchone()[0],
                "project_trash": connection.execute("SELECT COUNT(*) FROM projects WHERE status='trash'").fetchone()[0],
                "presets": connection.execute("SELECT COUNT(*) FROM presets WHERE status='active'").fetchone()[0],
                "preset_trash": connection.execute("SELECT COUNT(*) FROM presets WHERE status='trash'").fetchone()[0],
            }
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
        expected = {key: len(migration[key]) for key in counts}
        if counts != expected or integrity != "ok":
            raise MigrationError(f"Migration validation failed: expected {expected}, got {counts}, integrity={integrity}")

    def _configure_existing_database(self) -> None:
        with self._connect(configure=False) as connection:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA synchronous=FULL")
            connection.execute("PRAGMA foreign_keys=ON")
            connection.execute("PRAGMA busy_timeout=5000")
            row = connection.execute("SELECT MAX(version) FROM schema_migrations").fetchone()
            current_version = row[0] if row else None
            if current_version == 1:
                connection.execute("BEGIN IMMEDIATE")
                try:
                    self._create_recent_captures_schema(connection)
                    connection.execute(
                        "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
                        (2, "add-recent-captures", now_ms()),
                    )
                    connection.commit()
                    current_version = 2
                except Exception:
                    connection.rollback()
                    raise
            if current_version == 2:
                connection.execute("BEGIN IMMEDIATE")
                try:
                    self._create_image_generation_runs_schema(connection)
                    connection.execute(
                        "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
                        (3, "add-image-generation-runs", now_ms()),
                    )
                    connection.commit()
                    current_version = 3
                except Exception:
                    connection.rollback()
                    raise
            if current_version != SCHEMA_VERSION:
                raise MigrationError(f"Unsupported SQLite schema version: {current_version}")

    def _create_schema(self, connection: sqlite3.Connection) -> None:
        connection.executescript("""
            PRAGMA foreign_keys=ON;
            PRAGMA busy_timeout=5000;
            CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at INTEGER NOT NULL);
            CREATE TABLE projects(
                id TEXT PRIMARY KEY, revision INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','trash')),
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, last_opened_at INTEGER NOT NULL,
                deleted_at INTEGER, deleted_by TEXT, delete_reason TEXT, payload_json TEXT NOT NULL
            );
            CREATE INDEX projects_status_order ON projects(status, last_opened_at DESC, updated_at DESC);
            CREATE TABLE presets(
                id TEXT PRIMARY KEY, revision INTEGER NOT NULL, type TEXT NOT NULL, category TEXT NOT NULL,
                usage_count INTEGER NOT NULL, sort_order INTEGER NOT NULL, status TEXT NOT NULL CHECK(status IN ('active','trash')),
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER, deleted_by TEXT,
                delete_reason TEXT, payload_json TEXT NOT NULL
            );
            CREATE INDEX presets_status_order ON presets(status, sort_order, created_at);
            CREATE TABLE assets(
                asset_id TEXT PRIMARY KEY, original_filename TEXT NOT NULL, relative_path TEXT NOT NULL UNIQUE,
                content_type TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL
            );
            CREATE TABLE browser_imports(migration_id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);
        """)
        self._create_recent_captures_schema(connection)
        self._create_image_generation_runs_schema(connection)

    def _insert_project(self, connection: sqlite3.Connection, item: dict[str, Any], status: str, trash: dict[str, Any] | None = None) -> None:
        connection.execute(
            "INSERT INTO projects(id, revision, status, created_at, updated_at, last_opened_at, deleted_at, deleted_by, delete_reason, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (item["id"], item["revision"], status, item["createdAt"], item["updatedAt"], item["lastOpenedAt"],
             trash.get("deletedAt") if trash else None, trash.get("deletedBy") if trash else None,
             trash.get("deleteReason") if trash else None, _json(item)),
        )

    def _insert_preset(self, connection: sqlite3.Connection, item: dict[str, Any], status: str, sort_order: int, trash: dict[str, Any] | None = None) -> None:
        connection.execute(
            "INSERT INTO presets(id, revision, type, category, usage_count, sort_order, status, created_at, updated_at, deleted_at, deleted_by, delete_reason, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (item["id"], item["revision"], item["type"], item["category"], item["usageCount"], sort_order, status,
             item["createdAt"], item["updatedAt"], trash.get("deletedAt") if trash else None,
             trash.get("deletedBy") if trash else None, trash.get("deleteReason") if trash else None, _json(item)),
        )

    def _create_recent_captures_schema(self, connection: sqlite3.Connection) -> None:
        connection.executescript("""
            CREATE TABLE IF NOT EXISTS recent_captures(
                id TEXT PRIMARY KEY,
                asset_id TEXT NOT NULL,
                kind TEXT NOT NULL,
                status TEXT NOT NULL,
                captured_at INTEGER NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                revision INTEGER NOT NULL,
                payload_json TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS recent_captures_order ON recent_captures(captured_at DESC, created_at DESC);
        """)

    def _create_image_generation_runs_schema(self, connection: sqlite3.Connection) -> None:
        connection.execute("""
            CREATE TABLE IF NOT EXISTS image_generation_runs(
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                node_id TEXT NOT NULL,
                connection_id TEXT NOT NULL,
                provider_id TEXT NOT NULL,
                model_id TEXT NOT NULL,
                state TEXT NOT NULL CHECK(state IN ('queued','running','succeeded','failed')),
                created_at INTEGER NOT NULL,
                started_at INTEGER,
                finished_at INTEGER,
                payload_json TEXT NOT NULL
            )
        """)
        connection.execute(
            "CREATE INDEX IF NOT EXISTS image_generation_runs_project_order ON image_generation_runs(project_id, created_at DESC, id DESC)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS image_generation_runs_node_order ON image_generation_runs(node_id, created_at DESC, id DESC)"
        )

    def _insert_recent_capture(self, connection: sqlite3.Connection, item: dict[str, Any]) -> None:
        connection.execute(
            "INSERT INTO recent_captures(id, asset_id, kind, status, captured_at, created_at, updated_at, revision, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                item["id"],
                item["assetId"],
                item["kind"],
                item["status"],
                item["capturedAt"],
                item["createdAt"],
                item["updatedAt"],
                item["revision"],
                _json(item),
            ),
        )

    def _get_payload(self, table: str, item_id: str, status: str) -> dict[str, Any]:
        with self._connect() as connection:
            return self._get_row_payload(connection, table, item_id, status)

    def _get_row_payload(self, connection: sqlite3.Connection, table: str, item_id: str, status: str) -> dict[str, Any]:
        row = connection.execute(f"SELECT payload_json FROM {table} WHERE id=? AND status=?", (item_id, status)).fetchone()
        if not row:
            raise MissingItem()
        return json.loads(row[0])

    def _active_presets(self, connection: sqlite3.Connection) -> list[dict[str, Any]]:
        return [json.loads(row[0]) for row in connection.execute("SELECT payload_json FROM presets WHERE status='active' ORDER BY sort_order, created_at, id")]

    def _set_status(self, table: str, ids: list[str], source: str, target: str, deleted_by: Actor, delete_reason: str | None) -> list[dict[str, Any]]:
        if not ids:
            return []
        with self._transaction() as connection:
            placeholders = ",".join("?" for _ in ids)
            rows = connection.execute(f"SELECT payload_json FROM {table} WHERE status=? AND id IN ({placeholders})", (source, *ids)).fetchall()
            moved = [json.loads(row[0]) for row in rows]
            connection.execute(
                f"UPDATE {table} SET status=?, deleted_at=?, deleted_by=?, delete_reason=? WHERE status=? AND id IN ({placeholders})",
                (target, now_ms(), deleted_by, delete_reason, source, *ids),
            )
        return moved

    def _list_trash(self, table: str) -> list[dict[str, Any]]:
        with self._connect() as connection:
            rows = connection.execute(
                f"SELECT id, deleted_at, deleted_by, delete_reason, payload_json FROM {table} WHERE status='trash' ORDER BY deleted_at DESC"
            ).fetchall()
        return [{"id": row[0], "deletedAt": row[1], "deletedBy": row[2], "deleteReason": row[3], "payload": json.loads(row[4])} for row in rows]

    def _restore(self, table: str, ids: list[str]) -> list[dict[str, Any]]:
        if not ids:
            return []
        with self._transaction() as connection:
            placeholders = ",".join("?" for _ in ids)
            rows = connection.execute(f"SELECT payload_json FROM {table} WHERE status='trash' AND id IN ({placeholders})", tuple(ids)).fetchall()
            restored = [json.loads(row[0]) for row in rows]
            connection.execute(
                f"UPDATE {table} SET status='active', deleted_at=NULL, deleted_by=NULL, delete_reason=NULL WHERE status='trash' AND id IN ({placeholders})",
                tuple(ids),
            )
        return restored

    def _delete_trash(self, table: str, ids: list[str]) -> None:
        if not ids:
            return
        with self._transaction() as connection:
            placeholders = ",".join("?" for _ in ids)
            connection.execute(f"DELETE FROM {table} WHERE status='trash' AND id IN ({placeholders})", tuple(ids))

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        with self._connect() as connection:
            connection.execute("BEGIN IMMEDIATE")
            try:
                yield connection
                connection.commit()
            except Exception:
                connection.rollback()
                raise

    @contextmanager
    def _connect(self, configure: bool = True) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.database_path, timeout=5.0)
        try:
            if configure:
                connection.execute("PRAGMA foreign_keys=ON")
                connection.execute("PRAGMA busy_timeout=5000")
            yield connection
        finally:
            connection.close()


# Compatibility import retained while callers migrate terminology.
JsonCollectionStore = SqliteStore


def _content_type_for_path(path: Path) -> str | None:
    return {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}.get(path.suffix.lower())


def _ensure_unique_ids(items: list[dict[str, Any]], label: str) -> None:
    ids = [str(item.get("id")) for item in items]
    if len(ids) != len(set(ids)):
        raise MigrationError(f"Duplicate IDs found in {label}")


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def normalize_project(item: dict[str, Any]) -> dict[str, Any]:
    now = now_ms()
    project = deepcopy(item)
    project.setdefault("id", str(now))
    project.setdefault("title", "Untitled project")
    project.setdefault("type", "card")
    project.setdefault("pages", [])
    project.setdefault("currentPage", 0)
    project.setdefault("createdAt", now)
    project.setdefault("updatedAt", project.get("createdAt") or now)
    project.setdefault("lastOpenedAt", project.get("updatedAt") or now)
    project.setdefault("meta", {})
    project["revision"] = int(project.get("revision") or 1)
    return project


def normalize_preset(item: dict[str, Any]) -> dict[str, Any]:
    now = now_ms()
    preset = deepcopy(item)
    preset.setdefault("id", f"preset-{now}")
    preset.setdefault("type", "custom")
    preset.setdefault("category", preset.get("type") or "custom")
    preset.setdefault("label", "Untitled preset")
    preset.setdefault("content", "")
    preset.setdefault("usageCount", 0)
    preset.setdefault("meta", {})
    preset.setdefault("createdAt", now)
    preset.setdefault("updatedAt", preset.get("createdAt") or now)
    preset["revision"] = int(preset.get("revision") or 1)
    return preset


def normalize_recent_capture(item: dict[str, Any]) -> dict[str, Any]:
    now = now_ms()
    capture = deepcopy(item)
    capture.setdefault("id", f"capture-{now}")
    capture.setdefault("kind", "screenshot")
    capture.setdefault("status", "recent")
    capture.setdefault("purpose", "inspirationReference")
    capture.setdefault("role", None)
    capture.setdefault("title", "Screenshot capture")
    capture.setdefault("prompt", "")
    capture.setdefault("userNote", "")
    capture.setdefault("sourcePlatform", "Local capture")
    capture.setdefault("sourceUrl", "")
    capture.setdefault("contentType", "image/png")
    capture.setdefault("size", 0)
    capture.setdefault("width", 0)
    capture.setdefault("height", 0)
    capture.setdefault("capturedAt", now)
    capture.setdefault("origin", {"type": "floating-toolbar"})
    capture.setdefault("originalFilename", None)
    capture.setdefault("registeredPromptId", None)
    capture.setdefault("registeredAt", None)
    capture.setdefault("linkedProjectId", None)
    capture.setdefault("linkedCanvasNodeId", None)
    capture.setdefault("createdAt", capture.get("capturedAt") or now)
    capture.setdefault("updatedAt", capture.get("createdAt") or now)
    capture["revision"] = int(capture.get("revision") or 1)

    if not isinstance(capture.get("assetId"), str) or not capture["assetId"]:
        raise ValueError("Recent capture assetId is required")
    if capture["kind"] not in {"screenshot", "pastedMedia", "screenRecording"}:
        raise ValueError(f"Unsupported recent capture kind: {capture['kind']}")
    if capture["contentType"] not in {"image/png", "image/jpeg", "image/webp", "video/mp4"}:
        raise ValueError(f"Unsupported recent capture content type: {capture['contentType']}")
    capture["size"] = int(capture.get("size") or 0)
    capture["width"] = int(capture.get("width") or 0)
    capture["height"] = int(capture.get("height") or 0)
    capture["capturedAt"] = int(capture.get("capturedAt") or now)
    capture["createdAt"] = int(capture.get("createdAt") or capture["capturedAt"])
    capture["updatedAt"] = int(capture.get("updatedAt") or capture["createdAt"])
    return capture


def _default_prompt_type(captures: list[dict[str, Any]]) -> str:
    role_types = {
        "character": "subject", "prop": "subject", "scene": "scene", "composition": "camera",
        "lighting": "lighting", "color": "style", "style": "style", "mood": "style", "other": "custom",
    }
    types = {role_types.get(capture.get("role"), "custom") for capture in captures}
    return next(iter(types)) if len(types) == 1 else "custom"


def _capture_media_item(asset: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": f"media-{asset['id']}",
        "kind": "video" if str(asset["contentType"]).startswith("video/") else "image",
        "source": "asset",
        "assetId": asset["id"],
        "filename": asset["filename"],
        "contentType": asset["contentType"],
        "size": asset["size"],
        "title": asset["filename"],
    }


def _capture_source_metadata(capture: dict[str, Any]) -> dict[str, Any]:
    return {
        "captureId": capture["id"],
        "purpose": capture.get("purpose"),
        "role": capture.get("role"),
        "userNote": capture.get("userNote", ""),
        "sourcePlatform": capture.get("sourcePlatform", ""),
        "sourceUrl": capture.get("sourceUrl", ""),
        "capturedAt": capture.get("capturedAt"),
        "origin": capture.get("origin", {}),
    }


def now_ms() -> int:
    return int(time.time() * 1000)


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
