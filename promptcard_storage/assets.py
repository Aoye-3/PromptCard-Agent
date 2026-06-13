from __future__ import annotations

import os
import tempfile
import uuid
from pathlib import Path
from typing import Any, Callable, ContextManager


ASSET_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


class AssetValidationError(Exception):
    pass


class AssetStore:
    def __init__(
        self,
        data_dir: Path,
        connect: Callable[[], ContextManager[Any]],
        transaction: Callable[[], ContextManager[Any]],
        referenced_payloads: Callable[[], list[Any]],
        now_ms: Callable[[], int],
    ) -> None:
        self.data_dir = data_dir
        self.assets_dir = data_dir / "assets"
        self._connect = connect
        self._transaction = transaction
        self._referenced_payloads = referenced_payloads
        self._now_ms = now_ms

    def save(self, filename: str, content_type: str, content: bytes, max_bytes: int = 20 * 1024 * 1024) -> dict[str, Any]:
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
                    (asset_id, Path(filename).name or asset_id, f"assets/{asset_id}", content_type.lower(), len(content), self._now_ms()),
                )
        except Exception:
            Path(temp_name).unlink(missing_ok=True)
            final_path.unlink(missing_ok=True)
            raise
        return {"id": asset_id, "filename": Path(filename).name or asset_id, "contentType": content_type.lower(), "size": len(content)}

    def get(self, asset_id: str) -> tuple[Path, str]:
        candidate = Path(asset_id)
        if candidate.name != asset_id:
            raise LookupError(asset_id)
        with self._connect() as connection:
            row = connection.execute("SELECT relative_path, content_type FROM assets WHERE asset_id=?", (asset_id,)).fetchone()
        if not row:
            raise LookupError(asset_id)
        path = self.data_dir / row[0]
        if not path.is_file():
            raise LookupError(asset_id)
        return path, row[1]

    def diagnose(self) -> dict[str, list[str]]:
        with self._connect() as connection:
            registered = {row[0] for row in connection.execute("SELECT asset_id FROM assets")}
        on_disk = {path.name for path in self.assets_dir.iterdir() if path.is_file() and not path.name.startswith(".")} if self.assets_dir.exists() else set()
        referenced = _collect_asset_ids(self._referenced_payloads())
        return {
            "unregisteredFiles": sorted(on_disk - registered),
            "missingFiles": sorted(registered - on_disk),
            "unreferencedAssets": sorted(registered - referenced),
            "missingReferences": sorted(referenced - registered),
        }


def is_valid_image_signature(content_type: str, content: bytes) -> bool:
    if content_type == "image/png":
        return content.startswith(b"\x89PNG\r\n\x1a\n")
    if content_type == "image/jpeg":
        return content.startswith(b"\xff\xd8\xff")
    if content_type == "image/webp":
        return len(content) >= 12 and content.startswith(b"RIFF") and content[8:12] == b"WEBP"
    return False


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
