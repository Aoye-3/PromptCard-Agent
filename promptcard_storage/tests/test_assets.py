import tempfile
import unittest
from pathlib import Path

from promptcard_storage.store import AssetValidationError, JsonCollectionStore, MissingItem


TEST_TEMP_ROOT = Path(__file__).resolve().parents[2] / ".test-tmp" / "task3-assets"
TEST_TEMP_ROOT.mkdir(parents=True, exist_ok=True)


class AssetStoreTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory(dir=TEST_TEMP_ROOT)
        self.assertTrue(Path(self.temp_dir.name).is_relative_to(TEST_TEMP_ROOT))
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

    def test_saves_and_reads_supported_video_assets(self) -> None:
        mp4_content = b'\x00\x00\x00\x18ftypmp42video'
        mp4_asset = self.store.save_asset('clip.mp4', 'video/mp4', mp4_content)
        mp4_path, mp4_content_type = self.store.get_asset(mp4_asset['id'])

        self.assertEqual(mp4_asset['contentType'], 'video/mp4')
        self.assertEqual(mp4_asset['size'], len(mp4_content))
        self.assertEqual(mp4_path.read_bytes(), mp4_content)
        self.assertEqual(mp4_content_type, 'video/mp4')

        webm_content = b'\x1a\x45\xdf\xa3webm'
        webm_asset = self.store.save_asset('clip.webm', 'video/webm', webm_content)
        webm_path, webm_content_type = self.store.get_asset(webm_asset['id'])

        self.assertEqual(webm_asset['contentType'], 'video/webm')
        self.assertEqual(webm_path.read_bytes(), webm_content)
        self.assertEqual(webm_content_type, 'video/webm')

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

        with self.assertRaises(AssetValidationError):
            self.store.save_asset('fake.mp4', 'video/mp4', b'not-an-mp4')

        with self.assertRaises(AssetValidationError):
            self.store.save_asset('fake.webm', 'video/webm', b'not-a-webm')

    def test_rejects_asset_path_traversal(self) -> None:
        with self.assertRaises(MissingItem):
            self.store.get_asset('../projects.json')

    def test_successful_run_output_assets_are_counted_as_strong_references(self) -> None:
        asset = self.store.save_asset('generated.png', 'image/png', b'\x89PNG\r\n\x1a\ngenerated')
        queued_only = self.store.save_asset('input.png', 'image/png', b'\x89PNG\r\n\x1a\ninput')
        run = self.store.create_image_generation_run({
            'id': 'run-generated',
            'projectId': 'deleted-project',
            'nodeId': 'deleted-node',
            'connectionId': 'connection-one',
            'providerId': 'volcengine-ark',
            'modelId': 'doubao-seedream-5-0-pro-260628',
            'state': 'queued',
            'requestSnapshot': {'mode': 'edit', 'inputs': [{'assetId': queued_only['id']}]},
            'outputAssetIds': [],
            'createdAt': 1,
        })
        self.store.update_image_generation_run_state(run['id'], {'state': 'running', 'startedAt': 2})
        self.store.update_image_generation_run_state(run['id'], {
            'state': 'succeeded', 'outputAssetIds': [asset['id']], 'finishedAt': 3,
        })

        unreferenced = self.store.diagnose_assets()['unreferencedAssets']
        self.assertNotIn(asset['id'], unreferenced)
        self.assertIn(queued_only['id'], unreferenced)


if __name__ == '__main__':
    unittest.main()
