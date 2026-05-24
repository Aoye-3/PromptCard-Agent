from __future__ import annotations

import json
import os
import tempfile
import time
from copy import deepcopy
from pathlib import Path
from typing import Any, Literal


Actor = Literal["user", "agent"]


class RevisionConflict(Exception):
    def __init__(self, current: dict[str, Any]) -> None:
        super().__init__("revision conflict")
        self.current = current


class MissingItem(Exception):
    pass


class JsonCollectionStore:
    def __init__(
        self,
        data_dir: Path,
        projects_seed: list[dict[str, Any]] | None = None,
        presets_seed: list[dict[str, Any]] | None = None,
    ) -> None:
        self.data_dir = data_dir
        self.projects_file = data_dir / "projects.json"
        self.project_trash_file = data_dir / "project-trash.json"
        self.presets_file = data_dir / "prompt-library-presets.json"
        self.preset_trash_file = data_dir / "prompt-library-trash.json"
        self.projects_seed = projects_seed or []
        self.presets_seed = presets_seed or []
        self.data_dir.mkdir(parents=True, exist_ok=True)

    def health(self) -> dict[str, Any]:
        return {"ok": True, "storage": str(self.data_dir)}

    def list_projects(self) -> list[dict[str, Any]]:
        return self._read_collection(self.projects_file, "projects", self.projects_seed, normalize_project)

    def get_project(self, item_id: str) -> dict[str, Any]:
        return self._get(self.list_projects(), item_id)

    def create_project(self, item: dict[str, Any]) -> dict[str, Any]:
        projects = self.list_projects()
        now = now_ms()
        created = normalize_project(
            {
                **item,
                "id": item.get("id") or str(now),
                "createdAt": item.get("createdAt") or now,
                "updatedAt": item.get("updatedAt") or now,
                "lastOpenedAt": item.get("lastOpenedAt") or now,
                "revision": 1,
            }
        )
        projects = [project for project in projects if project["id"] != created["id"]]
        self._write_collection(self.projects_file, "projects", [created, *projects])
        return created

    def update_project(self, item_id: str, updates: dict[str, Any], revision: int) -> dict[str, Any]:
        return self._update(self.projects_file, "projects", item_id, updates, revision, normalize_project)

    def trash_projects(self, ids: list[str], deleted_by: Actor = "user", delete_reason: str | None = None) -> list[dict[str, Any]]:
        return self._trash(self.projects_file, self.project_trash_file, "projects", ids, deleted_by, delete_reason, normalize_project)

    def list_project_trash(self) -> list[dict[str, Any]]:
        return self._read_trash(self.project_trash_file)

    def restore_projects(self, ids: list[str]) -> list[dict[str, Any]]:
        return self._restore(self.projects_file, self.project_trash_file, "projects", ids, normalize_project)

    def delete_project_trash(self, ids: list[str]) -> None:
        self._delete_trash(self.project_trash_file, ids)

    def list_presets(self) -> list[dict[str, Any]]:
        presets = self._read_collection(self.presets_file, "presets", self.presets_seed, normalize_preset)
        if not presets and self.presets_seed:
            presets = [normalize_preset(preset) for preset in self.presets_seed]
            self._write_collection(self.presets_file, "presets", presets)
        return presets

    def get_preset(self, item_id: str) -> dict[str, Any]:
        return self._get(self.list_presets(), item_id)

    def create_preset(self, item: dict[str, Any]) -> dict[str, Any]:
        presets = self.list_presets()
        now = now_ms()
        created = normalize_preset(
            {
                **item,
                "id": item.get("id") or f"preset-{now}",
                "usageCount": item.get("usageCount", 0),
                "createdAt": item.get("createdAt") or now,
                "updatedAt": item.get("updatedAt") or now,
                "revision": 1,
            }
        )
        presets = [preset for preset in presets if preset["id"] != created["id"]]
        self._write_collection(self.presets_file, "presets", [*presets, created])
        return created

    def update_preset(self, item_id: str, updates: dict[str, Any], revision: int) -> dict[str, Any]:
        return self._update(self.presets_file, "presets", item_id, updates, revision, normalize_preset)

    def reorder_presets(self, ordered_ids: list[str], revision_map: dict[str, int]) -> list[dict[str, Any]]:
        presets = self.list_presets()
        by_id = {preset["id"]: preset for preset in presets}
        for item_id in ordered_ids:
            if item_id in by_id and by_id[item_id]["revision"] != revision_map.get(item_id):
                raise RevisionConflict(by_id[item_id])

        ordered_set = set(ordered_ids)
        next_presets = [by_id[item_id] for item_id in ordered_ids if item_id in by_id]
        next_presets.extend(preset for preset in presets if preset["id"] not in ordered_set)
        now = now_ms()
        bumped = []
        for preset in next_presets:
            if preset["id"] in ordered_set:
                bumped.append({**preset, "revision": preset["revision"] + 1, "updatedAt": now})
            else:
                bumped.append(preset)
        self._write_collection(self.presets_file, "presets", bumped)
        return bumped

    def increment_preset_usage(self, item_id: str, revision: int) -> dict[str, Any]:
        current = self.get_preset(item_id)
        return self.update_preset(item_id, {"usageCount": current.get("usageCount", 0) + 1}, revision)

    def trash_presets(self, ids: list[str], deleted_by: Actor = "user", delete_reason: str | None = None) -> list[dict[str, Any]]:
        return self._trash(self.presets_file, self.preset_trash_file, "presets", ids, deleted_by, delete_reason, normalize_preset)

    def list_preset_trash(self) -> list[dict[str, Any]]:
        return self._read_trash(self.preset_trash_file)

    def restore_presets(self, ids: list[str]) -> list[dict[str, Any]]:
        return self._restore(self.presets_file, self.preset_trash_file, "presets", ids, normalize_preset)

    def delete_preset_trash(self, ids: list[str]) -> None:
        self._delete_trash(self.preset_trash_file, ids)

    def migrate_browser_payload(self, payload: dict[str, Any]) -> dict[str, int]:
        imported_projects = 0
        imported_presets = 0
        existing_projects = {project["id"]: project for project in self.list_projects()}
        existing_presets = {preset["id"]: preset for preset in self.list_presets()}

        for project in payload.get("projects") or []:
            normalized = normalize_project(project)
            if normalized["id"] not in existing_projects:
                existing_projects[normalized["id"]] = normalized
                imported_projects += 1

        workspace = payload.get("workspace")
        if workspace and workspace.get("pages"):
            workspace_id = str(workspace.get("savedAt") or now_ms())
            if workspace_id not in existing_projects:
                now = now_ms()
                existing_projects[workspace_id] = normalize_project(
                    {
                        "id": workspace_id,
                        "title": "Migrated browser workspace",
                        "type": "card",
                        "pages": workspace.get("pages") or [],
                        "currentPage": workspace.get("currentPage") or 0,
                        "createdAt": now,
                        "updatedAt": now,
                        "lastOpenedAt": now,
                        "meta": {"source": "browser-workspace"},
                    }
                )
                imported_projects += 1

        for preset in payload.get("presets") or []:
            normalized = normalize_preset(preset)
            if normalized["id"] not in existing_presets:
                existing_presets[normalized["id"]] = normalized
                imported_presets += 1

        self._write_collection(self.projects_file, "projects", list(existing_projects.values()))
        self._write_collection(self.presets_file, "presets", list(existing_presets.values()))
        return {"projects": imported_projects, "presets": imported_presets}

    def _get(self, items: list[dict[str, Any]], item_id: str) -> dict[str, Any]:
        for item in items:
            if item["id"] == item_id:
                return item
        raise MissingItem()

    def _update(
        self,
        path: Path,
        key: str,
        item_id: str,
        updates: dict[str, Any],
        revision: int,
        normalizer,
    ) -> dict[str, Any]:
        items = self._read_collection(path, key, [], normalizer)
        next_items = []
        updated_item = None
        for item in items:
            if item["id"] != item_id:
                next_items.append(item)
                continue
            if item["revision"] != revision:
                raise RevisionConflict(item)
            updated_item = normalizer(
                {
                    **item,
                    **updates,
                    "id": item["id"],
                    "createdAt": item.get("createdAt"),
                    "revision": item["revision"] + 1,
                    "updatedAt": updates.get("updatedAt") or now_ms(),
                }
            )
            next_items.append(updated_item)

        if updated_item is None:
            raise MissingItem()

        self._write_collection(path, key, next_items)
        return updated_item

    def _trash(
        self,
        source_path: Path,
        trash_path: Path,
        key: str,
        ids: list[str],
        deleted_by: Actor,
        delete_reason: str | None,
        normalizer,
    ) -> list[dict[str, Any]]:
        id_set = set(ids)
        items = self._read_collection(source_path, key, [], normalizer)
        kept = []
        moved = []
        for item in items:
            if item["id"] in id_set:
                moved.append(item)
            else:
                kept.append(item)

        if not moved:
            return []

        trash = self._read_trash(trash_path)
        deleted_at = now_ms()
        trash = [entry for entry in trash if entry.get("payload", {}).get("id") not in id_set]
        trash.extend(
            {
                "id": item["id"],
                "deletedAt": deleted_at,
                "deletedBy": deleted_by,
                "deleteReason": delete_reason,
                "payload": item,
            }
            for item in moved
        )
        self._write_collection(source_path, key, kept)
        self._write_json(trash_path, {"schemaVersion": 1, "updatedAt": iso_now(), "items": trash})
        return moved

    def _restore(self, source_path: Path, trash_path: Path, key: str, ids: list[str], normalizer) -> list[dict[str, Any]]:
        id_set = set(ids)
        trash = self._read_trash(trash_path)
        source = self._read_collection(source_path, key, [], normalizer)
        restored = [normalizer(entry["payload"]) for entry in trash if entry.get("id") in id_set]
        if not restored:
            return []
        source_by_id = {item["id"]: item for item in source}
        for item in restored:
            source_by_id[item["id"]] = item
        remaining_trash = [entry for entry in trash if entry.get("id") not in id_set]
        self._write_collection(source_path, key, list(source_by_id.values()))
        self._write_json(trash_path, {"schemaVersion": 1, "updatedAt": iso_now(), "items": remaining_trash})
        return restored

    def _delete_trash(self, trash_path: Path, ids: list[str]) -> None:
        id_set = set(ids)
        trash = [entry for entry in self._read_trash(trash_path) if entry.get("id") not in id_set]
        self._write_json(trash_path, {"schemaVersion": 1, "updatedAt": iso_now(), "items": trash})

    def _read_collection(self, path: Path, key: str, seed: list[dict[str, Any]], normalizer) -> list[dict[str, Any]]:
        if not path.exists():
            items = [normalizer(item) for item in seed]
            self._write_collection(path, key, items)
            return items
        payload = self._read_json(path)
        if isinstance(payload, list):
            return [normalizer(item) for item in payload]
        return [normalizer(item) for item in payload.get(key, [])]

    def _write_collection(self, path: Path, key: str, items: list[dict[str, Any]]) -> None:
        self._write_json(path, {"schemaVersion": 1, "updatedAt": iso_now(), key: items})

    def _read_trash(self, path: Path) -> list[dict[str, Any]]:
        if not path.exists():
            self._write_json(path, {"schemaVersion": 1, "updatedAt": iso_now(), "items": []})
            return []
        payload = self._read_json(path)
        return list(payload.get("items", []))

    def _read_json(self, path: Path) -> Any:
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}

    def _write_json(self, path: Path, payload: Any) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=str(path.parent))
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(payload, handle, ensure_ascii=False, indent=2)
                handle.write("\n")
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, path)
        except Exception:
            try:
                os.unlink(temp_name)
            except FileNotFoundError:
                pass
            raise


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
