import unittest
from unittest.mock import MagicMock, patch
from httpx import ReadTimeout
from supabase import PostgrestAPIError
from fastapi import HTTPException

from backend import main, media_cleanup, media_registry


class MediaRegistryTests(unittest.TestCase):
    def setUp(self):
        self.client = MagicMock()
        self.table = self.client.table.return_value
        self.write = self.table.upsert.return_value.retry.return_value.execute
        self.read = self.table.select.return_value.in_.return_value.retry.return_value.execute
        self.records = [{"upload_id": char * 32, "metadata": {
            "url": "/api/uploads/" + char * 32, "storage": "dropbox", "dropbox_file_id": "id:file_" + char,
            "name": "photo.png", "media_type": "image/png", "size": 100,
        }} for char in ("a", "b")]
        self.read.return_value.data = []
        sleep = patch.object(media_registry.time, "sleep")
        sleep.start(); self.addCleanup(sleep.stop)

    def test_queue_retries_gateway_timeout_with_identical_records(self):
        self.write.side_effect = [PostgrestAPIError({"code": "504", "message": "Gateway Timeout"}), MagicMock(data=self.records)]
        by_id = {row["upload_id"]: row["metadata"] for row in self.records}
        with patch.object(main, "get_supabase", return_value=self.client), patch.object(main, "uploaded_media", side_effect=lambda uid: by_id[uid]):
            media_cleanup.enqueue(list(by_id.values()))
        self.assertEqual(self.write.call_count, 2)
        for call in self.table.upsert.call_args_list:
            self.assertEqual(call.args[0], self.records)
            self.assertEqual(call.kwargs, {"on_conflict": "upload_id"})

    def test_committed_timeout_is_confirmed_without_another_write(self):
        self.write.side_effect = ReadTimeout("response lost after commit")
        self.read.return_value.data = list(reversed(self.records))
        media_registry.upsert(self.client, "article_media_deletions", self.records)
        self.assertEqual(self.write.call_count, 1)

    def test_empty_response_checks_every_record_before_success(self):
        self.write.side_effect = [MagicMock(data=[]), MagicMock(data=self.records)]
        self.read.return_value.data = self.records[:1]
        media_registry.upsert(self.client, "article_media", self.records)
        self.assertEqual(self.write.call_count, 2)

    def test_empty_response_with_all_records_saved_is_success(self):
        self.write.return_value.data = []
        self.read.return_value.data = self.records
        media_registry.upsert(self.client, "article_media", self.records)
        self.assertEqual(self.write.call_count, 1)

    def test_exhausted_retries_still_block_article_mutation(self):
        self.write.side_effect = ReadTimeout("offline")
        by_id = {row["upload_id"]: row["metadata"] for row in self.records}
        with patch.object(main, "get_supabase", return_value=self.client), patch.object(main, "uploaded_media", side_effect=lambda uid: by_id[uid]), patch.object(main, "post_by_slug", return_value={"banner": self.records[0]["metadata"], "attachments": [self.records[1]["metadata"]]}):
            with self.assertRaises(HTTPException) as error:
                main.delete_post("existing-article")
        self.assertEqual(error.exception.status_code, 502)
        self.assertEqual(self.write.call_count, 3)
        self.table.delete.assert_not_called()

    def test_configuration_errors_are_not_retried(self):
        self.write.side_effect = PostgrestAPIError({"code": "42501", "message": "permission denied"})
        with self.assertRaises(PostgrestAPIError):
            media_registry.upsert(self.client, "article_media", self.records)
        self.assertEqual(self.write.call_count, 1)
        self.read.assert_not_called()


if __name__ == "__main__":
    unittest.main()
