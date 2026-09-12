import io
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from PIL import Image

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


if __name__ == "__main__":
    unittest.main()
