"""Browser checks for the built frontend: python -m scripts.test_theme.

Requires Playwright and Microsoft Edge. Uses an isolated static server and mocked
API reads; never signs into or changes the live portfolio.
"""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]


class StaticApp(SimpleHTTPRequestHandler):
    def do_GET(self):
        if not Path(urlsplit(self.path).path).suffix:
            self.path = "/index.html"
        super().do_GET()

    def log_message(self, *_):
        pass


def run():
    dist = ROOT / "frontend/dist"
    assert (dist / "index.html").is_file(), "Build the frontend first."
    fixtures = {
        f"/api/{name}": json.loads((ROOT / f"backend/data/{name}.json").read_text(encoding="utf-8"))
        for name in ("profile", "experience", "skills", "posts")
    }
    fixtures["/api/auth/session"] = {"role": "admin"}
    fixtures.update({f"/api/posts/{post['slug']}": post for post in fixtures["/api/posts"]})
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(StaticApp, directory=str(dist)))
    thread = Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base_url = f"http://127.0.0.1:{server.server_port}"
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(channel="msedge", headless=True)
            context = browser.new_context(base_url=base_url, color_scheme="light")
            context.route("**/api/**", lambda route: route.fulfill(json=fixtures.get(urlsplit(route.request.url).path, {})))
            context.route("https://**", lambda route: route.abort())
            page = context.new_page()
            errors = []
            page.on("pageerror", lambda error: errors.append(str(error)))
            page.goto("/")
            expect(page.locator("html")).to_have_attribute("data-theme", "light")
            page.emulate_media(color_scheme="dark")
            expect(page.locator("html")).to_have_attribute("data-theme", "dark")
            page.get_by_role("button", name="Switch to light mode").focus()
            page.keyboard.press("Enter")
            expect(page.locator("html")).to_have_attribute("data-theme", "light")
            page.reload()
            expect(page.locator("html")).to_have_attribute("data-theme", "light")
            other = context.new_page()
            other.goto("/")
            page.get_by_role("button", name="Switch to dark mode").click()
            expect(other.locator("html")).to_have_attribute("data-theme", "dark")
            other.close()

            for path in ("/", "/experience", "/skills", "/blog", f"/blog/{fixtures['/api/posts'][0]['slug']}", "/contact"):
                page.goto(path)
                expect(page.locator("html")).to_have_attribute("data-theme", "dark")
                expect(page.locator(".theme-toggle")).to_be_visible()

            for width in (1280, 901, 800, 721, 720, 600, 390, 320):
                page.set_viewport_size({"width": width, "height": 900})
                page.goto("/")
                expect(page.locator(".theme-toggle")).to_be_visible()
                brand = page.locator(".brand").bounding_box()
                nav = page.locator(".nav-shell" if width > 720 else ".menu-button").bounding_box()
                toggle = page.locator(".theme-toggle").bounding_box()
                account = page.locator(".header-signin").bounding_box()
                assert brand["x"] + brand["width"] <= nav["x"] + 1, width
                assert nav["x"] + nav["width"] <= toggle["x"] + 1, width
                assert toggle["x"] + toggle["width"] <= account["x"] + 1, width
                assert account["x"] + account["width"] <= width, width
                if width <= 720:
                    page.get_by_role("button", name="Open navigation").click()
                    page.get_by_role("navigation").get_by_role("link", name="Skills", exact=True).click()
                    expect(page.locator(".nav-shell")).not_to_be_visible()

            page.evaluate('sessionStorage.setItem("alex-journal-admin", `${Math.floor(Date.now() / 1000) + 3600}.isolated-test-token`)')
            page.reload()
            page.get_by_role("button", name="Admin account").click()
            expect(page.get_by_role("button", name="Sign out", exact=True)).to_be_visible()
            assert page.locator("dialog").evaluate("e => getComputedStyle(e).backgroundColor") == "rgb(20, 29, 25)"
            page.get_by_role("button", name="Sign out", exact=True).click()
            expect(page.locator("html")).to_have_attribute("data-theme", "dark")
            assert page.evaluate('localStorage.getItem("portfolio-theme")') == "dark"

            # Browser privacy restrictions must not break the toggle.
            restricted = browser.new_context(base_url=base_url, color_scheme="dark")
            restricted.route("**/api/**", lambda route: route.fulfill(json=fixtures.get(urlsplit(route.request.url).path, {})))
            restricted.route("https://**", lambda route: route.abort())
            restricted.add_init_script('Object.defineProperty(window, "localStorage", {get() { throw new DOMException("Blocked", "SecurityError"); }});')
            blocked = restricted.new_page()
            blocked.on("pageerror", lambda error: errors.append(str(error)))
            blocked.goto("/")
            expect(blocked.locator("html")).to_have_attribute("data-theme", "dark")
            blocked.get_by_role("button", name="Switch to light mode").click()
            expect(blocked.locator("html")).to_have_attribute("data-theme", "light")
            assert not errors, errors
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
    print("PASS: system preference, keyboard toggle, persistence, tab sync, six public routes, eight header widths, admin sign-out, and blocked storage.")


if __name__ == "__main__":
    run()
