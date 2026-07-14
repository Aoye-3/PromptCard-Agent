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

    def test_creates_lists_and_updates_recent_captures(self) -> None:
        asset_response = self.client.post(
            "/api/assets",
            content=b"\x89PNG\r\n\x1a\nimage",
            headers={"content-type": "image/png", "x-file-name": "shot.png"},
        )
        asset_id = asset_response.json()["id"]

        create_response = self.client.post("/api/recent-captures", json={
            "id": "capture-one",
            "assetId": asset_id,
            "kind": "screenshot",
            "contentType": "image/png",
            "width": 320,
            "height": 180,
            "capturedAt": 123,
        })

        self.assertEqual(create_response.status_code, 200)
        capture = create_response.json()
        self.assertEqual(capture["assetId"], asset_id)
        self.assertEqual(capture["revision"], 1)

        list_response = self.client.get("/api/recent-captures")
        self.assertEqual(list_response.json()["captures"][0]["id"], "capture-one")

        update_response = self.client.put(
            "/api/recent-captures/capture-one",
            json={"revision": capture["revision"], "updates": {"status": "placedOnCanvas"}},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["status"], "placedOnCanvas")

        delete_response = self.client.request(
            "DELETE",
            "/api/recent-captures/capture-one",
            json={"revision": update_response.json()["revision"]},
        )
        self.assertEqual(delete_response.status_code, 200)
        self.assertEqual(delete_response.json(), {"ok": True})
        self.assertEqual(self.client.get("/api/recent-captures").json()["captures"], [])
        self.assertEqual(self.client.get(f"/api/assets/{asset_id}").status_code, 200)

    def test_registers_recent_captures_to_prompt_library_atomically(self) -> None:
        asset = self.client.post(
            "/api/assets",
            content=b"\x89PNG\r\n\x1a\nimage",
            headers={"content-type": "image/png", "x-file-name": "shot.png"},
        ).json()
        capture = self.client.post("/api/recent-captures", json={
            "id": "capture-register", "assetId": asset["id"], "kind": "screenshot",
            "contentType": "image/png", "title": "Shot", "prompt": "A wide shot", "role": "composition",
        }).json()

        response = self.client.post("/api/recent-captures/register-to-prompt-library", json={
            "mode": "separate",
            "captures": [{
                "id": capture["id"], "revision": capture["revision"],
                "label": "Shot", "content": "A wide shot", "type": "camera",
            }],
        })

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload["presets"][0]["meta"]["media"][0]["assetId"], asset["id"])
        self.assertEqual(payload["captures"][0]["registeredPromptId"], payload["presets"][0]["id"])


if __name__ == "__main__":
    unittest.main()
