from __future__ import annotations

import json
import os
import shutil
import sqlite3
import tempfile
import threading
import time
import uuid
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from typing import Any, Iterator, Literal


Actor = Literal["user", "agent"]
SERVICE_VERSION = "2.0.0"
SCHEMA_VERSION = 1
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


class AssetValidationError(Exception):
    pass


class MigrationError(Exception):
    pass


ASSET_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


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

    def save_asset(self, filename: str, content_type: str, content: bytes, max_bytes: int = 20 * 1024 * 1024) -> dict[str, Any]:
        extension = ASSET_EXTENSIONS.get(content_type.lower())
        if extension is None:
            raise AssetValidationError("Only PNG, JPEG, and WebP images are supported")
        if not content or len(content) > max_bytes:
            raise AssetValidationError("Image must be between 1 byte and 20 MB")
        if not is_valid_image_signature(content_type.lower(), content):
            raise AssetValidationError("Image bytes do not match the declared type")
        self.assets_dir.mkdir(parents=True, exist_ok=True)
        asset_id = f"{uuid.uuid4().hex}{extension}"
        final_path = self.assets_dir / asset_id
        fd, temp_name = tempfile.mkstemp(prefix=".asset-", suffix=".tmp", dir=str(self.assets_dir))
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(content)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, final_path)
            with self._transaction() as connection:
                connection.execute(
                    "INSERT INTO assets(asset_id, original_filename, relative_path, content_type, size, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                    (asset_id, Path(filename).name or asset_id, f"assets/{asset_id}", content_type.lower(), len(content), now_ms()),
                )
        except Exception:
            Path(temp_name).unlink(missing_ok=True)
            final_path.unlink(missing_ok=True)
            raise
        return {"id": asset_id, "filename": Path(filename).name or asset_id, "contentType": content_type.lower(), "size": len(content)}

    def get_asset(self, asset_id: str) -> tuple[Path, str]:
        candidate = Path(asset_id)
        if candidate.name != asset_id:
            raise MissingItem()
        with self._connect() as connection:
            row = connection.execute("SELECT relative_path, content_type FROM assets WHERE asset_id=?", (asset_id,)).fetchone()
        if not row:
            raise MissingItem()
        path = self.data_dir / row[0]
        if not path.is_file():
            raise MissingItem()
        return path, row[1]

    def diagnose_assets(self) -> dict[str, list[str]]:
        with self._connect() as connection:
            registered = {row[0] for row in connection.execute("SELECT asset_id FROM assets")}
        on_disk = {path.name for path in self.assets_dir.iterdir() if path.is_file() and not path.name.startswith(".")} if self.assets_dir.exists() else set()
        referenced = _collect_asset_ids(self.list_projects()) | _collect_asset_ids([entry["payload"] for entry in self.list_project_trash()])
        return {
            "unregisteredFiles": sorted(on_disk - registered),
            "missingFiles": sorted(registered - on_disk),
            "unreferencedAssets": sorted(registered - referenced),
            "missingReferences": sorted(referenced - registered),
        }

    def backup(self, destination: Path) -> dict[str, Any]:
        destination.mkdir(parents=True, exist_ok=False)
        database_copy = destination / DATABASE_NAME
        target = sqlite3.connect(database_copy)
        try:
            with self._connect() as source:
                source.backup(target)
            target.commit()
        finally:
            target.close()
        if self.assets_dir.exists():
            shutil.copytree(self.assets_dir, destination / "assets")
        manifest = {
            "createdAt": iso_now(),
            "serviceVersion": SERVICE_VERSION,
            "schemaVersion": SCHEMA_VERSION,
            "database": DATABASE_NAME,
            "assets": len(list((destination / "assets").iterdir())) if (destination / "assets").exists() else 0,
        }
        (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        return manifest

    def _initialize(self) -> None:
        with self._initialize_lock:
            if self.database_path.exists():
                self._configure_existing_database()
                return
            migration = self._load_json_sources()
            backup_dir = self._backup_json_sources(migration["existing_files"])
            temp_path = self.data_dir / f".{DATABASE_NAME}.{uuid.uuid4().hex}.migrating"
            try:
                connection = sqlite3.connect(temp_path)
                try:
                    self._create_schema(connection)
                    connection.execute("BEGIN IMMEDIATE")
                    self._import_migration(connection, migration)
                    connection.execute(
                        "INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)",
                        (SCHEMA_VERSION, "json-v1-to-sqlite", now_ms()),
                    )
                    connection.commit()
                finally:
                    connection.close()
                os.replace(temp_path, self.database_path)
                self._configure_existing_database()
                self._validate_migration(migration)
            except Exception as exc:
                temp_path.unlink(missing_ok=True)
                self.database_path.unlink(missing_ok=True)
                if isinstance(exc, MigrationError):
                    raise
                raise MigrationError(f"SQLite migration failed: {exc}") from exc
            if backup_dir:
                (backup_dir / "migration-complete.json").write_text(
                    json.dumps({"database": str(self.database_path), "completedAt": iso_now()}, indent=2),
                    encoding="utf-8",
                )

    def _load_json_sources(self) -> dict[str, Any]:
        existing_files = [self.data_dir / name for name in JSON_SOURCES if (self.data_dir / name).exists()]
        payloads: dict[str, Any] = {}
        for path in existing_files:
            try:
                payloads[path.name] = json.loads(path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError) as exc:
                raise MigrationError(f"Cannot parse legacy storage file: {path}") from exc
        projects = _collection(payloads.get("projects.json"), "projects", normalize_project)
        project_trash = _trash_items(payloads.get("project-trash.json"), normalize_project)
        presets = _collection(payloads.get("prompt-library-presets.json"), "presets", normalize_preset)
        preset_trash = _trash_items(payloads.get("prompt-library-trash.json"), normalize_preset)
        if not presets and not (self.data_dir / "prompt-library-presets.json").exists():
            presets = [normalize_preset(item) for item in self.presets_seed]
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
            if not row or row[0] != SCHEMA_VERSION:
                raise MigrationError(f"Unsupported SQLite schema version: {row[0] if row else None}")

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


def _collection(payload: Any, key: str, normalizer) -> list[dict[str, Any]]:
    if payload is None:
        return []
    items = payload if isinstance(payload, list) else payload.get(key)
    if not isinstance(items, list):
        raise MigrationError(f"Legacy {key} payload must be a list")
    if not all(isinstance(item, dict) for item in items):
        raise MigrationError(f"Legacy {key} contains a non-object item")
    return [normalizer(item) for item in items]


def _trash_items(payload: Any, normalizer) -> list[dict[str, Any]]:
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
            continue
        if _business_payload(active_item) != _business_payload(entry["payload"]):
            raise MigrationError(f"Conflicting active and trash payloads found in legacy {label}: {active_item['id']}")
    return reconciled


def _business_payload(item: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in item.items() if key not in {"revision", "createdAt", "updatedAt", "lastOpenedAt"}}


def _content_type_for_path(path: Path) -> str | None:
    return {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp"}.get(path.suffix.lower())


def _collect_asset_ids(value: Any) -> set[str]:
    found: set[str] = set()
    if isinstance(value, dict):
        asset_id = value.get("assetId")
        if isinstance(asset_id, str) and asset_id:
            found.add(asset_id)
        for child in value.values():
            found.update(_collect_asset_ids(child))
    elif isinstance(value, list):
        for child in value:
            found.update(_collect_asset_ids(child))
    return found


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def is_valid_image_signature(content_type: str, content: bytes) -> bool:
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if content_type == "image/webp":
        return len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    return False


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


def now_ms() -> int:
    return int(time.time() * 1000)


def iso_now() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
