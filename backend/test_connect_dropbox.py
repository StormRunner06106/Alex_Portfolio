"""OAuth setup must not persist a grant that cannot support article media."""
import io
import tempfile
import unittest
from contextlib import ExitStack, redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

from dotenv import dotenv_values
from dropbox import DropboxOAuth2FlowNoRedirect

from backend import connect_dropbox


class DropboxSetupTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        folder = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.env = folder / ".env"
        self.env.write_text(
            "DROPBOX_APP_KEY=file-key\nDROPBOX_APP_SECRET=file-secret\n"
            "DROPBOX_REFRESH_TOKEN=existing-token\n", encoding="utf-8"
        )
        self.stack.enter_context(patch.object(connect_dropbox, "__file__", str(folder / "connect_dropbox.py")))
        self.stack.enter_context(patch.dict("os.environ", {
            "DROPBOX_APP_KEY": "stale-shell-key", "DROPBOX_APP_SECRET": "stale-shell-secret"
        }))
        self.stack.enter_context(patch.object(connect_dropbox.getpass, "getpass", return_value="auth-code"))
        self.browser = self.stack.enter_context(patch.object(connect_dropbox.webbrowser, "open"))
        self.output = self.stack.enter_context(redirect_stdout(io.StringIO()))
        # Exercise real SDK URL generation, but never exchange a real code.
        self.finish = self.stack.enter_context(patch.object(DropboxOAuth2FlowNoRedirect, "finish"))
        self.finish.return_value = SimpleNamespace(
            refresh_token="new-token", scope=["files.content.read", "files.content.write"]
        )

    def test_opens_default_permissions_offline_url_for_env_file_app(self):
        connect_dropbox.main()
        url = urlparse(self.browser.call_args.args[0])
        self.assertEqual(url.hostname, "www.dropbox.com")
        self.assertEqual(parse_qs(url.query), {
            "client_id": ["file-key"], "response_type": ["code"], "token_access_type": ["offline"]
        })
        settings = dotenv_values(self.env)
        self.assertEqual(settings["DROPBOX_REFRESH_TOKEN"], "new-token")
        self.assertEqual(settings["JOURNAL_MEDIA_STORAGE"], "dropbox")
        for secret in ("new-token", "existing-token", "file-secret", "auth-code"):
            self.assertNotIn(secret, self.output.getvalue())

    def test_missing_permissions_preserves_existing_credentials(self):
        original = self.env.read_bytes()
        self.finish.return_value.scope = ["account_info.read"]
        with self.assertRaisesRegex(SystemExit, "files.content.read, files.content.write"):
            connect_dropbox.main()
        self.assertEqual(self.env.read_bytes(), original)

    def test_unknown_permissions_preserves_existing_credentials(self):
        original = self.env.read_bytes()
        self.finish.return_value.scope = None
        with self.assertRaisesRegex(SystemExit, "did not grant"):
            connect_dropbox.main()
        self.assertEqual(self.env.read_bytes(), original)

    def test_string_scopes_are_accepted(self):
        self.finish.return_value.scope = "files.content.read files.content.write"
        connect_dropbox.main()
        self.assertEqual(dotenv_values(self.env)["DROPBOX_REFRESH_TOKEN"], "new-token")

    def test_exchange_failure_does_not_print_secret_or_overwrite_token(self):
        original = self.env.read_bytes()
        self.finish.side_effect = RuntimeError("sensitive-response-token")
        with self.assertRaises(SystemExit) as error:
            connect_dropbox.main()
        self.assertNotIn("sensitive-response-token", str(error.exception))
        self.assertEqual(self.env.read_bytes(), original)

    def test_missing_refresh_token_preserves_existing_credentials(self):
        original = self.env.read_bytes()
        self.finish.return_value.refresh_token = None
        with self.assertRaisesRegex(SystemExit, "did not issue a refresh token"):
            connect_dropbox.main()
        self.assertEqual(self.env.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
