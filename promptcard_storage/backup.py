from __future__ import annotations

import json
import shutil
import sqlite3
from pathlib import Path
from typing import Any, Callable, ContextManager


class BackupManager:
    def __init__(
        self,
        database_path: Path,
        assets_dir: Path,
        database_name: str,
        service_version: str,
        schema_version: int,
        connect: Callable[[], ContextManager[Any]],
        iso_now: Callable[[], str],
    ) -> None:
        self.database_path = database_path
        self.assets_dir = assets_dir
        self.database_name = database_name
        self.service_version = service_version
        self.schema_version = schema_version
        self._connect = connect
        self._iso_now = iso_now

    def create(self, destination: Path) -> dict[str, Any]:
        destination.mkdir(parents=True, exist_ok=False)
        database_copy = destination / self.database_name
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
            "createdAt": self._iso_now(),
            "serviceVersion": self.service_version,
            "schemaVersion": self.schema_version,
            "database": self.database_name,
            "assets": len(list((destination / "assets").iterdir())) if (destination / "assets").exists() else 0,
        }
        (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
        return manifest
