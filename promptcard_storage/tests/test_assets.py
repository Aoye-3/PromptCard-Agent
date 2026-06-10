import tempfile
import unittest
from pathlib import Path

from promptcard_storage.store import AssetValidationError, JsonCollectionStore, MissingItem


class AssetStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.store = JsonCollectionStore(Path(self.temp_dir.name))

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_saves_and_reads_supported_image_asset(self) -> None:
        content = b'\x89PNG\r\n\x1a\nimage'
        asset = self.store.save_asset('board.png', 'image/png', content)
        path, content_type = self.store.get_asset(asset['id'])

        self.assertEqual(asset['contentType'], 'image/png')
        self.assertEqual(asset['size'], len(content))
        self.assertEqual(path.read_bytes(), content)
        self.assertEqual(content_type, 'image/png')

    def test_health_reports_asset_capability(self) -> None:
        health = self.store.health()

        self.assertTrue(health['capabilities']['assets'])

    def test_rejects_unsupported_or_oversized_assets(self) -> None:
        with self.assertRaises(AssetValidationError):
            self.store.save_asset('board.gif', 'image/gif', b'gif')

        with self.assertRaises(AssetValidationError):
            self.store.save_asset('board.png', 'image/png', b'x' * 11, max_bytes=10)

        with self.assertRaises(AssetValidationError):
            self.store.save_asset('fake.png', 'image/png', b'not-a-png')

    def test_rejects_asset_path_traversal(self) -> None:
        with self.assertRaises(MissingItem):
            self.store.get_asset('../projects.json')


if __name__ == '__main__':
    unittest.main()
