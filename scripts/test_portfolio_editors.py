"""Browser checks against isolated local data: python -m scripts.test_portfolio_editors."""
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
import time

import uvicorn
from playwright.sync_api import expect, sync_playwright
from backend import main


def run():
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for source in main.DATA_DIR.glob("*.json"):
            if source.name != "media-deletions.json":
                shutil.copyfile(source, root / source.name)
        main.DATA_DIR = root
        main.POSTS_PATH = root / "posts.json"
        main.get_supabase = lambda: None
        main.read_data.cache_clear()
        os.environ.update(JOURNAL_ADMIN_PASSWORD="browser-test", JOURNAL_TOKEN_SECRET="browser-test-secret")
        server = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=8011, log_level="error"))
        thread = threading.Thread(target=server.run, daemon=True); thread.start()
        for _ in range(100):
            if server.started: break
            time.sleep(.05)
        assert server.started
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
                page = browser.new_page(viewport={"width": 1280, "height": 1000})
                errors = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.goto("http://127.0.0.1:8011/experience")
                expect(page.locator(".timeline-card").first).to_be_visible()
                expect(page.get_by_role("button", name="Add experience", exact=True)).to_have_count(0)

                def sign_in():
                    dialog = page.get_by_role("dialog", name="Admin sign in", exact=True)
                    dialog.get_by_label("Admin password").fill("browser-test")
                    dialog.get_by_role("button", name="Sign in", exact=True).click()
                    expect(dialog).to_have_count(0)

                page.get_by_role("button", name="Admin sign in", exact=True).click(); sign_in()
                page.get_by_role("button", name="Add experience", exact=True).click()
                dialog = page.get_by_role("dialog", name="Add experience", exact=True)
                for label, value in [("Role", "Browser engineer"), ("Company", "Example team"), ("Location", "Remote"), ("Start date", "2026-09"), ("Summary", "Deliver useful software and maintain reliable systems.")]:
                    dialog.get_by_label(label, exact=True).fill(value)
                dialog.get_by_label("Highlights", exact=False).fill("First achievement\nSecond achievement")
                dialog.get_by_label("Technologies", exact=True).fill("Python")
                dialog.get_by_label("Technologies", exact=True).press("Enter")
                expect(dialog.get_by_role("button", name="Remove Python", exact=True)).to_be_visible()
                dialog.get_by_role("button", name="Add project", exact=True).click()
                dialog.get_by_label("Project name", exact=True).fill("Demo")
                dialog.get_by_label("Project URL", exact=True).fill("https://example.com")
                dialog.get_by_role("button", name="Add experience", exact=True).click()
                expect(page.get_by_role("heading", name="Browser engineer", exact=True)).to_be_visible()
                page.get_by_role("button", name="Edit Browser engineer at Example team", exact=True).click()
                dialog = page.get_by_role("dialog", name="Edit experience", exact=True)
                dialog.get_by_label("Role", exact=True).fill("Lead browser engineer")
                dialog.get_by_label("I currently work here").uncheck()
                dialog.get_by_label("End date", exact=True).fill("2027-01")
                dialog.get_by_role("button", name="Save changes", exact=True).click()
                expect(dialog).to_have_count(0)
                page.reload()
                expect(page.get_by_role("heading", name="Lead browser engineer", exact=True)).to_be_visible()
                page.get_by_role("button", name="Delete Lead browser engineer at Example team", exact=True).click()
                page.get_by_role("dialog").get_by_role("button", name="Cancel", exact=True).click()
                expect(page.get_by_role("heading", name="Lead browser engineer", exact=True)).to_be_visible()
                page.get_by_role("button", name="Delete Lead browser engineer at Example team", exact=True).click()
                page.get_by_role("dialog").get_by_role("button", name="Delete entry", exact=True).click()
                expect(page.get_by_role("heading", name="Lead browser engineer", exact=True)).to_have_count(0)
                print("Experience create, edit, reload persistence, project links, labels, and confirmed deletion passed.", flush=True)

                page.goto("http://127.0.0.1:8011/skills")
                page.get_by_role("button", name="Add category", exact=True).click()
                dialog = page.get_by_role("dialog", name="Add skill category", exact=True)
                dialog.get_by_label("Category name", exact=True).fill("Browser tools")
                dialog.get_by_label("Description", exact=True).fill("Tools used in a browser check.")
                dialog.get_by_label("Skills", exact=True).fill("Python")
                dialog.get_by_label("Skills", exact=True).press("Enter")
                dialog.get_by_role("button", name="Add category", exact=True).click()
                expect(page.get_by_role("heading", name="Browser tools", exact=True)).to_be_visible()
                page.get_by_role("button", name="Edit Browser tools", exact=True).click()
                dialog = page.get_by_role("dialog", name="Edit skill category", exact=True)
                dialog.get_by_role("button", name="Remove Python", exact=True).click()
                dialog.get_by_label("Skills", exact=True).fill("TypeScript")
                dialog.get_by_label("Skills", exact=True).press("Enter")
                dialog.get_by_label("Category name", exact=True).fill("Updated browser tools")
                failed = [False]
                def expire_once(route):
                    if route.request.method == "PUT" and not failed[0]:
                        failed[0] = True
                        route.fulfill(status=401, content_type="application/json", body=json.dumps({"detail": "Your session ended."}))
                    else: route.continue_()
                page.route("**/api/skills/categories/*", expire_once)
                dialog.get_by_role("button", name="Save changes", exact=True).click()
                expect(dialog).to_contain_text("Your edits are still here")
                dialog.get_by_role("button", name="Sign in", exact=True).click(); sign_in()
                expect(dialog.get_by_label("Category name", exact=True)).to_have_value("Updated browser tools")
                dialog.get_by_role("button", name="Save changes", exact=True).click()
                expect(dialog).to_have_count(0)
                page.reload()
                card = page.locator(".skill-card").filter(has=page.get_by_role("heading", name="Updated browser tools", exact=True))
                expect(card.locator(".skill-tags")).to_have_text("TypeScript")
                page.get_by_role("button", name="Edit overview", exact=True).click()
                dialog = page.get_by_role("dialog", name="Edit skills overview", exact=True)
                dialog.get_by_label("Introduction", exact=True).fill("A toolkit that evolves with my work.")
                dialog.get_by_label("How I work", exact=False).fill("Keep learning\nShip thoughtfully")
                dialog.get_by_role("button", name="Save changes", exact=True).click()
                expect(dialog).to_have_count(0)
                page.reload()
                expect(page.locator(".principles-list")).to_contain_text("Ship thoughtfully")
                page.get_by_role("button", name="Delete Updated browser tools", exact=True).click()
                page.get_by_role("dialog").get_by_role("button", name="Delete entry", exact=True).click()
                expect(page.get_by_role("heading", name="Updated browser tools", exact=True)).to_have_count(0)
                page.set_viewport_size({"width": 390, "height": 844})
                page.get_by_role("button", name="Add category", exact=True).click()
                page.get_by_role("dialog").screenshot(path=".venv/skills-editor-mobile.png")
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                page.get_by_role("dialog").get_by_role("button", name="Cancel", exact=True).click()
                page.get_by_role("button", name="Admin account", exact=True).click()
                page.get_by_role("button", name="Sign out", exact=True).click()
                expect(page.get_by_role("button", name="Add category", exact=True)).to_have_count(0)
                expect(page.locator(".portfolio-item-actions")).to_have_count(0)
                assert not errors, errors
                print("Skill category/label CRUD, overview editing, session recovery, mobile layout, and public-only controls passed.", flush=True)
                browser.close()
        finally:
            server.should_exit = True; thread.join(timeout=5)


if __name__ == "__main__":
    run()
