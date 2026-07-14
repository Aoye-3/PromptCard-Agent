import sqlite3
import tempfile
import unittest
from pathlib import Path

from promptcard_storage.store import JsonCollectionStore


class ImageRunBackupTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = JsonCollectionStore(Path(self.temp_dir.name, "data"))

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_backup_contains_schema_v3_run_and_its_output_asset(self) -> None:
        content = b"\x89PNG\r\n\x1a\ngenerated"
        asset = self.store.save_asset("generated.png", "image/png", content)
        run = self.store.create_image_generation_run({
            "id": "run-backup",
            "projectId": "project-deleted",
            "nodeId": "node-deleted",
            "connectionId": "connection-one",
            "providerId": "volcengine-ark",
            "modelId": "doubao-seedream-5-0-pro-260628",
            "state": "queued",
            "requestSnapshot": {"mode": "generate"},
            "outputAssetIds": [],
            "createdAt": 1,
        })
        self.store.update_image_generation_run_state(run["id"], {"state": "running", "startedAt": 2})
        self.store.update_image_generation_run_state(
            run["id"], {"state": "succeeded", "outputAssetIds": [asset["id"]], "finishedAt": 3}
        )
        destination = Path(self.temp_dir.name, "backup")

        manifest = self.store.backup(destination)

        self.assertEqual(manifest["schemaVersion"], 3)
        self.assertEqual((destination / "assets" / asset["id"]).read_bytes(), content)
        connection = sqlite3.connect(destination / "promptcard.sqlite3")
        try:
            row = connection.execute(
                "SELECT state, payload_json FROM image_generation_runs WHERE id='run-backup'"
            ).fetchone()
            version = connection.execute("SELECT MAX(version) FROM schema_migrations").fetchone()[0]
        finally:
            connection.close()
        self.assertEqual(row[0], "succeeded")
        self.assertIn(asset["id"], row[1])
        self.assertEqual(version, 3)


if __name__ == "__main__":
    unittest.main()
