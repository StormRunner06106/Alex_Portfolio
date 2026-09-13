"""Browser regression: python -m scripts.test_attachment_reordering (build frontend first)."""
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import threading
import time
from uuid import uuid4

from PIL import Image
from playwright.sync_api import expect, sync_playwright
import uvicorn

from backend import main


def run():
    # A separate server and temporary local storage never change live articles or Dropbox.
    with tempfile.TemporaryDirectory() as directory:
        root = Path(directory)
        for source in main.DATA_DIR.glob("*.json"):
            if source.name != "media-deletions.json":
                shutil.copyfile(source, root / source.name)
        main.DATA_DIR, main.POSTS_PATH, main.UPLOAD_DIR = root, root / "posts.json", root / "uploads"
        main.get_supabase = lambda: None
        main.read_data.cache_clear()
        os.environ.update(JOURNAL_ADMIN_PASSWORD="browser-test", JOURNAL_TOKEN_SECRET="browser-test-secret", JOURNAL_MEDIA_STORAGE="local")
        photo = io.BytesIO()
        Image.new("RGB", (120, 100), "#537466").save(photo, format="PNG")
        media = []
        for name in ("First.png", "Second.png", "Third.png"):
            uid = uuid4().hex
            media.append(main.store_upload(photo.getvalue(), uid, {
                "url": "/api/uploads/" + uid, "name": name, "size": len(photo.getvalue()), "media_type": "image/png",
            }))
        article = {"slug": "reorder-check", "title": "Attachment ordering check", "excerpt": "Checking that the order is saved and displayed consistently.",
                   "published_at": "2026-09-13", "read_time": 2, "tags": ["AI"], "accent": "mint", "banner": None, "attachments": media,
                   "content": {"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "This article contains enough text to check reordering attachments and saving the resulting order."}]}]}}
        main.POSTS_PATH.write_text(json.dumps([article]), encoding="utf-8")
        server = uvicorn.Server(uvicorn.Config(main.app, host="127.0.0.1", port=8011, log_level="error"))
        thread = threading.Thread(target=server.run, daemon=True)
        thread.start()
        for _ in range(100):
            if server.started:
                break
            time.sleep(.05)
        assert server.started
        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
                errors = []

                def open_editor(page):
                    page.on("pageerror", lambda error: errors.append(str(error)))
                    token = main.issue_admin_token()[0]
                    page.add_init_script("sessionStorage.setItem('alex-journal-admin', " + json.dumps(token) + ");")
                    page.goto("http://127.0.0.1:8011/blog/reorder-check/edit")
                    expect(page.get_by_role("button", name="Save changes", exact=True)).to_be_enabled()
                    page.get_by_role("list", name="Attachment order").scroll_into_view_if_needed()

                def names(page, expected):
                    expect(page.locator(".upload-sortable-list .upload-file-info strong")).to_have_text(expected)

                def drag(page, source, target):
                    start, end = source.bounding_box(), target.bounding_box()
                    page.mouse.move(start["x"] + start["width"] / 2, start["y"] + start["height"] / 2)
                    page.mouse.down()
                    page.mouse.move(end["x"] + end["width"] / 2, end["y"] + end["height"] / 2, steps=15)
                    page.mouse.up()

                page = browser.new_page(viewport={"width": 1280, "height": 1000})
                open_editor(page)
                expect(page.get_by_role("button", name="Move First.png up", exact=True)).to_have_count(0)
                drag(page, page.get_by_role("button", name="Reorder First.png"), page.get_by_role("button", name="Reorder Third.png"))
                names(page, ["Second.png", "Third.png", "First.png"])
                page.wait_for_timeout(250)  # Let the previous drop transition finish.
                handle = page.get_by_role("button", name="Reorder First.png")
                handle.focus()
                page.keyboard.press("Space")
                expect(handle).to_have_attribute("aria-pressed", "true")
                page.wait_for_timeout(50)  # Keyboard sensor attaches its key listener after activation.
                page.keyboard.press("ArrowUp")
                page.wait_for_timeout(250)
                page.keyboard.press("Space")
                names(page, ["Second.png", "First.png", "Third.png"])
                page.wait_for_timeout(250)
                page.get_by_role("button", name="Reorder Second.png").focus()
                page.keyboard.press("Space")
                page.wait_for_timeout(50)
                page.keyboard.press("ArrowDown")
                page.keyboard.press("Escape")
                names(page, ["Second.png", "First.png", "Third.png"])
                drag(page, page.locator(".upload-file-info strong").filter(has_text="Second.png"), page.get_by_role("button", name="Reorder Third.png"))
                names(page, ["First.png", "Third.png", "Second.png"])
                page.get_by_role("button", name="Save changes", exact=True).click()
                expect(page).to_have_url("http://127.0.0.1:8011/blog/reorder-check")
                expect(page.locator(".article-attachments figcaption")).to_have_text(["First.png", "Third.png", "Second.png"])
                assert [m["name"] for m in json.loads(main.POSTS_PATH.read_text())[0]["attachments"]] == ["First.png", "Third.png", "Second.png"]
                print("Mouse handle/row drag, keyboard sorting, Escape cancellation, and saved article order passed.", flush=True)

                context = browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, reduced_motion="reduce")
                mobile = context.new_page()
                open_editor(mobile)
                first = mobile.get_by_role("button", name="Reorder First.png").bounding_box()
                last = mobile.get_by_role("button", name="Reorder Second.png").bounding_box()
                x, start, end = first["x"] + first["width"] / 2, first["y"] + first["height"] / 2, last["y"] + last["height"] / 2
                session = context.new_cdp_session(mobile)
                session.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": start}]})
                mobile.wait_for_timeout(200)
                for step in range(1, 16):
                    session.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x, "y": start + (end-start)*step/15}]})
                    mobile.wait_for_timeout(16)
                session.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
                names(mobile, ["Third.png", "Second.png", "First.png"])
                assert mobile.evaluate("document.documentElement.scrollWidth <= innerWidth")
                mobile.wait_for_timeout(100)  # The touch sensor briefly suppresses ghost clicks after dropping.
                mobile.screenshot(path=".venv/reorder-mobile.png")
                mobile.get_by_role("button", name="Remove Third.png", exact=True).tap()
                names(mobile, ["Second.png", "First.png"])
                mobile.get_by_role("button", name="Remove Second.png", exact=True).tap()
                names(mobile, ["First.png"])
                expect(mobile.get_by_role("button", name="Reorder First.png")).to_be_disabled()
                expect(mobile.get_by_role("button", name="Remove First.png", exact=True)).to_be_enabled()
                assert not errors, errors
                print("Touch drag, mobile layout, reduced motion, and single-file removal passed.", flush=True)
                browser.close()
        finally:
            server.should_exit = True
            thread.join(timeout=5)


if __name__ == "__main__":
    run()
