"""Serverless persistence, payload limits, and scheduled maintenance checks."""
import os
import unittest
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend import main


class VercelTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        environment = patch.dict(os.environ, {"VERCEL": "1", "CRON_SECRET": "test-cron-secret"})
        environment.start()
        self.addCleanup(environment.stop)

    def test_no_publishing_without_durable_database(self):
        with patch.object(main, "get_supabase", return_value=None):
            response = self.client.post("/api/auth/login", json={"password": "example"})
        self.assertEqual(response.status_code, 503)

    def test_no_local_uploads_even_with_database(self):
        with patch.dict(os.environ, {"JOURNAL_MEDIA_STORAGE": "local"}), \
             patch.object(main, "get_supabase", return_value=MagicMock()), \
             patch.object(main.Path, "mkdir") as mkdir:
            with self.assertRaises(HTTPException) as error:
                main.store_upload(b"file", "a" * 32, {"name": "file.txt"})
        self.assertEqual(error.exception.status_code, 503)
        mkdir.assert_not_called()

    def test_oversized_upload_is_rejected_before_storage(self):
        main.app.dependency_overrides[main.require_admin] = lambda: None
        try:
            with patch.object(main, "store_upload") as store:
                response = self.client.post("/api/uploads?name=large.txt",
                                            content=b"x" * (4 * 1024 * 1024 + 1))
            self.assertEqual(response.status_code, 413)
            store.assert_not_called()
        finally:
            main.app.dependency_overrides.pop(main.require_admin, None)

    def test_large_existing_download_bypasses_function_payload(self):
        media = {"storage": "dropbox", "size": 5 * 1024 * 1024, "dropbox_file_id": "id:abc"}
        with patch.object(main, "uploaded_media", return_value=media), \
             patch.object(main.dropbox_storage, "temporary_link", return_value="https://example.com/file"), \
             patch.object(main.dropbox_storage, "download") as download:
            response = self.client.get("/api/uploads/" + "a" * 32, follow_redirects=False)
        self.assertEqual(response.status_code, 307)
        self.assertEqual(response.headers["cache-control"], "no-store")
        download.assert_not_called()

    def test_cron_requires_secret_and_runs_cleanup(self):
        with patch.object(main.media_cleanup, "cleanup_pending") as cleanup:
            for headers in ({}, {"Authorization": "Bearer wrong"}):
                self.assertEqual(self.client.get("/api/cron/media-cleanup", headers=headers).status_code, 401)
            cleanup.assert_not_called()
            response = self.client.get("/api/cron/media-cleanup",
                                       headers={"Authorization": "Bearer test-cron-secret"})
            self.assertEqual(response.status_code, 200)
            cleanup.assert_called_once()

    def test_vercel_lifespan_does_not_start_background_loop(self):
        with patch.object(main.media_cleanup.asyncio, "create_task") as create_task:
            with TestClient(main.app) as client:
                self.assertEqual(client.get("/api/profile").status_code, 200)
            create_task.assert_not_called()


if __name__ == "__main__":
    unittest.main()
