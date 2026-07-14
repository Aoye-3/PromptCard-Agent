import sqlite3
import tempfile
import unittest
from pathlib import Path

try:
    from fastapi.testclient import TestClient
    from promptcard_storage.app import create_app
except ModuleNotFoundError:
    TestClient = None
    create_app = None

from promptcard_storage.store import JsonCollectionStore, MissingItem


def project(item_id: str, node_ids: list[str] | None = None) -> dict:
    return {
        "id": item_id,
        "title": item_id,
        "type": "free-canvas",
        "pages": [],
        "currentPage": 0,
        "freeCanvas": {
            "nodes": [{"id": node_id, "kind": "image-generator"} for node_id in (node_ids or [])],
            "edges": [],
            "selectedNodeId": None,
        },
        "createdAt": 1,
        "updatedAt": 1,
        "lastOpenedAt": 1,
        "revision": 1,
        "meta": {},
    }


def preset(item_id: str) -> dict:
    return {
        "id": item_id,
        "type": "custom",
        "category": "custom",
        "label": item_id,
        "content": item_id,
        "usageCount": 0,
        "createdAt": 1,
        "updatedAt": 1,
        "revision": 1,
        "meta": {},
    }


def run_payload(
    run_id: str,
    *,
    project_id: str = "project-one",
    node_id: str = "node-one",
    created_at: int = 100,
) -> dict:
    return {
        "id": run_id,
        "projectId": project_id,
        "nodeId": node_id,
        "connectionId": "connection-one",
        "providerId": "volcengine-ark",
        "modelId": "doubao-seedream-5-0-pro-260628",
        "state": "queued",
        "requestSnapshot": {
            "mode": "generate",
            "promptDocument": {"version": 1, "segments": [{"type": "text", "text": run_id}]},
            "inputs": [],
            "regions": [],
            "settings": {"resolution": "1K", "aspectRatio": "1:1", "outputFormat": "png"},
        },
        "outputAssetIds": [],
        "createdAt": created_at,
    }


class ImageRunSchemaMigrationTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name, "data")
        self.data_dir.mkdir()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_migrates_schema_v2_in_place_without_changing_existing_collections(self) -> None:
        legacy = JsonCollectionStore(self.data_dir)
        legacy.create_project(project("project-existing"))
        legacy.create_preset(preset("preset-existing"))
        asset = legacy.save_asset("capture.png", "image/png", b"\x89PNG\r\n\x1a\ncapture")
        legacy.create_recent_capture({"id": "capture-existing", "assetId": asset["id"]})

        database_path = self.data_dir / "promptcard.sqlite3"
        connection = sqlite3.connect(database_path)
        try:
            connection.execute("DROP TABLE IF EXISTS image_generation_runs")
            connection.execute("DELETE FROM schema_migrations WHERE version >= 3")
            connection.execute(
                "INSERT OR REPLACE INTO schema_migrations(version, name, applied_at) VALUES (2, 'legacy-v2', 1)"
            )
            connection.commit()
        finally:
            connection.close()

        migrated = JsonCollectionStore(self.data_dir)

        self.assertEqual([item["id"] for item in migrated.list_projects()], ["project-existing"])
        self.assertEqual([item["id"] for item in migrated.list_presets()], ["preset-existing"])
        self.assertEqual([item["id"] for item in migrated.list_recent_captures()], ["capture-existing"])
        connection = sqlite3.connect(database_path)
        try:
            versions = [row[0] for row in connection.execute("SELECT version FROM schema_migrations ORDER BY version")]
            table = connection.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='image_generation_runs'"
            ).fetchone()
            indexes = {
                row[1]
                for row in connection.execute("PRAGMA index_list('image_generation_runs')")
            }
        finally:
            connection.close()

        self.assertEqual(versions, [2, 3])
        self.assertEqual(table, ("image_generation_runs",))
        self.assertIn("image_generation_runs_project_order", indexes)
        self.assertIn("image_generation_runs_node_order", indexes)


class ImageRunStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name, "data")
        self.store = JsonCollectionStore(self.data_dir)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_project_and_node_removal_never_delete_runs(self) -> None:
        created_project = self.store.create_project(project("project-one", ["node-one"]))
        created_run = self.store.create_image_generation_run(run_payload("run-retained"))

        updated_project = self.store.update_project(
            created_project["id"],
            {"freeCanvas": {"nodes": [], "edges": [], "selectedNodeId": None}},
            created_project["revision"],
        )
        self.store.trash_projects([updated_project["id"]])
        self.store.delete_project_trash([updated_project["id"]])

        self.assertEqual(self.store.get_image_generation_run(created_run["id"]), created_run)
        page = self.store.list_image_generation_runs(project_id="project-one")
        self.assertEqual([item["id"] for item in page["runs"]], ["run-retained"])
        with self.assertRaises(MissingItem):
            self.store.get_project("project-one")

    def test_cursor_pagination_is_stable_and_filterable(self) -> None:
        fixtures = [
            run_payload("run-a", created_at=100),
            run_payload("run-c", created_at=300),
            run_payload("run-b", created_at=200),
            run_payload("run-other-node", node_id="node-two", created_at=250),
            run_payload("run-other-project", project_id="project-two", created_at=400),
        ]
        for fixture in fixtures:
            self.store.create_image_generation_run(fixture)

        first = self.store.list_image_generation_runs(project_id="project-one", node_id="node-one", limit=2)
        self.assertEqual([item["id"] for item in first["runs"]], ["run-c", "run-b"])
        self.assertIsInstance(first["nextCursor"], str)

        self.store.create_image_generation_run(run_payload("run-newer", created_at=500))
        second = self.store.list_image_generation_runs(
            project_id="project-one", node_id="node-one", cursor=first["nextCursor"], limit=2
        )
        self.assertEqual([item["id"] for item in second["runs"]], ["run-a"])
        self.assertIsNone(second["nextCursor"])

        with self.assertRaises(ValueError):
            self.store.list_image_generation_runs(limit=101)

    def test_rejects_sensitive_or_location_fields_anywhere_in_payload(self) -> None:
        for field in ("secret", "apiKey", "remoteUrl", "path"):
            payload = run_payload(f"run-{field}")
            payload["requestSnapshot"][field] = "must-not-persist"
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.store.create_image_generation_run(payload)


@unittest.skipUnless(TestClient and create_app, "FastAPI contract dependencies are not installed")
class ImageRunAppContractTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = JsonCollectionStore(Path(self.temp_dir.name, "data"))
        self.client = TestClient(create_app(self.store))

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_append_state_machine_snapshot_immutability_and_no_delete_route(self) -> None:
        original = run_payload("run-state")
        created = self.client.post("/api/image-generation-runs", json=original)
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.json()["state"], "queued")

        duplicate = self.client.post("/api/image-generation-runs", json=original)
        self.assertEqual(duplicate.status_code, 409)
        self.assertEqual(duplicate.json()["detail"]["code"], "duplicate_item")

        skipped_running = self.client.patch(
            "/api/image-generation-runs/run-state/state", json={"state": "succeeded", "outputAssetIds": ["asset.png"]}
        )
        self.assertEqual(skipped_running.status_code, 400)

        snapshot_patch = self.client.patch(
            "/api/image-generation-runs/run-state/state",
            json={"state": "running", "requestSnapshot": {"mode": "edit"}},
        )
        self.assertEqual(snapshot_patch.status_code, 400)
        self.assertEqual(self.client.get("/api/image-generation-runs/run-state").json()["state"], "queued")

        running = self.client.patch(
            "/api/image-generation-runs/run-state/state",
            json={"state": "running", "startedAt": 110},
        )
        self.assertEqual(running.status_code, 200)
        self.assertEqual(running.json()["requestSnapshot"], original["requestSnapshot"])

        succeeded = self.client.patch(
            "/api/image-generation-runs/run-state/state",
            json={
                "state": "succeeded",
                "providerRequestId": "provider-one",
                "outputAssetIds": ["asset.png"],
                "usage": {"inputImages": 0, "generatedImages": 1},
                "finishedAt": 120,
            },
        )
        self.assertEqual(succeeded.status_code, 200)
        self.assertEqual(succeeded.json()["state"], "succeeded")

        terminal_reversal = self.client.patch(
            "/api/image-generation-runs/run-state/state", json={"state": "running"}
        )
        self.assertEqual(terminal_reversal.status_code, 400)
        self.assertEqual(self.client.delete("/api/image-generation-runs/run-state").status_code, 405)

    def test_lists_runs_with_filters_cursor_and_limit_validation(self) -> None:
        for fixture in (
            run_payload("run-one", created_at=100),
            run_payload("run-two", created_at=200),
            run_payload("run-three", project_id="project-two", created_at=300),
        ):
            self.assertEqual(self.client.post("/api/image-generation-runs", json=fixture).status_code, 200)

        first = self.client.get(
            "/api/image-generation-runs", params={"projectId": "project-one", "nodeId": "node-one", "limit": 1}
        )
        self.assertEqual(first.status_code, 200)
        self.assertEqual([item["id"] for item in first.json()["runs"]], ["run-two"])
        second = self.client.get(
            "/api/image-generation-runs",
            params={"projectId": "project-one", "nodeId": "node-one", "limit": 1, "cursor": first.json()["nextCursor"]},
        )
        self.assertEqual([item["id"] for item in second.json()["runs"]], ["run-one"])
        self.assertEqual(self.client.get("/api/image-generation-runs", params={"limit": 101}).status_code, 400)

    def test_running_run_can_finish_failed_with_a_stable_error(self) -> None:
        self.assertEqual(
            self.client.post("/api/image-generation-runs", json=run_payload("run-failed")).status_code,
            200,
        )
        self.assertEqual(
            self.client.patch(
                "/api/image-generation-runs/run-failed/state", json={"state": "running", "startedAt": 110}
            ).status_code,
            200,
        )

        failed = self.client.patch(
            "/api/image-generation-runs/run-failed/state",
            json={
                "state": "failed",
                "error": {"code": "provider_busy", "message": "Provider busy", "retryable": True},
                "finishedAt": 120,
            },
        )

        self.assertEqual(failed.status_code, 200)
        self.assertEqual(failed.json()["state"], "failed")
        self.assertEqual(failed.json()["error"]["code"], "provider_busy")


if __name__ == "__main__":
    unittest.main()
