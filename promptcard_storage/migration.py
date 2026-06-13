from __future__ import annotations

import json
import os
import shutil
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Callable


class MigrationError(Exception):
    pass


class StorageInitializer:
    def __init__(
        self,
        *,
        data_dir: Path,
        database_path: Path,
        assets_dir: Path,
        backups_dir: Path,
        database_name: str,
        schema_version: int,
        json_sources: tuple[str, ...],
        projects_seed: list[dict[str, Any]],
        presets_seed: list[dict[str, Any]],
        normalize_project: Callable[[dict[str, Any]], dict[str, Any]],
        normalize_preset: Callable[[dict[str, Any]], dict[str, Any]],
        create_schema: Callable[[sqlite3.Connection], None],
        import_migration: Callable[[sqlite3.Connection, dict[str, Any]], None],
        configure_database: Callable[[], None],
        validate_migration: Callable[[dict[str, Any]], None],
        now_ms: Callable[[], int],
    ) -> None:
        self.data_dir = data_dir
        self.database_path = database_path
        self.assets_dir = assets_dir
        self.backups_dir = backups_dir
        self.database_name = database_name
        self.schema_version = schema_version
        self.json_sources = json_sources
        self.projects_seed = projects_seed
        self.presets_seed = presets_seed
        self.normalize_project = normalize_project
        self.normalize_preset = normalize_preset
        self.create_schema = create_schema
        self.import_migration = import_migration
        self.configure_database = configure_database
        self.validate_migration = validate_migration
        self.now_ms = now_ms

    def initialize(self) -> None:
        if self.database_path.exists():
            self.configure_database()
            return
        migration = self._load_json_sources()
        backup_dir = self._backup_json_sources(migration["existing_files"])
        temp_path = self.data_dir / f".{self.database_name}.{uuid.uuid4().hex}.migrating"
        try:
            connection = sqlite3.connect(temp_path)
            try:
                self.create_schema(connection)
                connection.execute("BEGIN IMMEDIATE")
                self.import_migration(connection, migration)
                connection.execute(
                    "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
                    (self.schema_version, "json-v1-to-sqlite", self.now_ms()),
                )
                connection.commit()
            finally:
                connection.close()
            os.replace(temp_path, self.database_path)
            self.configure_database()
            self.validate_migration(migration)
        except Exception as exc:
            temp_path.unlink(missing_ok=True)
            self.database_path.unlink(missing_ok=True)
            if isinstance(exc, MigrationError):
                raise
            raise MigrationError(f"SQLite migration failed: {exc}") from exc
        if backup_dir:
            (backup_dir / "migration-complete.json").write_text(
                json.dumps({"database": str(self.database_path), "completedAt": _iso_now()}, indent=2),
                encoding="utf-8",
            )

    def _load_json_sources(self) -> dict[str, Any]:
        existing_files = [self.data_dir / name for name in self.json_sources if (self.data_dir / name).exists()]
        payloads: dict[str, Any] = {}
        for path in existing_files:
            try:
                payloads[path.name] = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise MigrationError(f"Cannot parse legacy storage file: {path}") from exc
        projects = _collection(payloads.get("projects.json"), "projects", self.normalize_project)
        project_trash = _trash_items(payloads.get("project-trash.json"), self.normalize_project)
        presets = _collection(payloads.get("prompt-library-presets.json"), "presets", self.normalize_preset)
        preset_trash = _trash_items(payloads.get("prompt-library-trash.json"), self.normalize_preset)
        if not presets and not (self.data_dir / "prompt-library-presets.json").exists():
            presets = [self.normalize_preset(item) for item in self.presets_seed]
        project_trash = _reconcile_active_trash(projects, project_trash, "projects")
        preset_trash = _reconcile_active_trash(presets, preset_trash, "presets")
        _ensure_unique_ids(projects + [entry["payload"] for entry in project_trash], "projects")
        _ensure_unique_ids(presets + [entry["payload"] for entry in preset_trash], "presets")
        return {
            "projects": projects,
            "project_trash": project_trash,
            "presets": presets,
            "preset_trash": preset_trash,
            "existing_files": existing_files,
        }

    def _backup_json_sources(self, files: list[Path]) -> Path | None:
        if not files and not self.assets_dir.exists():
            return None
        self.backups_dir.mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
        destination = self.backups_dir / f"storage-json-v1-{stamp}"
        suffix = 1
        while destination.exists():
            destination = self.backups_dir / f"storage-json-v1-{stamp}-{suffix}"
            suffix += 1
        destination.mkdir()
        for path in files:
            shutil.copy2(path, destination / path.name)
        asset_manifest = []
        if self.assets_dir.exists():
            asset_manifest = [{"name": path.name, "size": path.stat().st_size} for path in sorted(self.assets_dir.iterdir()) if path.is_file()]
        (destination / "assets-manifest.json").write_text(json.dumps(asset_manifest, indent=2), encoding="utf-8")
        return destination


def _collection(payload: Any, key: str, normalizer: Callable[[dict[str, Any]], dict[str, Any]]) -> list[dict[str, Any]]:
    if payload is None:
        return []
    items = payload if isinstance(payload, list) else payload.get(key)
    if not isinstance(items, list) or not all(isinstance(item, dict) for item in items):
        raise MigrationError(f"Legacy {key} payload must be a list of objects")
    return [normalizer(item) for item in items]


def _trash_items(payload: Any, normalizer: Callable[[dict[str, Any]], dict[str, Any]]) -> list[dict[str, Any]]:
    if payload is None:
        return []
    items = payload.get("items") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        raise MigrationError("Legacy trash payload must contain an items list")
    normalized = []
    for entry in items:
        if not isinstance(entry, dict) or not isinstance(entry.get("payload"), dict):
            raise MigrationError("Legacy trash entry is invalid")
        item = normalizer(entry["payload"])
        normalized.append({**entry, "id": item["id"], "payload": item})
    return normalized


def _ensure_unique_ids(items: list[dict[str, Any]], label: str) -> None:
    ids = [str(item.get("id")) for item in items]
    if len(ids) != len(set(ids)):
        raise MigrationError(f"Duplicate IDs found in legacy {label}")


def _reconcile_active_trash(active: list[dict[str, Any]], trash: list[dict[str, Any]], label: str) -> list[dict[str, Any]]:
    active_by_id = {item["id"]: item for item in active}
    reconciled = []
    for entry in trash:
        active_item = active_by_id.get(entry["payload"]["id"])
        if not active_item:
            reconciled.append(entry)
        elif _business_payload(active_item) != _business_payload(entry["payload"]):
            raise MigrationError(f"Conflicting active and trash payloads found in legacy {label}: {active_item['id']}")
    return reconciled


def _business_payload(item: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in item.items() if key not in {"revision", "createdAt", "updatedAt", "lastOpenedAt"}}


def _iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
