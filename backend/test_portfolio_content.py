import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient
from backend import main, portfolio_content


class PortfolioContentTests(unittest.TestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.root = Path(directory.name)
        (self.root / "experience.json").write_text("[]", encoding="utf-8")
        (self.root / "skills.json").write_text(json.dumps({"intro": "Original intro", "principles": ["Keep it simple"], "categories": []}), encoding="utf-8")
        for mocked in (patch.object(main, "DATA_DIR", self.root), patch.object(main, "get_supabase", return_value=None),
                       patch.dict(os.environ, {"JOURNAL_ADMIN_PASSWORD": "test-password", "JOURNAL_TOKEN_SECRET": "test-secret"})):
            mocked.start(); self.addCleanup(mocked.stop)
        self.client = TestClient(main.app)
        token = self.client.post("/api/auth/login", json={"password": "test-password"}).json()["access_token"]
        self.headers = {"Authorization": "Bearer " + token}
        self.experience = {"company": "Example", "role": "Engineer", "location": "Remote", "start": "2024-06", "end": None,
                           "summary": "Build and maintain useful applications.", "highlights": ["Delivered a product"], "technologies": ["Python"],
                           "projects": [{"name": "Project", "href": "https://example.com", "period": "2024"}]}
        self.category = {"name": "Engineering", "description": "Tools I use", "accent": "blue", "items": ["Python", "React"]}

    def test_experience_crud_is_publicly_readable_and_persistent(self):
        created = self.client.post("/api/experience", json=self.experience, headers=self.headers)
        self.assertEqual(created.status_code, 201, created.text)
        item = created.json()
        older = self.client.post("/api/experience", json={**self.experience, "start": "2020-01", "end": "2023-12"}, headers=self.headers).json()
        self.assertEqual([entry["id"] for entry in self.client.get("/api/experience").json()], [item["id"], older["id"]])
        changed = {**self.experience, "role": "Lead engineer", "technologies": ["Go"], "projects": [], "highlights": []}
        response = self.client.put("/api/experience/" + item["id"], json=changed, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["id"], item["id"])
        saved = json.loads((self.root / "experience.json").read_text())
        self.assertEqual(saved[0]["role"], "Lead engineer")
        for entry in [item, older]:
            self.assertEqual(self.client.delete("/api/experience/" + entry["id"], headers=self.headers).status_code, 200)
        self.assertEqual(self.client.get("/api/experience").json(), [])

    def test_skills_categories_labels_and_overview_crud(self):
        response = self.client.post("/api/skills/categories", json=self.category, headers=self.headers)
        self.assertEqual(response.status_code, 201, response.text)
        item = response.json()
        changed = {**self.category, "name": "Updated category", "items": ["TypeScript"]}
        response = self.client.put("/api/skills/categories/" + item["id"], json=changed, headers=self.headers)
        self.assertEqual(response.status_code, 200)
        overview = {"intro": "A new introduction", "principles": ["One principle", "Another principle"]}
        self.assertEqual(self.client.patch("/api/skills", json=overview, headers=self.headers).status_code, 200)
        content = self.client.get("/api/skills").json()
        self.assertEqual(content["intro"], overview["intro"])
        self.assertEqual(content["categories"][0]["items"], ["TypeScript"])
        self.assertEqual(content["categories"][0]["id"], item["id"])
        self.assertEqual(self.client.delete("/api/skills/categories/" + item["id"], headers=self.headers).status_code, 200)
        self.client.patch("/api/skills", json={**overview, "principles": []}, headers=self.headers)
        content = self.client.get("/api/skills").json()
        self.assertEqual(content["categories"], [])
        self.assertEqual(content["principles"], [])

    def test_all_mutations_require_admin(self):
        for method, path, body in [
            ("post", "/api/experience", self.experience), ("put", "/api/experience/missing", self.experience),
            ("delete", "/api/experience/missing", None), ("post", "/api/skills/categories", self.category),
            ("put", "/api/skills/categories/missing", self.category), ("delete", "/api/skills/categories/missing", None),
            ("patch", "/api/skills", {"intro": "Intro", "principles": []}),
        ]:
            for headers in ({}, {"Authorization": "Bearer 1.invalid"}):
                response = self.client.request(method, path, json=body, headers=headers)
                self.assertEqual(response.status_code, 401, (method, path))
        self.assertEqual(self.client.get("/api/experience").status_code, 200)
        self.assertEqual(self.client.get("/api/skills").status_code, 200)

    def test_invalid_dates_links_fields_and_missing_records(self):
        for changes in ({"start": "2024-13"}, {"end": "2020-01"}, {"role": "   "},
                        {"projects": [{"name": "Unsafe", "href": "javascript:alert(1)"}]}, {"id": "client-selected"}):
            self.assertEqual(self.client.post("/api/experience", json={**self.experience, **changes}, headers=self.headers).status_code, 422)
        self.assertEqual(self.client.post("/api/skills/categories", json={**self.category, "accent": "invalid"}, headers=self.headers).status_code, 422)
        for path, body in [("/api/experience/missing", self.experience), ("/api/skills/categories/missing", self.category)]:
            self.assertEqual(self.client.put(path, json=body, headers=self.headers).status_code, 404)
            self.assertEqual(self.client.delete(path, headers=self.headers).status_code, 404)

    def test_supabase_writes_use_versions_and_fail_without_silent_fallback(self):
        client = MagicMock()
        table = client.table.return_value
        read = table.select.return_value.eq.return_value.limit.return_value.retry.return_value.execute
        read.return_value.data = [{"payload": [], "version": 7}]
        write = table.update.return_value.eq.return_value.eq.return_value.execute
        write.return_value.data = [{"key": "experience"}]
        with patch.object(main, "get_supabase", return_value=client):
            response = self.client.post("/api/experience", json=self.experience, headers=self.headers)
            self.assertEqual(response.status_code, 201)
            written = table.update.call_args.args[0]
            self.assertEqual(written["version"], 8)
            self.assertEqual(written["payload"][0]["role"], "Engineer")
            table.update.return_value.eq.assert_called_with("key", "experience")
            table.update.return_value.eq.return_value.eq.assert_called_with("version", 7)
            write.return_value.data = []
            self.assertEqual(self.client.post("/api/experience", json=self.experience, headers=self.headers).status_code, 409)
            write.side_effect = RuntimeError("offline")
            self.assertEqual(self.client.post("/api/experience", json=self.experience, headers=self.headers).status_code, 502)
            read.return_value.data = []
            self.assertEqual(self.client.get("/api/experience").status_code, 503)
        self.assertEqual(json.loads((self.root / "experience.json").read_text()), [])

    def test_local_category_ids_remain_stable_when_deleting_previous_category(self):
        content = {"intro": "Intro", "principles": [], "categories": [{**self.category, "name": name} for name in ["First", "Second"]]}
        (self.root / "skills.json").write_text(json.dumps(content))
        categories = self.client.get("/api/skills").json()["categories"]
        self.client.delete("/api/skills/categories/" + categories[0]["id"], headers=self.headers)
        self.assertEqual(self.client.get("/api/skills").json()["categories"][0]["id"], categories[1]["id"])


if __name__ == "__main__":
    unittest.main()
