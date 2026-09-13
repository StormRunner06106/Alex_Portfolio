import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from PIL import Image
from httpx import ReadTimeout, RemoteProtocolError
from supabase import PostgrestAPIError

from backend import main


class ArticleMediaTests(unittest.TestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        (root / "posts.json").write_text("[]", encoding="utf-8")
        for mocked in (
            patch.object(main, "DATA_DIR", root),
            patch.object(main, "POSTS_PATH", root / "posts.json"),
            patch.object(main, "UPLOAD_DIR", root / "uploads"),
            patch.object(main, "get_supabase", return_value=None),
            patch.dict(os.environ, {"JOURNAL_ADMIN_PASSWORD": "test-password", "JOURNAL_TOKEN_SECRET": "test-secret"}),
        ):
            mocked.start()
            self.addCleanup(mocked.stop)
        main.read_data.cache_clear()
        self.addCleanup(main.read_data.cache_clear)
        self.client = TestClient(main.app)
        token = self.client.post("/api/auth/login", json={"password": "test-password"}).json()["access_token"]
        self.headers = {"Authorization": f"Bearer {token}"}

    def upload(self, data, purpose="attachment", name="photo.png"):
        return self.client.post("/api/uploads", params={"name": name, "purpose": purpose}, content=data, headers=self.headers)

    def test_media_survives_publish_and_can_be_retrieved(self):
        image = io.BytesIO()
        Image.new("RGB", (20, 20), "green").save(image, format="PNG")
        banner_response = self.upload(image.getvalue(), "banner")
        self.assertEqual(banner_response.status_code, 201)
        banner = banner_response.json()
        attachment = self.upload(b"Supporting notes", name="notes.txt").json()
        document = {"type": "doc", "content": [
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "First section"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "an opening paragraph with enough text to publish this article."}]},
            {"type": "heading", "attrs": {"level": 2}, "content": [{"type": "text", "text": "Second section"}]},
            {"type": "paragraph", "content": [{"type": "text", "text": "the next section keeps its separate heading and body."}]},
        ]}
        response = self.client.post("/api/posts", headers=self.headers, json={
            "title": "An article with media", "excerpt": "A useful introduction to this test article.",
            "published_at": "2026-09-12", "read_time": 3, "tags": ["AI"],
            "content": document, "banner": banner, "attachments": [attachment],
        })
        self.assertEqual(response.status_code, 201, response.text)
        post = self.client.get("/api/posts/an-article-with-media").json()
        self.assertEqual(post["content"], document)
        self.assertEqual(post["attachments"], [attachment])
        self.assertEqual(self.client.get("/api/posts").json()[0]["banner"], banner)
        self.assertEqual(json.loads(main.POSTS_PATH.read_text())[0]["banner"], banner)
        photo = self.client.get(banner["url"])
        self.assertEqual(photo.content, image.getvalue())
        self.assertEqual(photo.headers["content-type"], "image/png")
        file = self.client.get(attachment["url"])
        self.assertIn("attachment", file.headers["content-disposition"])
        self.assertEqual(file.content, b"Supporting notes")

    def test_invalid_uploads_and_unauthenticated_requests(self):
        self.assertEqual(self.client.post("/api/uploads?name=a.txt", content=b"test").status_code, 401)
        self.assertEqual(self.upload(b"not a photo", "banner").status_code, 422)
        self.assertEqual(self.upload(b"").status_code, 422)
        self.assertEqual(self.upload(b"x" * (8 * 1024 * 1024 + 1), "banner").status_code, 413)
        self.assertEqual(self.client.get("/api/uploads/invalid").status_code, 404)
        unsafe = self.upload(b"<script>alert(1)</script>", name="page.html").json()
        downloaded = self.client.get(unsafe["url"])
        self.assertEqual(downloaded.headers["content-type"], "application/octet-stream")
        self.assertEqual(downloaded.headers["x-content-type-options"], "nosniff")
        self.assertIn("attachment", downloaded.headers["content-disposition"])

    def article_payload(self):
        return {
            "title": "An editable article", "excerpt": "An introduction with enough detail for readers.",
            "published_at": "2026-09-12", "read_time": 3, "tags": ["Custom topic"],
            "content": {"type": "doc", "content": [{"type": "paragraph", "content": [
                {"type": "text", "text": "An original article body with enough text to validate and publish."}
            ]}]},
        }

    def test_admin_role_and_protected_crud(self):
        self.assertEqual(self.client.post("/api/auth/login", json={"password": "wrong"}).status_code, 401)
        session = self.client.get("/api/auth/session", headers=self.headers)
        self.assertEqual(session.json(), {"authenticated": True, "role": "admin"})
        payload = self.article_payload()
        self.assertEqual(self.client.post("/api/posts", json=payload).status_code, 401)
        created = self.client.post("/api/posts", json=payload, headers=self.headers).json()
        path = f'/api/posts/{created["slug"]}'
        for headers in ({}, {"Authorization": "Bearer 1.invalid"}):
            self.assertEqual(self.client.put(path, json=payload, headers=headers).status_code, 401)
            self.assertEqual(self.client.delete(path, headers=headers).status_code, 401)
        self.assertEqual(self.client.get(path).json()["title"], payload["title"])

        payload["title"] = "The updated article title"
        payload["tags"] = ["Updated topic"]
        payload["attachments"] = [self.upload(b"updated notes", name="notes.txt").json()]
        updated = self.client.put(path, json=payload, headers=self.headers)
        self.assertEqual(updated.status_code, 200, updated.text)
        self.assertEqual(updated.json()["slug"], created["slug"])
        self.assertEqual(self.client.get(path).json()["attachments"], payload["attachments"])
        self.assertEqual(self.client.get("/api/posts").json()[0]["title"], payload["title"])
        invalid = {**payload, "content": {"type": "doc", "content": []}}
        self.assertEqual(self.client.put(path, json=invalid, headers=self.headers).status_code, 422)
        self.assertEqual(self.client.put("/api/posts/missing", json=payload, headers=self.headers).status_code, 404)
        self.assertEqual(self.client.delete(path, headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.client.get("/api/posts").json(), [])
        self.assertEqual(json.loads(main.POSTS_PATH.read_text()), [])
        self.assertEqual(self.client.delete(path, headers=self.headers).status_code, 404)

    def test_supabase_update_delete_are_scoped_and_report_failures(self):
        client = MagicMock()
        table = client.table.return_value
        payload = self.article_payload()
        table.update.return_value.eq.return_value.execute.return_value.data = [{**payload, "slug": "original-url"}]
        table.delete.return_value.eq.return_value.execute.return_value.data = [{"slug": "original-url"}]
        with patch.object(main, "get_supabase", return_value=client):
            updated = self.client.put("/api/posts/original-url", json=payload, headers=self.headers)
            self.assertEqual(updated.status_code, 200)
            table.update.return_value.eq.assert_called_once_with("slug", "original-url")
            self.assertEqual(self.client.delete("/api/posts/original-url", headers=self.headers).status_code, 200)
            table.delete.return_value.eq.assert_called_once_with("slug", "original-url")
            table.update.return_value.eq.return_value.execute.return_value.data = []
            self.assertEqual(self.client.put("/api/posts/missing", json=payload, headers=self.headers).status_code, 404)
            table.delete.return_value.eq.return_value.execute.return_value.data = []
            self.assertEqual(self.client.delete("/api/posts/missing", headers=self.headers).status_code, 404)
            table.update.return_value.eq.return_value.execute.side_effect = RuntimeError("offline")
            self.assertEqual(self.client.put("/api/posts/original-url", json=payload, headers=self.headers).status_code, 502)
            table.delete.return_value.eq.return_value.execute.side_effect = RuntimeError("offline")
            self.assertEqual(self.client.delete("/api/posts/original-url", headers=self.headers).status_code, 502)

    def test_journal_reads_retry_transient_errors_but_remain_public(self):
        client = MagicMock()
        query = MagicMock()
        query.retry.return_value = query
        client.table.return_value.select.return_value.order.return_value = query
        client.table.return_value.select.return_value.eq.return_value.limit.return_value = query
        article = {**self.article_payload(), "slug": "test-article", "accent": "mint"}
        response = MagicMock(data=[article])
        with patch.object(main, "get_supabase", return_value=client), patch.object(main.time, "sleep"):
            for path in ("/api/posts", "/api/posts/test-article"):
                for failure in (
                    RemoteProtocolError("connection ended"),
                    ReadTimeout("read timed out"),
                    PostgrestAPIError({"code": "503", "message": "unavailable"}),
                ):
                    query.execute.reset_mock()
                    query.execute.side_effect = [failure, response]
                    result = self.client.get(path)  # No admin token: reading stays public.
                    self.assertEqual(result.status_code, 200, result.text)
                    self.assertEqual(query.execute.call_count, 2)
                query.execute.reset_mock()
                query.execute.side_effect = ReadTimeout("offline")
                self.assertEqual(self.client.get(path).status_code, 502)
                self.assertEqual(query.execute.call_count, 2)
                query.execute.reset_mock()
                query.execute.side_effect = PostgrestAPIError({"code": "42P01", "message": "missing table"})
                self.assertEqual(self.client.get(path).status_code, 502)
                self.assertEqual(query.execute.call_count, 1)
            query.execute.side_effect = None
            query.execute.return_value = MagicMock(data=[])
            self.assertEqual(self.client.get("/api/posts").json(), [])
            self.assertEqual(self.client.get("/api/posts/missing").status_code, 404)


if __name__ == "__main__":
    unittest.main()
