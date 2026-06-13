import tempfile
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient
    from promptcard_storage.app import create_app
except ModuleNotFoundError:
    TestClient = None
    create_app = None

from promptcard_storage.store import SqliteStore


def preset(item_id: str, label: str) -> dict:
    return {
        "id": item_id,
        "type": "subject",
        "category": "scene",
        "label": label,
        "content": label,
        "usageCount": 0,
        "revision": 1,
        "createdAt": 1,
        "updatedAt": 1,
        "meta": {},
    }


@unittest.skipUnless(TestClient and create_app, "FastAPI contract dependencies are not installed")
class StorageAppContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = SqliteStore(Path(self.temp_dir.name))
        self.client = TestClient(create_app(self.store))

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_uploads_and_reads_an_asset(self) -> None:
        content = b"\x89PNG\r\n\x1a\nimage"
        response = self.client.post(
            "/api/assets",
            content=content,
            headers={"content-type": "image/png", "x-file-name": "board.png"},
        )

        self.assertEqual(response.status_code, 200)
        asset = response.json()
        downloaded = self.client.get(f"/api/assets/{asset['id']}")
        self.assertEqual(downloaded.status_code, 200)
        self.assertEqual(downloaded.content, content)

    def test_returns_structured_error_envelope(self) -> None:
        response = self.client.post(
            "/api/assets",
            content=b"not-a-png",
            headers={"content-type": "image/png", "x-file-name": "fake.png"},
        )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"]["code"], "invalid_asset")

    def test_replaces_presets_through_batch_endpoint(self) -> None:
        response = self.client.put("/api/presets/batch", json={"presets": [preset("p1", "One")]})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["presets"][0]["id"], "p1")

    def test_browser_migration_is_idempotent(self) -> None:
        payload = {"migrationId": "contract-v1", "projects": [], "presets": []}

        first = self.client.post("/api/migrations/browser-cache", json=payload)
        second = self.client.post("/api/migrations/browser-cache", json=payload)

        self.assertFalse(first.json()["alreadyApplied"])
        self.assertTrue(second.json()["alreadyApplied"])


if __name__ == "__main__":
    unittest.main()
