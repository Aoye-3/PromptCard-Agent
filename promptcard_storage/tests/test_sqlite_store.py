import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

from promptcard_storage.store import (
    DuplicateItem,
    JsonCollectionStore,
    MigrationError,
)


def project(item_id: str, title: str) -> dict:
    return {
        "id": item_id,
        "title": title,
        "type": "card",
        "revision": 1,
        "pages": [],
        "currentPage": 0,
        "createdAt": 1,
        "updatedAt": 1,
        "lastOpenedAt": 1,
        "meta": {},
    }


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


class SqliteStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name, "data")
        self.data_dir.mkdir()

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_migrates_json_and_keeps_read_only_sources_with_backup(self) -> None:
        self.write_json("projects.json", {"schemaVersion": 1, "projects": [project("p1", "One")]})
        self.write_json("project-trash.json", {"schemaVersion": 1, "items": [{
            "id": "p2", "deletedAt": 2, "deletedBy": "user", "deleteReason": None,
            "payload": project("p2", "Two"),
        }]})
        self.write_json("prompt-library-presets.json", {"schemaVersion": 1, "presets": [preset("x", "X")]})
        self.write_json("prompt-library-trash.json", {"schemaVersion": 1, "items": []})
        original = (self.data_dir / "projects.json").read_bytes()

        store = JsonCollectionStore(self.data_dir)

        self.assertEqual([item["id"] for item in store.list_projects()], ["p1"])
        self.assertEqual([item["id"] for item in store.list_project_trash()], ["p2"])
        self.assertEqual((self.data_dir / "projects.json").read_bytes(), original)
        self.assertTrue((self.data_dir / "promptcard.sqlite3").is_file())
        backups = list((self.data_dir.parent / "backups").glob("storage-json-v1-*"))
        self.assertEqual(len(backups), 1)
        self.assertTrue((backups[0] / "projects.json").is_file())

    def test_rejects_corrupt_json_without_creating_database(self) -> None:
        (self.data_dir / "projects.json").write_text("{broken", encoding="utf-8")

        with self.assertRaises(MigrationError):
            JsonCollectionStore(self.data_dir)

        self.assertFalse((self.data_dir / "promptcard.sqlite3").exists())

    def test_rejects_duplicate_ids_across_active_and_trash(self) -> None:
        self.write_json("projects.json", {"projects": [project("same", "Active")]})
        self.write_json("project-trash.json", {"items": [{
            "id": "same", "deletedAt": 2, "deletedBy": "user", "payload": project("same", "Trash")
        }]})

        with self.assertRaises(MigrationError):
            JsonCollectionStore(self.data_dir)

    def test_deduplicates_identical_active_and_trash_payloads_in_favor_of_active(self) -> None:
        active = preset("same", "Same")
        trashed = {**active, "revision": 2, "updatedAt": 2}
        self.write_json("prompt-library-presets.json", {"presets": [active]})
        self.write_json("prompt-library-trash.json", {"items": [{
            "id": "same", "deletedAt": 2, "deletedBy": "user", "payload": trashed
        }]})

        store = JsonCollectionStore(self.data_dir)

        self.assertEqual([item["id"] for item in store.list_presets()], ["same"])
        self.assertEqual(store.list_preset_trash(), [])

    def test_different_project_updates_do_not_lose_data(self) -> None:
        store = JsonCollectionStore(self.data_dir)
        a = store.create_project(project("a", "A"))
        b = store.create_project(project("b", "B"))
        barrier = threading.Barrier(2)
        errors: list[Exception] = []

        def update(item_id: str, revision: int, title: str) -> None:
            try:
                barrier.wait()
                store.update_project(item_id, {"title": title}, revision)
            except Exception as error:
                errors.append(error)

        threads = [
            threading.Thread(target=update, args=("a", a["revision"], "A2")),
            threading.Thread(target=update, args=("b", b["revision"], "B2")),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(errors, [])
        self.assertEqual({item["id"]: item["title"] for item in store.list_projects()}, {"a": "A2", "b": "B2"})

    def test_trash_and_restore_are_single_transaction_updates(self) -> None:
        store = JsonCollectionStore(self.data_dir)
        store.create_project(project("p1", "One"))

        store.trash_projects(["p1"])
        self.assertEqual(store.list_projects(), [])
        self.assertEqual(store.list_project_trash()[0]["id"], "p1")

        store.restore_projects(["p1"])
        self.assertEqual(store.list_projects()[0]["id"], "p1")
        self.assertEqual(store.list_project_trash(), [])

    def test_duplicate_create_returns_domain_error(self) -> None:
        store = JsonCollectionStore(self.data_dir)
        store.create_project(project("p1", "One"))
        with self.assertRaises(DuplicateItem):
            store.create_project(project("p1", "Again"))

    def test_browser_import_is_idempotent_by_migration_id(self) -> None:
        store = JsonCollectionStore(self.data_dir)
        payload = {"migrationId": "browser-v1", "projects": [project("p1", "One")], "presets": []}
        first = store.migrate_browser_payload(payload)
        second = store.migrate_browser_payload(payload)

        self.assertEqual(first, {"projects": 1, "presets": 0, "alreadyApplied": False})
        self.assertEqual(second, {"projects": 0, "presets": 0, "alreadyApplied": True})

    def test_replaces_presets_atomically(self) -> None:
        store = JsonCollectionStore(self.data_dir, presets_seed=[preset("seed", "Seed")])
        current = store.list_presets()
        result = store.replace_presets([
            {**current[0], "label": "Changed"},
            preset("new", "New"),
        ])

        self.assertEqual([item["label"] for item in result], ["Changed", "New"])
        self.assertEqual(store.list_preset_trash(), [])

    def test_health_exposes_sqlite_identity_and_capabilities(self) -> None:
        store = JsonCollectionStore(self.data_dir)
        health = store.health()

        self.assertEqual(health["schemaVersion"], 1)
        self.assertEqual(health["serviceVersion"], "2.0.0")
        self.assertTrue(health["capabilities"]["sqlite"])
        self.assertTrue(health["capabilities"]["presetBatch"])
        self.assertIsInstance(health["pid"], int)

        connection = sqlite3.connect(self.data_dir / "promptcard.sqlite3")
        try:
            journal_mode = connection.execute("PRAGMA journal_mode").fetchone()[0]
            self.assertEqual(journal_mode.lower(), "wal")
        finally:
            connection.close()

    def test_backup_contains_consistent_database_assets_and_manifest(self) -> None:
        store = JsonCollectionStore(self.data_dir)
        store.create_project(project("p1", "One"))
        store.save_asset("image.png", "image/png", b"\x89PNG\r\n\x1a\nimage")
        destination = Path(self.temp_dir.name, "snapshot")

        manifest = store.backup(destination)

        self.assertEqual(manifest["schemaVersion"], 1)
        self.assertTrue((destination / "promptcard.sqlite3").is_file())
        self.assertTrue((destination / "manifest.json").is_file())
        self.assertEqual(len(list((destination / "assets").iterdir())), 1)

    def write_json(self, name: str, payload: dict) -> None:
        (self.data_dir / name).write_text(json.dumps(payload), encoding="utf-8")


if __name__ == "__main__":
    unittest.main()
